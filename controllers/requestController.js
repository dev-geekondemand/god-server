const asyncHandler = require('express-async-handler');
const ServiceRequest = require('../models/ServiceRequest.js');
const Service = require('../models/serviceModel.js');
const Category = require('../models/serviceCategory.js');
const Brand = require('../models/brandModel.js');
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
const expireRequests = require('../utils/expireRequests');

// Seeker data belongs to the seeker and admins. The geek assigned to a request
// gets only what the job needs: name and photo while the request is pending,
// plus phone and address once they have accepted it. Google/Microsoft seekers
// often have no phone, so their email stands in as the contact.
const seekerViewForGeek = (request) => {
  const s = request?.seeker;
  if (!s || typeof s !== 'object') return s;
  const view = { _id: s._id, fullName: s.fullName, profileImage: s.profileImage };
  if (request.geekResponseStatus === 'Accepted') {
    view.phone = s.phone;
    view.address = s.address;
    if (!s.phone) view.email = s.email;
  }
  return view;
};

// Plain object of a request with its seeker narrowed to the geek's view.
const forGeek = (request) => {
  const obj = typeof request.toObject === 'function' ? request.toObject() : request;
  return { ...obj, seeker: seekerViewForGeek(obj) };
};

// Reviewers shown alongside a request: public identity only.
const REVIEWER_FIELDS = 'fullName profileImage';

// SMS / email / push are best-effort. A failed send (bad number, Twilio or SMTP
// outage, stale push token) must never undo or misreport the action that
// triggered it — otherwise users retry and create duplicates, or a reject is
// silently lost.
const notify = async (label, fn) => {
  try {
    await fn();
  } catch (err) {
    console.error(`[notify:${label}]`, err?.message || err);
  }
};

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


// Addresses arrive either as a raw request body or as a seeker subdocument, and the client
// sends blank strings for fields the user left empty. Returns null when there is nothing
// worth storing, so the optional address is omitted rather than failing validation.
const normalizeAddress = (input) => {
  if (!input) return null;

  const src = typeof input.toObject === 'function' ? input.toObject() : input;
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

  // line1 is required by AddressSchema, so without it there is no storable address
  if (!text(src.line1)) return null;

  const address = {
    line1: text(src.line1),
    line2: text(src.line2),
    line3: text(src.line3),
    city: text(src.city),
    state: text(src.state),
    country: text(src.country),
    pin: text(src.pin),
  };

  const coordinates = src.location?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length === 2 && coordinates.every(Number.isFinite)) {
    address.location = { type: 'Point', coordinates: [...coordinates] };
  }

  return address;
};

