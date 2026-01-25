const asyncHandler = require('express-async-handler');
const ServiceRequest = require('../models/ServiceRequest.js');
const Service = require('../models/serviceModel.js');
const Category = require('../models/serviceCategory.js');
const Seeker = require('../models/seekerModel.js');
const {Geek} = require('../models/geekModel.js');
const haversine = require('haversine-distance');
const validateMongodbId = require('../utils/validateMongodbId.js');
const { default: mongoose } = require('mongoose');
const { generateSasUrl } = require('../utils/azureBlob.js');
const { uploadToAzure } = require('../middlewares/azureUploads.js');
const Review = require('../models/ReviewModel.js');
const sendExpoPushNotification = require('../utils/push.js');
const {Expo} = require('expo-server-sdk');
const expo = new Expo();
const client = require("../config/twilio");
const sendMail = require('../middlewares/sendMail');

 const getMatchedGeeks = asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const { questionnaireResponses, mode } = req.body;

  const service = await Service.findById(serviceId).populate('tags').populate('category');

  if (!service) return res.status(404).json({ message: 'Service not found' });

  // Match geeks with same skill tags
  let geeks = await Geek.find({
    $or: [
      { primarySkill: { $in: service.tags } },
      { secondarySkills: { $in: service.tags } },
      {primarySkill: { $in: service.category } },
      {secondarySkills: { $in: service.category }},
    ],
    modeOfService: { $in: [mode, 'All'] }
  }).select('fullName phone primarySkill secondarySkills rating availability certificates');

  if (mode === 'Offline' && seekerLocation) {
    geeks = geeks.filter(geek => {
      if (!geek.address?.coordinates) return false;
      const geekCoords = {
        lat: geek.address.coordinates.lat,
        lon: geek.address.coordinates.lng
      };
      const seekerCoords = {
        lat: seekerLocation.lat,
        lon: seekerLocation.lng
      };
      const distance = haversine(geekCoords, seekerCoords) / 1000; // in km
      return distance <= 15; // within 15km radius
    });
  }

  // Sort by rating DESC
  geeks.sort((a, b) => b.rating - a.rating);
  geeks.sort((geek)=>{
    if(geek.isAdhaarVerified === true){
      return -1
    }
    else{
      return 1
    }
  })

  res.status(200).json({
    geeks,
    questionnaireResponses
  });
});


const createRequestWithSelectedGeek = asyncHandler(async (req, res) => {
  const {
    geek,
    category,
    mode,
    location,
  } = req.body;

  let issue = req.body.issue;

   if(!req.user.id) return res.status(400).json({ message: 'User not found' });

  const seekerId = new mongoose.Types.ObjectId(req.user.id);

   validateMongodbId(seekerId);

  if(!category || !geek) return res.status(400).json({ message: 'Missing required fields' });


  const seeker = await Seeker.findById(seekerId);
  const geekState = await Geek.findById(geek);
  const catState = await Category.findById(category);

  if (!seeker) return res.status(404).json({ message: 'User not found' });
  if (!geekState) return res.status(404).json({ message: 'Geek not found' });
  if(!catState) return res.status(400).json({ message: 'The service category does not exist' });

  // Use seeker address as fallback
  const finalLocation = location || seeker.address;

  if (!finalLocation && mode === 'Offline') {
    return res.status(400).json({ message: 'Location is required for offline mode' });
  }

  if(!issue){
    issue = null;
  }

  const request = await ServiceRequest.create({
    category,
    seeker: seekerId,
    geek:geekState._id,
    mode,
    issue,
    location: finalLocation,
    status: 'Matched'
  });

  if (!request) {
    return res.status(500).json({ message: 'Error creating request' });
  }

  geekState.requests?.push(request?._id);
  await geekState.save();

  seeker.requests?.push(request?._id);
  await seeker.save();

  catState.requests?.push(request?._id);
  await catState.save();

  if (geekState.expoPushToken) {
    const token = geekState.expoPushToken;
    console.log(token);

    if (!Expo.isExpoPushToken(token)) {
        console.log("Invalid push token");
        throw new Error("Invalid push token", 400);
      }

      const message = {
        to: token,
        sound: "default",
        title: "Service Request Recieved",
        body: `You have a new service request for ${catState.title}`,
        data: {},
      };
          const tickets = await expo.sendPushNotificationsAsync([message]);
           console.log(tickets);
        }

        await client.messages.create({
          body: `You have a new service request for ${catState.title}. Please review it as soon as possible.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: geekState.mobile
        });

       if(seeker?.phone){
         await client.messages.create({
          body: `Your service request for ${catState.title} has been sent. We'll notify you once a Geek accepts your request.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: seeker?.phone
        });
       }else{
         const data={
            to:seeker.email,
            from:process.env.SMTP_EMAIL,
            subject:"Service Request Sent",
            text:
            `Hey ${seeker.fullName.first} ${seeker.fullName.last},
            
            Your service request for ${catState.title} has been sent. We'll notify you once a Geek accepts your request.`,

        }
        await sendMail(data)
       }

        

    
        
  res.status(201).json(request);
});


const getSeekerRequests = asyncHandler(async (req, res) => {
    
    const {id} = req.user;
    if(!id) return res.status(400).json({ message: 'User not found' });
    const requests = await ServiceRequest.find({ seeker: id }).populate('geek').populate('category').populate('issue');
    if(!requests) return res.status(404).json({ message: 'No requests found' });
    
    requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const deleted =  await ServiceRequest.deleteMany({
    seeker: id,
    geek: null,
  });

  console.log(deleted);
    
    
    for(let i = 0; i < requests.length; i++){
    if(requests[i].category?.image?.public_id){
      if(requests[i].category?.image.public_id){
        const blobName = requests[i].category.image.public_id;
        const sasUrl = await generateSasUrl(blobName);
        requests[i].category.image.url = sasUrl;
      }
    }
  }

  for(let i = 0; i < requests.length; i++){
    if(requests[i].geek?.profileImage?.public_id){
      if(requests[i].geek?.profileImage?.public_id){
        const blobName = requests[i].geek.profileImage?.public_id;
        const sasUrl = await generateSasUrl(blobName);
        requests[i].geek.profileImage.url = sasUrl;
      }
    }
  }

  

    res.status(200).json(requests);
});

const getGeekRequests = asyncHandler(async (req, res) => {
  const { id } = req.user;
  if(!id) return res.status(400).json({ message: 'User not found' });
  const requests = await ServiceRequest.find({ geek: id }).populate('seeker','-authToken').populate('category').populate('issue');
  if(!requests) return res.status(404).json({ message: 'No requests found' });
  requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  for(let i = 0; i < requests.length; i++){
    if(requests[i].category.image?.public_id){
      if(requests[i].category.image.public_id){
        const blobName = requests[i].category.image.public_id;
        const sasUrl = await generateSasUrl(blobName);
        requests[i].category.image.url = sasUrl;
      }
    }
  }

  // for(let i = 0; i < requests.length; i++){
  //   if(requests[i].seeker.profileImage?.public_id){
  //     if(requests[i].seeker.profileImage.public_id){
  //       const blobName = requests[i].seeker.profileImage.public_id;
  //       const sasUrl = await generateSasUrl(blobName);
  //       requests[i].seeker.profileImage.url = sasUrl;
  //     }
  //   }
  // }

  res.status(200).json(requests);
});


const getGeekPendingRequests = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if(!id) return res.status(400).json({ message: 'User not found' });
  const requests = await ServiceRequest.find({ geek: id, status: 'Pending' }).populate('seeker').populate('category');
  if(!requests) return res.status(404).json({ message: 'No requests found' });
  requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.status(200).json(requests);
})