const createRequestWithSelectedGeek = asyncHandler(async (req, res) => {
  const {
    geek,
    category,
    mode,
    location,
    scheduledAt,
    brand,
  } = req.body;

  console.log(req.body)

  let issue = req.body.issue;

   if(!req.user.id) return res.status(400).json({ message: 'User not found' });

  const seekerId = new mongoose.Types.ObjectId(req.user.id);

   validateMongodbId(seekerId);

  // Name the offender — a bare "missing required fields" hides which one the client dropped
  const missing = [!category && 'category', !geek && 'geek'].filter(Boolean);
  if (missing.length) return res.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` });


  const seeker = await Seeker.findById(seekerId);
  const geekState = await Geek.findById(geek);
  const catState = await Category.findById(category);

  console.log(geek,geekState)

  if (!seeker) return res.status(404).json({ message: 'User not found' });
  if (!geekState) return res.status(404).json({ message: 'Geek not found' });
  if(!catState) return res.status(400).json({ message: 'The service category does not exist' });

  // The client may post a partially filled address, so only treat one as usable when it
  // carries the line1 that AddressSchema requires; otherwise fall back to the seeker's.
  const finalAddress = normalizeAddress(location) || normalizeAddress(seeker.address);

  if (!finalAddress && mode === 'Offline') {
    return res.status(400).json({ message: 'Location is required for offline mode' });
  }

  if(!issue){
    issue = null;
  }

  // Brand may arrive as an id or as a name, so resolve either against the request's category.
  // Matched with an anchored case-insensitive regex rather than a collation, which the
  // production Cosmos cluster does not support.
  let brandState = null;
  if (brand) {
    const brandName = String(brand).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    brandState = mongoose.Types.ObjectId.isValid(brand)
      ? await Brand.findOne({ _id: brand, category: catState._id })
      : await Brand.findOne({ name: new RegExp(`^${brandName}$`, 'i'), category: catState._id });

    if (!brandState) return res.status(400).json({ message: 'The brand does not exist for this service category' });
  }

  const request = await ServiceRequest.create({
    category,
    seeker: seekerId,
    geek: geekState._id,
    mode,
    issue,
    status: 'Matched',
    ...(finalAddress && { address: finalAddress }),
    ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }),
    ...(brandState && { brand: brandState._id }),
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

  // The request exists now; notifications below can't change that outcome.
  if (Expo.isExpoPushToken(geekState.expoPushToken)) {
    await notify('create:push-geek', () => expo.sendPushNotificationsAsync([{
      to: geekState.expoPushToken,
      sound: "default",
      title: "Service Request Recieved",
      body: `You have a new service request for ${catState.title}`,
      data: { requestId: request._id.toString(), type: 'request' },
    }]));
  }

  await notify('create:sms-geek', () => client.messages.create({
    body: `You have a new service request for ${catState.title}. Please review it as soon as possible.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: geekState.mobile
  }));

  if (seeker?.phone) {
    await notify('create:sms-seeker', () => client.messages.create({
      body: `Your service request for ${catState.title} has been sent. We'll notify you once a Geek accepts your request.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: seeker.phone
    }));
  } else if (seeker?.email) {
    await notify('create:email-seeker', () => sendMail({
      to: seeker.email,
      from: process.env.SMTP_EMAIL,
      subject: "Service Request Sent",
      text: `Hey ${seeker.fullName?.first || ''} ${seeker.fullName?.last || ''},

Your service request for ${catState.title} has been sent. We'll notify you once a Geek accepts your request.`,
    }));
  }

  res.status(201).json(request);
});


const getSeekerRequests = asyncHandler(async (req, res) => {
    
    const {id} = req.user;
    if(!id) return res.status(400).json({ message: 'User not found' });
    // Legacy requests with no geek are skipped rather than deleted — a GET must
    // not destroy data.
    const requests = await ServiceRequest.find({ seeker: id, geek: { $ne: null } }).populate('geek', '-authToken').populate('category').populate('issue').populate('brand');
    if(!requests) return res.status(404).json({ message: 'No requests found' });

    requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    
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
  const requests = await ServiceRequest.find({ geek: id }).populate('seeker','-authToken').populate('category').populate('issue').populate('brand');
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

  res.status(200).json(requests.map(forGeek));
});


const getGeekPendingRequests = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if(!id) return res.status(400).json({ message: 'User not found' });
  const requests = await ServiceRequest.find({ geek: id, status: 'Pending' }).populate('seeker', '-authToken').populate('category');
  if(!requests) return res.status(404).json({ message: 'No requests found' });
  requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.status(200).json(requests.map(forGeek));
})


// Manual (admin) trigger for the same sweep the hourly cron in index.js runs,
// so there is a single copy of the expiry logic.
const autoRejectRequest = asyncHandler(async (req, res) => {
  await expireRequests();
  res.status(200).json({ message: 'Requests updated successfully' });
});