const autoRejectRequest = asyncHandler(async (req, res) => {
  const requests = await ServiceRequest.find({ status: 'Matched' });
  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  for (const request of requests) {
    const timeDiff = now - request.createdAt;
    if (timeDiff > oneDay) {
      request.status = 'Rejected';
      request.geekResponseStatus = 'Expired';
      await request.save();
    }
    await client.messages.create({
          body: `Your request for ${request.category.title || "your Service"} has expired due to no response from the selected Geek. Please create a new request with a different Geek.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: geekState.phone
        });
  }



  res.status(200).json({ message: 'Requests updated successfully' });
});




 const acceptRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const geekId = req.user?._id;
    const request = await ServiceRequest.findById(id);
  
    if (!request || request.geek.toString() !== geekId.toString()) {
      return res.status(403).json({ message: 'Not authorized or invalid request' });
    }
    if(!request) return res.status(404).json({ message: 'Request not found' });
    if(request.geekResponseStatus === 'Expired') return res.status(404).json({ message: 'Request expired in 24 hours.' });
    if(request.geekResponseStatus === 'Accepted') return res.status(404).json({ message: 'Request already accepted' });
    if(request.geekResponseStatus === 'Rejected') return res.status(404).json({ message: 'Request already rejected' });

    const seeker = await Seeker.findById(request.seeker);

    const geek = await Geek.findById(geekId);
    if (!geek) {
      return res.status(404).json({ message: 'Geek not found' });
    }
  
  
    request.geekResponseStatus = 'Accepted';
    request.responseAt = new Date();
    request.status = 'Accepted';
    await request.save();

    if (seeker.expoPushToken) {
      console.log(typeof seeker.expoPushToken);
      const token = seeker.expoPushToken;
    if (!Expo.isExpoPushToken(token)) {
        console.log("Invalid push token");
        throw new Error("Invalid push token", 400);
      }

      const message = {
        to: seeker.expoPushToken,
        sound: "default",
        title: "Service Request Accepted",
        body: `The request for ${request?.category?.title || 'your service'} was Accepted.`,
        data: {},
      };
          const tickets = await expo.sendPushNotificationsAsync([message]);
           console.log(tickets);
        }

        const phone = seeker?.phone?.trim();

        if (phone && phone.startsWith('+')) {
          await client.messages.create({
          body: `The request for ${request?.category?.title || 'your service'} was Accepted by ${geek.fullName?.first || 'your Geek'}. You can now connect and resolve the issue.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: seeker.phone
        })
      }else{
        const data={
            to:seeker.email,
            from:process.env.SMTP_EMAIL,
            subject:"Service Request Sent",
            text:
            `Hey ${seeker.fullName.first} ${seeker.fullName.last},
            
            Your service request for ${request?.category?.title} has been sent. We'll notify you once a Geek accepts your request.`,

        }
        await sendMail(data)
      }


  
    res.status(200).json({ message: 'Request accepted' });
  });
  


  // Reject request
 const rejectRequest = asyncHandler(async (req, res) => {
  // console.log("Reject request called");
  
    const { id } = req.params;
    const geekId = req.user?._id;
    const geek = await Geek.findById(geekId);
    if (!geek) {
      console.log("Geek not found");
      
      return res.status(404).json({ message: 'Geek not found' });
    }
  
    const request = await ServiceRequest.findById(id);

    if (!request || request.geek.toString() !== geekId.toString()) {
      return res.status(403).json({ message: 'Not authorized or invalid request' });
    }

    if(!request) {
      console.log("Request not found");
      return res.status(404).json({ message: 'Request not found' });
    }
    if(request.geekResponseStatus === 'Accepted') return res.status(404).json({ message: 'Request already accepted' });
    if(request.geekResponseStatus === 'Rejected') return res.status(404).json({ message: 'Request already rejected' });
    if(request.geekResponseStatus === 'Expired') return res.status(404).json({ message: 'Request expired in 24 hours.' });
  
    const seeker = await Seeker.findById(request.seeker);
  
    request.geekResponseStatus = 'Rejected';
    request.responseAt = new Date();
    request.status = 'Rejected';

    if (seeker.expoPushToken) {
    if (!Expo.isExpoPushToken(seeker.expoPushToken)) {
        console.log("Invalid push token");
        throw new Error("Invalid push token", 400);
      }

      const message = {
        to: seeker.expoPushToken,
        sound: "default",
        title: "Service Request Rejected",
        body: `The request for ${request?.category?.title || 'your service'} was Rejected by ${geek.fullName?.first || 'your selected Geek'}. You can choose another geek to resolve the issue.`,
        data: {},
      };
           const tickets = await expo.sendPushNotificationsAsync([message]);
           console.log(tickets);
        
        }

      const phone = seeker?.phone?.trim();

        if (phone && phone.startsWith('+')) {
          await client.messages.create({
          body: `The request for ${request?.category?.title || 'your service'} was Accepted by ${geek.fullName?.first || 'your Geek'}. You can now connect and resolve the issue.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: seeker.phone
        })
      }else{
        const data={
            to:seeker.email,
            from:process.env.SMTP_EMAIL,
            subject:"Service Request Sent",
            text:
            `Hey ${seeker.fullName.first} ${seeker.fullName.last},
            
            Your service request for ${request?.category?.title} has been sent. We'll notify you once a Geek accepts your request.`,

        }
        await sendMail(data)
      }

  
    await request.save();
  
    res.status(200).json({ message: 'Request rejected' });
  });



  const getRequestById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid request ID" });
  }

  const request = await ServiceRequest.findById(id)
    .populate('seeker', '-authToken')
    .populate('geek')
    .populate({
      path: 'category',
      populate: {
        path: 'subCategories',
      },
    }).populate({
      path: 'reviews',
      populate: {
        path: 'postedBy',
      },
      options: {
        sort: { createdAt: -1 },
      },
    });

    if(request?.seeker?.profileImage?.public_id){
      if(request.seeker.profileImage.public_id){
        const blobName = request.seeker.profileImage.public_id;
        const sasUrl = await generateSasUrl(blobName);
        request.seeker.profileImage.url = sasUrl;
      }
    }

    if(request?.geek?.profileImage?.public_id){
      if(request.geek.profileImage.public_id){
        const blobName = request.geek.profileImage.public_id;
        const sasUrl = await generateSasUrl(blobName);
        request.geek.profileImage.url = sasUrl;
      }
    }

    if(request?.category?.image?.public_id){
      if(request.category.image.public_id){
        const blobName = request.category.image.public_id;
        const sasUrl = await generateSasUrl(blobName);
        request.category.image.url = sasUrl;
      }
    }

    if(request?.images?.length){
      for (let i = 0; i < request.images.length; i++) {
        const blobName = request.images[i].public_id;
        const sasUrl = await generateSasUrl(blobName);
        request.images[i].url = sasUrl;
      }
    }

    if(request?.video?.public_id){
      const blobName = request.video.public_id;
      const sasUrl = await generateSasUrl(blobName);
      request.video.url = sasUrl;
    }

    if(request?.reviews?.length){
      for (let i = 0; i < request.reviews.length; i++) {
        if(request.reviews[i]?.postedBy?.profileImage?.public_id){
          const blobName = request.reviews[i].postedBy.profileImage.public_id;
          const sasUrl = await generateSasUrl(blobName);
          request.reviews[i].postedBy.profileImage.url = sasUrl;
        }
      }
    }

  if (!request) {
    return res.status(404).json({ message: "Request not found" });
  }
  res.status(200).json(request);
});


const uploadRequestMedia = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { images, video } = req.body; // these should be URLs already uploaded to Azure

  const request = await ServiceRequest.findById(id);
  if (!request) return res.status(404).json({ message: 'Request not found' });

  // Optional: check if requester is the assigned geek
  if (request.geek.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  // Save uploaded media
  request.media = {
    images: images || [],
    video: video || ""
  };

  await request.save();
  res.status(200).json({ message: "Media uploaded successfully" });
});


const completeRequest = asyncHandler(async (req, res) => {
  
  
  const { id } = req.params;

  const request = await ServiceRequest.findById(id);
  if (!request) return res.status(404).json({ message: 'Request not found' });

  if (request.geek?.toString() !== req.user?._id?.toString()) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const media = { images: [], video: null };

  // Handle media upload if present in FormData
  if (req.files?.images && req.files.images.length > 0) {
    for (const file of req.files.images) {
      const uploaded = await uploadToAzure(file);
      media.images.push(uploaded);
    }
  }

  if (req.files?.video && req.files.video.length > 0) {
    const uploaded = await uploadToAzure(req.files.video[0]);
    media.video = uploaded;
  }

  // Validate media presence (either image or video is mandatory)
  const hasMedia =
    (request?.images?.length || 0) + media.images.length > 0 ||
    request?.video || media.video;
  if (!hasMedia) {
    return res.status(400).json({
      message: 'Please upload at least one related image or video before completing the request.',
    });
  }

  if (!request.images) request.images = [];
  request.images.push(...media.images);
  if (media.video) request.video = media.video;

  request.status = 'Completed';
  request.isCompleted = true;

  const seeker = await Seeker.findById(request.seeker);

  if ( seeker && seeker?.expoPushToken) {
    if (!Expo.isExpoPushToken(seeker?.expoPushToken)) {
        console.log("Invalid push token");
        throw new Error("Invalid push token", 400);
      }

      const message = {
        to: seeker?.expoPushToken, 
        sound: "default",
        title: "Service Request Completed",
        body: `Your request for ${request?.category?.title || 'your service'} was Completed.`,
        data: {},
      };
          const tickets = await sendExpoPushNotification(
            [message],
          );

          console.log(tickets);
        }

  await request.save();
  res.status(200).json({ message: 'Request marked as completed', media: request.media });
});