// Tells the seeker about a geek's response: push if they have the app, then SMS,
// falling back to email when there's no phone. All best-effort (see notify).
const notifySeekerOfResponse = async (seeker, request, { title, push, sms, emailSubject, emailText }) => {
  if (!seeker) return;
  if (Expo.isExpoPushToken(seeker.expoPushToken)) {
    await notify(`${title}:push`, () => expo.sendPushNotificationsAsync([{
      to: seeker.expoPushToken,
      sound: "default",
      title,
      body: push,
      data: { requestId: request._id.toString(), type: 'request' },
    }]));
  }
  const phone = seeker.phone?.trim();
  if (phone && phone.startsWith('+')) {
    await notify(`${title}:sms`, () => client.messages.create({ body: sms, from: process.env.TWILIO_PHONE_NUMBER, to: phone }));
  } else if (seeker.email) {
    await notify(`${title}:email`, () => sendMail({
      to: seeker.email,
      from: process.env.SMTP_EMAIL,
      subject: emailSubject,
      text: `Hey ${seeker.fullName?.first || ''} ${seeker.fullName?.last || ''},\n\n${emailText}`,
    }));
  }
};

// Loads a request for the assigned geek to respond to. Returns { request } or
// { status, message } when it can't be responded to. Only Pending requests can
// be accepted or rejected (not Cancelled/Expired/already answered).
const loadRequestForResponse = async (id, geekId) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return { status: 400, message: 'Invalid request ID' };
  const request = await ServiceRequest.findById(id).populate('category');
  if (!request) return { status: 404, message: 'Request not found' };
  if (!geekId || String(request.geek) !== String(geekId)) return { status: 403, message: 'Not authorized or invalid request' };
  const blocked = {
    Accepted: 'Request already accepted',
    Rejected: 'Request already rejected',
    Expired: 'Request expired in 24 hours.',
    Cancelled: 'The seeker cancelled this request',
  }[request.geekResponseStatus];
  if (blocked) return { status: 409, message: blocked };
  return { request };
};

 const acceptRequest = asyncHandler(async (req, res) => {
    const geekId = req.user?._id;
    const { request, status, message } = await loadRequestForResponse(req.params.id, geekId);
    if (!request) return res.status(status).json({ message });

    const geek = await Geek.findById(geekId);
    if (!geek) return res.status(404).json({ message: 'Geek not found' });
    const seeker = await Seeker.findById(request.seeker);

    request.geekResponseStatus = 'Accepted';
    request.responseAt = new Date();
    request.status = 'Accepted';
    await request.save();

    const service = request.category?.title || 'your service';
    await notifySeekerOfResponse(seeker, request, {
      title: 'Service Request Accepted',
      push: `The request for ${service} was Accepted.`,
      sms: `The request for ${service} was Accepted by ${geek.fullName?.first || 'your Geek'}. You can now connect and resolve the issue.`,
      emailSubject: 'Service Request Accepted',
      emailText: `Your service request for ${service} has been accepted. You can now connect and resolve the issue.`,
    });

    res.status(200).json({ message: 'Request accepted' });
  });



  // Reject request
 const rejectRequest = asyncHandler(async (req, res) => {
    const geekId = req.user?._id;
    const geek = await Geek.findById(geekId);
    if (!geek) return res.status(404).json({ message: 'Geek not found' });

    const { request, status, message } = await loadRequestForResponse(req.params.id, geekId);
    if (!request) return res.status(status).json({ message });
    const seeker = await Seeker.findById(request.seeker);

    // Save BEFORE notifying, so a failed SMS can't lose the rejection.
    request.geekResponseStatus = 'Rejected';
    request.responseAt = new Date();
    request.status = 'Rejected';
    await request.save();

    const service = request.category?.title || 'your service';
    await notifySeekerOfResponse(seeker, request, {
      title: 'Service Request Rejected',
      push: `The request for ${service} was Rejected by ${geek.fullName?.first || 'your selected Geek'}. You can choose another geek to resolve the issue.`,
      sms: `The request for ${service} was Rejected by ${geek.fullName?.first || 'your Geek'}. You can choose another geek to resolve the issue.`,
      emailSubject: 'Service Request Rejected',
      emailText: `Your service request for ${service} has been rejected. You can choose another geek to resolve the issue.`,
    });

    res.status(200).json({ message: 'Request rejected' });
  });



  const getRequestById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid request ID" });
  }

  const request = await ServiceRequest.findById(id)
    .populate('seeker', '-authToken')
    .populate('geek', '-authToken')
    .populate('brand')
    .populate({
      path: 'category',
      populate: {
        path: 'subCategories',
      },
    }).populate({
      path: 'reviews',
      populate: {
        path: 'postedBy',
        select: REVIEWER_FIELDS,
      },
      options: {
        sort: { createdAt: -1 },
      },
    });

  if (!request) {
    return res.status(404).json({ message: "Request not found" });
  }

  // Only the request's seeker, its assigned geek, or an admin (the admin route
  // sets req.admin via protectAdmin) may see it.
  const userId = String(req.user?.id ?? req.user?._id ?? '');
  const isAdmin = !!req.admin;
  const isOwnerSeeker = !!userId && String(request.seeker?._id ?? request.seeker) === userId;
  const isAssignedGeek = !!userId && String(request.geek?._id ?? request.geek) === userId;
  if (!isAdmin && !isOwnerSeeker && !isAssignedGeek) {
    return res.status(403).json({ message: 'Not authorized to view this request' });
  }

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

  // A geek viewing their assigned request gets the narrowed seeker view.
  res.status(200).json(isAdmin || isOwnerSeeker ? request : forGeek(request));
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

  const request = await ServiceRequest.findById(id).populate('geek').populate('seeker').populate('category');
  if (!request) return res.status(404).json({ message: 'Request not found' });

  if (request.geek?._id?.toString() !== req.user?._id?.toString()) {

    return res.status(403).json({ message: 'Unauthorized' });
  }

  // Only work the geek accepted, and that isn't finished yet, can be completed.
  if (request.status === 'Completed' || request.isCompleted) {
    return res.status(409).json({ message: 'Request already completed' });
  }
  if (request.geekResponseStatus !== 'Accepted') {
    return res.status(409).json({ message: 'Only accepted requests can be completed' });
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

  // Validate media presence (either image or video is mandatory). `video` is a
  // nested path, so Mongoose returns an object even when none was uploaded —
  // check for an actual stored file.
  const hasMedia =
    (request?.images?.length || 0) + media.images.length > 0 ||
    !!request?.video?.public_id || !!media.video;
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
  const geek = await Geek.findById(request.geek);

  await request.save();

  const service = request.category?.title || 'your service';
  const geekName = geek?.fullName?.first || 'your Geek';
  await notifySeekerOfResponse(seeker, request, {
    title: 'Service Request Completed',
    push: `Your request for ${service} was Completed.`,
    sms: `The request for ${service} was Completed by ${geekName}. You can now review the service.`,
    emailSubject: 'Service Request Completed',
    emailText: `The request for ${service} was Completed by ${geekName}. You can now review the service.`,
  });

  res.status(200).json({ message: 'Request marked as completed', media: { images: request.images, video: request.video } });
});


const cancelRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const seekerId = req.user?.id;

  const request = await ServiceRequest.findById(id).populate('geek').populate('category');
  if (!request) return res.status(404).json({ message: 'Request not found' });

  if (request.seeker?.toString() !== seekerId?.toString()) {
    return res.status(403).json({ message: 'Not authorized to cancel this request' });
  }

  if (!['Matched', 'Pending'].includes(request.status)) {
    return res.status(400).json({ message: 'Only pending requests can be cancelled' });
  }

  request.status = 'Cancelled';
  request.geekResponseStatus = 'Cancelled';
  await request.save();

  const geek = await Geek.findById(request.geek?._id);
  if (geek?.expoPushToken && Expo.isExpoPushToken(geek.expoPushToken)) {
    await expo.sendPushNotificationsAsync([{
      to: geek.expoPushToken,
      sound: 'default',
      title: 'Request Cancelled',
      body: `The seeker cancelled their request for ${request.category?.title || 'a service'}.`,
      data: { requestId: request._id.toString(), type: 'request' },
    }]);
  }

  if (geek?.mobile) {
    try {
      await client.messages.create({
        body: `The seeker has cancelled their service request for ${request.category?.title || 'a service'}.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: geek.mobile,
      });
    } catch (err) {
      console.error('[cancelRequest] SMS failed:', err.message);
    }
  }

  res.status(200).json({ message: 'Request cancelled successfully' });
});

// The Review collection is the source of truth: recompute a request's average
// from its actual reviews instead of incrementally (which drifted).
// ServiceRequest.totalRating is declared as a String, hence the formatting.
const recomputeRequestRating = async (request) => {
  const reviews = await Review.find({ service: request._id }).select('rating').lean();
  const avg = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  request.totalRating = String(Math.round(avg * 10) / 10);
};

const addReviewBySeeker = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const rating = Number(req.body.rating);
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';

  if (!comment || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'A rating from 1 to 5 and a comment are required' });
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid request ID' });
  }

  const request = await ServiceRequest.findById(id);
  if (!request) return res.status(404).json({ message: 'Request not found' });

  if (request.seeker?.toString() !== req.user?.id?.toString()) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  // Only finished work can be reviewed, and only once per seeker.
  if (request.status !== 'Completed' && !request.isCompleted) {
    return res.status(400).json({ message: 'You can review a request once it is completed' });
  }
  if (await Review.exists({ service: request._id, postedBy: req.user.id })) {
    return res.status(409).json({ message: 'You have already reviewed this request' });
  }

  const newRating = await Review.create({
    postedBy: req.user.id,
    rating,
    comment,
    service: request._id
  });

  request.reviews.push(newRating._id);
  await recomputeRequestRating(request);
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

  request.reviews = request.reviews.filter((rid) => rid.toString() !== reviewId.toString());
  await recomputeRequestRating(request);

  await request.save();
  res.status(200).json({ message: 'Review deleted successfully' });
});







 
  


const getAllRequestsAdmin = asyncHandler(async (req, res) => {
  const requests = await ServiceRequest.find({})
    .populate('seeker', '-authToken')
    .populate('geek')
    .populate('category')
    .sort({ createdAt: -1 });
  res.status(200).json({ requests });
});

const getHiringRequestsAdmin = asyncHandler(async (req, res) => {
  const requests = await ServiceRequest.find({ status: 'Completed' })
    .populate('seeker', '-authToken')
    .populate('geek')
    .populate('category')
    .sort({ createdAt: -1 });
  res.status(200).json({ requests });
});

const getRejectedRequestsAdmin = asyncHandler(async (req, res) => {
  const requests = await ServiceRequest.find({
    $or: [
      { status: 'Rejected' },
      { status: 'Cancelled' },
      { geekResponseStatus: 'Rejected' },
    ],
  })
    .populate('seeker', '-authToken')
    .populate('geek')
    .populate('category')
    .sort({ createdAt: -1 });
  res.status(200).json({ requests });
});

const deleteRequestAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid request id' });
  }

  const request = await ServiceRequest.findById(id);
  if (!request) {
    return res.status(404).json({ message: 'Request not found' });
  }

  // Remove reviews attached to this request first
  await Review.deleteMany({ service: id });
  await ServiceRequest.findByIdAndDelete(id);

  res.status(200).json({ message: 'Request deleted successfully' });
});

  module.exports = {
    getMatchedGeeks,
    createRequestWithSelectedGeek,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    getSeekerRequests,
    getGeekRequests,
    getGeekPendingRequests,
    autoRejectRequest,
    getRequestById,
    uploadRequestMedia,
    completeRequest,
    addReviewBySeeker,
    deleteReviweBySeeker,
    getAllRequestsAdmin,
    getHiringRequestsAdmin,
    getRejectedRequestsAdmin,
    deleteRequestAdmin,
  };