const addReviewBySeeker = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { data } = req.body;

  const { rating, comment } = data;
  

  if (!rating || !comment) {
    return res.status(400).json({ message: 'Rating and comment are required' });
  }

  const request = await ServiceRequest.findById(id);
  if (!request) return res.status(404).json({ message: 'Request not found' });
  
  if (request.seeker?.toString() !== req.user?.id?.toString()) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

const newRating = await Review.create({
    postedBy: req.user.id,
    rating,
    comment,
    service: request._id
  });

  request.reviews?.push(newRating._id);
  request.totalRating = (request.totalRating * request.reviews.length + rating) / (request.reviews.length + 1);

  await request.save();
  res.status(200).json({ message: 'Review added successfully' });
});

const deleteReviweBySeeker = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const request = await ServiceRequest.findById(id);
  if (!request) return res.status(404).json({ message: 'Request not found' });

  if (request.seeker?.toString() !== req.user?.id?.toString()) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const reviewId = req.body.reviewId;
  const review = await Review.findById(reviewId);
  if (!review) return res.status(404).json({ message: 'Review not found' });

  if (review.postedBy.toString() !== req.user.id.toString()) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  await Review.findByIdAndDelete(reviewId);

  request.ratings = request.ratings.filter((id) => id.toString() !== reviewId.toString());

  request.totalRating = (request.totalRating * request.ratings.length) / (request.ratings.length - 1);

  await request.save();
  res.status(200).json({ message: 'Review deleted successfully' });
});







 
  


  module.exports = {
    getMatchedGeeks,
    createRequestWithSelectedGeek,
    acceptRequest,
    rejectRequest,
    getSeekerRequests,
    getGeekRequests,
    getGeekPendingRequests,
    autoRejectRequest,
    getRequestById,
    uploadRequestMedia,
    completeRequest,
    addReviewBySeeker,
    deleteReviweBySeeker
  };