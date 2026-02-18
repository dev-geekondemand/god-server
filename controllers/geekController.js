const { Geek, IndividualGeek, CorporateGeek } = require('../models/geekModel.js');
const Category = require('../models/serviceCategory.js');
const Brand = require('../models/brandModel.js');
const asyncHandler = require('express-async-handler');
const { verifyAadhaarLite } = require('../utils/verifyAdhaar.js');
const {uploadToAzure} = require('../middlewares/azureUploads.js');
const AadhaarVerification = require('../models/verifiedAdhaarModel.js');
const { sendOtp, verifyOtp } = require('../utils/otpService.js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { generateSasUrl, deleteFromAzure } = require('../utils/azureBlob.js');
const { default: mongoose } = require('mongoose');
const XLSX = require("xlsx");
// const slugify = require("slugify");
const fs = require("fs");
const path = require("path");
const geocodeAddress = require('../utils/geocode.js');
const sendMail = require('../middlewares/sendMail.js');
const crypto = require('crypto');
const ServiceRequest = require('../models/serviceRequest.js');
// Create new Geek
 const verifyOtpAndCreateGeek = asyncHandler(async (req, res) => {

 let { mobile, otp, fullName,primarySkill,yoe,refCode,brandsServiced } = req.body;

  if (!mobile || !otp || !fullName?.first || !fullName?.last || !primarySkill || !yoe) {
    return res.status(400).json({ message: 'Phone, OTP, Years Of Experience, Primary Skill and full name are required' });
  }

  mobile = mobile.replace(/\D/g, ''); // Remove non-digits
  if (!mobile.startsWith("91")) {
    mobile = "91" + mobile;
  }
  mobile = "+" + mobile;
  

  const isVerified = await verifyOtp(mobile, otp);
  if (!isVerified) return res.status(401).json({ message: 'Invalid or expired OTP' });

  // Check if user already exists
  let geek = await Geek.findOne({ mobile });
  if (geek) return res.status(409).json({ message: 'User already exists. Please login instead.' });

  // Create new user
  geek = await IndividualGeek.create({
    mobile,
    refCode,
    brandsServiced,
    yoe,
    isPhoneVerified: true,
    fullName,
    primarySkill,
    profileCompleted: false,
    profileCompletedPercentage: 30,
  });

  // Generate JWT
  const tokenPayload = {
    id: geek._id,
    mobile: geek.mobile,
  };

  const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });

  // Hash the token and save it
  const hashedToken = await bcrypt.hash(token, 10);
  geek.authToken = hashedToken;
  await geek.save();

  // Set the token in an HttpOnly cookie
  res.cookie('geek_auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.status(201).json({
    message: 'Geek registered successfully',
    token,
    geek: {
      id: geek._id,
      mobile: geek.mobile,
      fullName: geek.fullName,
      primarySkill: geek.primarySkill,
    },
  });
});

const sendOtpToPhone = asyncHandler(async (req, res) => {
  
    let { phone } = req.body;
    phone = "+91" + phone
    if (!phone) return res.status(400).json({ message: 'Phone number is required' });
  
    const result = await sendOtp(phone);
  
    if (result.success) {
      res.status(200).json({ message: result.message });
    } else {
      res.status(500).json({ message: result.message, error: result.error });
    }
  }); 


const verifyOtpAndLogin = asyncHandler(async (req, res) => {
    let {phone, otp } = req.body;

      phone = phone.replace(/\D/g, ''); // Remove non-digits
      if (!phone.startsWith("+91")) {
        phone = "+91" + phone;
      }

    
    if (!phone || !otp) return res.status(400).json({ message: 'Phone and OTP are required' });


        let user = await Geek.findOne({ mobile:phone });

          if (!user) {
            return res.status(404).json({ message: "User not found. Please Sign Up." });
          }

        
    
  
    // Verify OTP logic (you can integrate with your OTP service)
    const isVerified =  await verifyOtp(phone, otp);
    if (!isVerified) return res.status(401).json({ message: 'Invalid or expired OTP' });
  
    // Check if user exists by phone number


    const tokenPayload = {
      id: user._id,
      phone: user.mobile,
      authProvider: user.authProvider,
    };
  
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '7d' });
  
    // Hash the token using bcrypt
    const hashedToken = await bcrypt.hash(token, 10);
  
    // Save the hashed token to the user record in the database
    user.authToken = hashedToken;

    if (user.profileImage?.public_id) {

    const blobName = typeof user.profileImage === "object" ? user.profileImage.public_id : user.profileImage;
    const sasUrl = await generateSasUrl(blobName);
    user.profileImage ={
      public_id: blobName,
      sas_url: sasUrl
    }
  }
    
    
    await user.save();
  
    // Store JWT token in HttpOnly cookie
    res.cookie('geek_auth_token', token, {
      httpOnly: true, // Can't be accessed by JavaScript
      secure: process.env.NODE_ENV === 'production', // Only for HTTPS in production
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax', // Prevent CSRF attacks
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days expiration
    });
  
    return res.status(200).json({
      message: 'Login successful',
      token,
      profileCompletedPercentage: user.profileCompletedPercentage,
      isAdhaarVerified: user.isAdhaarVerified,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      isProfileCompleted: user.profileCompleted,
      profileImage: user.profileImage,
      user: {
        id: user._id,
        phone: user.mobile
      },
    });
});

const getGeekById = asyncHandler(async (req, res) => {
  const { id } = req.user;
 
  // console.log(req)
  
  const user = await Geek.findById(id).select('-authToken')
  .populate([
    { path: 'primarySkill', populate: { path: 'subCategories' } },
    { path: 'secondarySkills' },
    { path: 'brandsServiced', populate: { path: 'category' } },
    {path:'services', populate: {path: 'category', populate: {path: 'subCategories'}}},
    {path:'rateCard', populate:{path:'skill'}},
    {path:'requests'}
  ])
  if (!user) return res.status(404).json({ message: 'Geek not found' });


  if (user.profileImage?.public_id) {
    const blobName = user.profileImage.public_id;
    const sasUrl = await generateSasUrl(blobName);
    user.profileImage.url = sasUrl;
  }

  if(user?.expoPushToken){
    user.expoPushToken = user.expoPushToken
  }


  return res.status(200).json(user);
});


const findGeekById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const user = await Geek.findById(id).populate([
    { path: 'primarySkill', populate: { path: 'subCategories' } },
    { path: 'secondarySkills' },
    { path: 'brandsServiced', populate: { path: 'category' } },
    {path:'rateCard', populate:{path:'skill'}},
  ]);
  if (!user) return res.status(404).json({ message: 'Geek not found' });

  if (user.profileImage?.public_id) {
    const blobName = user.profileImage?.public_id;
    const sasUrl = await generateSasUrl(blobName);
    user.profileImage.url = sasUrl;
  }

  if(user?.primarySkill?.image){
    const blobName = user.primarySkill.image?.public_id;
    const sasUrl = await generateSasUrl(blobName);
    user.primarySkill.image.url = sasUrl;
  }

  if(user?.secondarySkills?.length){
    for (let i = 0; i < user.secondarySkills.length; i++) {
      const blobName = user.secondarySkills[i]?.image?.public_id;
      const sasUrl = await generateSasUrl(blobName);
      user.secondarySkills[i].image.url = sasUrl;
    }
  }

  return res.status(200).json(user);
});


const updateGeekAssignments = asyncHandler(async (req, res) => {
  const { geekId } = req.params;
  const { primarySkill, secondarySkills, brandsServiced } = req.body;

  console.log(req.body, req.params);

  if (!geekId) {
    return res.status(400).json({ message: 'Geek ID is required' });
  }

  const geek = await Geek.findById(geekId);
  if (!geek) {
    return res.status(404).json({ message: 'Geek not found' });
  }

  // ----- PRIMARY SKILL -----
  if (primarySkill) {
    // Decrement old primary category if changed
    if (geek.primarySkill && geek.primarySkill.toString() !== primarySkill) {
      const oldCat = await Category.findById(geek.primarySkill);
      if (oldCat && oldCat.totalGeeks > 0) {
        oldCat.totalGeeks -= 1;
        await oldCat.save();
      }
    }

    // Increment new primary category
    const newCat = await Category.findById(primarySkill);
    if (newCat) {
      newCat.totalGeeks += 1;
      await newCat.save();
      geek.primarySkill = primarySkill;
    }
  }

  // ----- SECONDARY SKILLS -----
  if (secondarySkills?.length > 0) {
    const oldSecondary = geek.secondarySkills.map(id => id.toString());
    const toDecrement = oldSecondary.filter(id => !secondarySkills.includes(id));
    const toIncrement = secondarySkills.filter(id => !oldSecondary.includes(id));

    await Promise.all(
      toDecrement.map(async id => {
        const cat = await Category.findById(id);
        if (cat && cat.totalGeeks > 0) {
          cat.totalGeeks -= 1;
          await cat.save();
        }
      })
    );

    await Promise.all(
      toIncrement.map(async id => {
        const cat = await Category.findById(id);
        if (cat) {
          cat.totalGeeks += 1;
          await cat.save();
        }
      })
    );

    geek.secondarySkills = secondarySkills;
  }

  // ----- BRANDS SERVICED -----
  if (brandsServiced?.length) {
    // Merge with existing brands (optional: remove duplicates)
    geek.brandsServiced = Array.from(new Set(brandsServiced));
    // Optional: you can also validate brand IDs exist in DB
    // const validBrands = await Brand.find({ _id: { $in: brandsServiced } });
    // geek.brandsServiced = validBrands.map(b => b._id);
  }

  // Save Geek
  await geek.save();

  // Return updated Geek with populated fields
  const updatedGeek = await Geek.findById(geekId)
    .populate('primarySkill secondarySkills brandsServiced')
    .select('-authToken');

  res.status(200).json(updatedGeek);
});



 const updateGeekDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type, ...data } = req.body;
  
  const geek = await Geek.findById(id);
   if (!geek) return res.status(404).json({ message: 'Geek not found' });

    const GeekModel = type === 'Corporate' ? CorporateGeek : IndividualGeek;

    let profileCompletedPercentage = 30;

    if(data?.address?.pin) {
      profileCompletedPercentage += 10;
    }
    if(data?.availability){
      profileCompletedPercentage += 10;
    }
    if(data?.certificates){
      profileCompletedPercentage += 10;
    }

    if(data?.primarySkill){

      if(geek.primarySkill){
        const cat = await Category.findById(geek.primarySkill);
        if(cat.totalGeeks > 0){
          cat.totalGeeks -= 1;
        }
        await cat.save();
      }

      const cat = await Category.findById(data.primarySkill);
      cat.totalGeeks += 1;
      await cat.save();
    }
    if (type === 'Individual'){
        if( data?.qualifications){
          profileCompletedPercentage += 10;
        }
    }else if(type === 'Corporate'){
            if(data?.companyDocs){
              profileCompletedPercentage += 10;
            }

          if(data?.GSTIN && data?.CIN){
            profileCompletedPercentage += 20;
          }
    }

    data.profileCompletedPercentage = profileCompletedPercentage;

    if(data?.languagePreferences){
      const languages = data.languagePreferences = data.languagePreferences.map((lang) => {
        return lang;
      });
      data.languagePreferences = languages;
    }

  const updatedGeek = await Geek.findByIdAndUpdate(id, data, { new: true }).select('-authToken').populate('primarySkill secondarySkills brandsServiced');
  res.status(200).json(updatedGeek);

});



// Upload certificate and push to geek's profile
 const uploadCertificate = async (req, res) => {
  try {
    const geekId = req.params.id;
    const file = req.file;

    if (!file) return res.status(400).json({ message: 'No file uploaded.' });

    const fileUrl = await uploadToAzure(file.buffer, file.originalname, file.mimetype);

    const certificate = { name: file.originalname, fileUrl };
    await Geek.findByIdAndUpdate(geekId, {
      $push: { certificates: certificate }
    });

    res.status(200).json({ message: 'Certificate uploaded.', fileUrl });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// Delete certificate
 const deleteCertificate = async (req, res) => {
  try {
    const { id, certId } = req.params;
    await Geek.findByIdAndUpdate(id, {
      $pull: { certificates: { _id: certId } }
    });
    res.status(200).json({ message: 'Certificate removed.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



const updateProfileImage = asyncHandler(async (req, res) => {
 try{
   const file = req.file;
  const geekId = req.params.id;



  if (!file) return res.status(400).json({ message: 'No image uploaded.' });

  // Fetch existing Geek data
  const geek = await Geek.findById(geekId);
  if (!geek) return res.status(404).json({ message: 'Geek not found.' });

  // If there is an existing profile image, delete it
  const oldImageUrl = geek.profileImage?.url;
  if (oldImageUrl) {
    try {
      await deleteFromAzure(oldImageUrl);
    } catch (error) {
      console.error('Error deleting old image:', error);
      return res.status(500).json({ message: 'Failed to delete old image.' });
    }
  }

  // Upload the new image
  const imageUrl = await uploadToAzure(file);

  // Update the Geek's profile image
  geek.profileImage = imageUrl;
  await geek.save();

  res.status(200).json({ message: 'Profile image updated.', imageUrl });
 }catch(error){
   res.status(500).json({ message: error.message });
 }
});




const addRateCard = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { data } = req.body; 

  if (!Array.isArray(data)) {
    return res.status(400).json({ message: "Data must be an array" });
  }

  const geek = await Geek.findById(id);
  if (!geek) {
    return res.status(404).json({ message: "Geek not found" });
  }

  // Deduplicate by skill + chargeType
  const uniqueRateCards = [];
  const seen = new Set();

  for (const entry of data) {
    const key = `${entry.skill?._id || entry.skill}-${entry.chargeType}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRateCards.push(entry);
    }
  }

  console.log(uniqueRateCards);
  

  // ✅ Replace the entire rateCard array
  geek.rateCard = uniqueRateCards;
  await geek.save();

  res.status(200).json({
    message: "Rate card updated successfully",
    rateCard: geek.rateCard,
  });
});




  

const deleteRateCardItem =asyncHandler( async (req, res) => {
   
      const { id, rateId } = req.params;
  
      await Geek.findByIdAndUpdate(id, {
        $pull: { rateCard: { _id: rateId } }
      });
  
      res.status(200).json({ message: 'Rate card entry deleted.' });
    
});

  
   const updateAvailability = asyncHandler(async (req, res) => {
    
      const { id } = req.params;
      const {slots } = req.body;
  
      await Geek.findByIdAndUpdate(id, {
        availability: { slots }
      });
  
      res.status(200).json({ message: 'Availability updated.' });
    
  });

  
const searchGeeks = asyncHandler(async (req, res) => {
  const {
    skill,
    city,
    brandId,
    state,
    refCode,
    mode,
    chargeType,
    minRate,
    maxRate,
    page = 1,
    limit = 10,
  } = req.query;

const normalize = (val) =>
  typeof val === 'string' ? val.trim().replace(/\s+/g, ' ') : val;  

  const matchQuery = {};

  if (city) {
const normCity = normalize(city);
    matchQuery['address.city'] = { $regex: normCity, $options: 'i' };
  }
  if (state) {
const normState = normalize(state);
    matchQuery['address.state'] = { $regex: normState, $options: 'i' };
  }
  if (mode) matchQuery['modeOfService'] = mode;

  if (brandId && mongoose.Types.ObjectId.isValid(brandId)) {
    matchQuery['brandsServiced'] = new mongoose.Types.ObjectId(brandId);
  }
  if (refCode) {
    matchQuery['refCode'] = refCode;
  }

  // Rate card filter
  if (chargeType || minRate || maxRate) {
    matchQuery['rateCard'] = {
      $elemMatch: {
        ...(chargeType && { chargeType }),
        ...(minRate && { rate: { $gte: Number(minRate) } }),
        ...(maxRate && {
          rate: {
            ...(minRate ? { $gte: Number(minRate) } : {}),
            $lte: Number(maxRate),
          },
        }),
      },
    };
  }

  const currentPage = parseInt(page, 10);
  const resultsPerPage = parseInt(limit, 10);
  const skip = (currentPage - 1) * resultsPerPage;

  const pipeline = [];

  // Initial match filters (city/state/mode/etc.)
  pipeline.push({ $match: matchQuery });

  if (skill && mongoose.Types.ObjectId.isValid(skill)) {
    const skillId = new mongoose.Types.ObjectId(skill);

    // Add computed priority
    pipeline.push({
      $addFields: {
        matchPriority: {
          $cond: [
            { $eq: ['$primarySkill', skillId] },
            2,
            {
              $cond: [
                { $in: [skillId, '$secondarySkills'] },
                1,
                0,
              ],
            },
          ],
        },
      },
    });

    // Ensure skill matches somewhere
    pipeline.push({
      $match: {
        $or: [
          { primarySkill: skillId },
          { secondarySkills: { $in: [skillId] } },
          { rateCard: { $elemMatch: { skill: skillId } } },
          { brandsServiced: { $in: [skillId] } },
        ],
      },
    });
  }

  // Sort by matchPriority, then _id
  pipeline.push({ $sort: { matchPriority: -1, _id: 1 } });

  // Pagination
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: resultsPerPage });

  // Populate primarySkill (Category)
  pipeline.push(
    {
      $lookup: {
        from: 'categories',
        localField: 'primarySkill',
        foreignField: '_id',
        as: 'primarySkill',
      },
    },
    { $unwind: { path: '$primarySkill', preserveNullAndEmptyArrays: true } }
  );

  // Populate secondarySkills (Category)
  pipeline.push({
    $lookup: {
      from: 'categories',
      localField: 'secondarySkills',
      foreignField: '_id',
      as: 'secondarySkills',
    },
  });

  // Populate brandsServiced (Brand)
  pipeline.push({
    $lookup: {
      from: 'brands',
      localField: 'brandsServiced',
      foreignField: '_id',
      as: 'brandsServiced',
    },
  });

  // Populate rateCard.skill (Category)
  pipeline.push(
    {
      $lookup: {
        from: 'categories',
        localField: 'rateCard.skill',
        foreignField: '_id',
        as: 'rateCardSkills',
      },
    },
    {
      $addFields: {
        rateCard: {
          $map: {
            input: '$rateCard',
            as: 'rc',
            in: {
              $mergeObjects: [
                '$$rc',
                {
                  skill: {
                    $arrayElemAt: [
                      '$rateCardSkills',
                      { $indexOfArray: ['$rateCard.skill', '$$rc.skill'] },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    },
    { $project: { rateCardSkills: 0 } }
  );

  // Get total count without skip/limit
  const totalPromise = Geek.aggregate([
    ...pipeline.filter(stage => !('$skip' in stage) && !('$limit' in stage)),
    { $count: 'count' },
  ]);

  const geeksPromise = Geek.aggregate(pipeline);

  const [totalResult, geeks] = await Promise.all([totalPromise, geeksPromise]);
  const total = totalResult[0]?.count || 0;

  // Generate SAS URLs
  const imageGeeks = await Promise.all(
    geeks.map(async (geek) => {
      if (geek.profileImage?.public_id) {
        try {
          geek.profileImage.url = await generateSasUrl(geek.profileImage.public_id);
        } catch (err) {
          console.error(`Error generating SAS URL for geek ${geek._id}:`, err);
        }
      }
      return geek;
    })
  );

  return res.status(200).json({
    geeks: imageGeeks,
    total,
    page: currentPage,
    pages: Math.ceil(total / resultsPerPage),
  });
});




  const deleteGeek = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const geek = await Geek.findById(id);
  if (!geek) {
    return res.status(404).json({ message: 'Geek not found.' });
  }

  // 1️⃣ Delete all related requests FIRST
  await ServiceRequest.deleteMany({ geek: id });


  // 2️⃣ Update category count
  if (geek.primarySkill) {
    const cat = await Category.findById(geek.primarySkill);
    if (cat) {
      cat.totalGeeks = Math.max(0, cat.totalGeeks - 1);
      await cat.save();
    }
  }

  if(geek.secondarySkills?.length > 0) {
    await Promise.all(
      geek.secondarySkills.map(async id => {
        const cat = await Category.findById(id);
        if (cat) {
          cat.totalGeeks = Math.max(0, cat.totalGeeks - 1);
          await cat.save();
        }
      })
    );
  }

 

  // 3️⃣ Delete geek
  await Geek.findByIdAndDelete(id);

  res.status(200).json({ message: 'Geek deleted successfully.' });
});



const updateAddress = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    pin,
    city,
    state,
    country,
    line1,
    line2,
    line3,
    coordinates
  } = req.body;

  console.log("body",req.body)

  const geek = await Geek.findById(id);
  if (!geek) {
    return res.status(404).json({ message: "Geek not found" });
  }

  if (!geek.address) geek.address = {};

  // Basic fields
  if (pin) geek.address.pin = pin;
  if (city) geek.address.city = city;
  if (state) geek.address.state = state;
  if (country) geek.address.country = country;
  if (line1) geek.address.line1 = line1;
  if (line2) geek.address.line2 = line2;
  if (line3) geek.address.line3 = line3;

  /** -------------------------------
   *  1️⃣ Coordinates explicitly sent
   * -------------------------------- */
 // 1️⃣ Coordinates explicitly sent AND valid
if (Array.isArray(coordinates) && coordinates.length > 0) {
  if (
    coordinates.length !== 2 ||
    coordinates.some(c => typeof c !== "number")
  ) {
    return res.status(400).json({
      message: "Invalid coordinates format"
    });
  }

  geek.address.location = {
    type: "Point",
    coordinates
  };
}


// else if (pin && city && state) {
//   const geoCoords = await geocodeAddress({ pin, city, state, country });
//   console.log(geoCoords);
//   if (!geoCoords) {
//     return res.status(400).json({
//       message: "Invalid address. Please verify details."
//     });
//   }

//   geek.address.location = {
//     type: "Point",
//     coordinates: geoCoords
//   };

//   geek.address.isApproximate = false;
// }


// 3️⃣ PIN-only fallback (⚠️ coarse)
else if (pin) {
  const geoCoords = await geocodeAddress.geocodeByPin(pin);
  console.log(geoCoords);

  if (!geoCoords) {
    return res.status(400).json({
      message: "Invalid pincode"
    });
  }

  console.log("Coordinates",geoCoords);

  geek.address.location = {
    type: "Point",
    coordinates: geoCoords
  };

}
  try {
  await geek.save();
} catch (err) {
  console.log(err);
  throw err;
}
 
  res.status(200).json({
    message: "Address updated successfully",
    address: geek.address
  });
});

const verifyGeekAadhaar = asyncHandler(async (req, res) => {
  const { id } = req.user;
  const { idNumber } = req.body;
  

  const geek = await IndividualGeek.findById(id)
  
  
  if (!geek) {
    return res.status(404).json({ message: 'Valid individual Geek not found' });
  }

  if (!idNumber || geek.idProof?.type !== 'Aadhar') {
    return res.status(400).json({ message: 'Valid Aadhaar number not provided' });
  }

  const result = await verifyAadhaarLite(idNumber); // async task submission

    geek.idProof.status = 'Requested';
    geek.idProof.requestId = result.request_id;

    await geek.save(); 
    
  

  await AadhaarVerification.create({
    geek: geek._id,
    idNumber,
    status: 'in_progress',
    response: result,
    requestId:result.request_id
  });

  res.status(202).json({
    message: 'Verification task submitted, check status after a few minutes.',
    requestId: result.request_id,
    taskId: result.task_id
  });
});

  const pollAadhaarStatus = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
  
    const record = await AadhaarVerification.findOne({ requestId }).populate('geek');
    if (!record) return res.status(404).json({ message: 'Task not found' });
  
    const resp = await fetchAdhaarVerificationStatus(requestId);
  
    const latest = resp?.[0]; // response is an array
  
    if (!latest) {
      return res.status(500).json({ message: 'Unexpected response from IDfy' });
    }
  
    record.response = latest;
    record.status = latest.status;
    record.verifiedAt = new Date();
  
    if (latest.status === 'completed') {
      record.geek.idProof.isAdhaarVerified = true;
      record.geek.idProof.idNumber = record.idNumber;
      record.geek.idProof.status = 'Verified';
      record.geek.profileCompletedPercentage+=20;
      await record.geek.save();
    }else{
      record.geek.idProof.status = 'Failed';
      await record.geek.save();
    }
  
    await record.save();
  
    res.status(200).json({
      verified: latest.status === 'completed',
      status: latest.status,
      result: latest
    });
  });


  const logoutGeek = asyncHandler(async (req, res) => {
      res.clearCookie('geek_auth_token', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
      path: '/',
    });

    return res.status(200).json({ message: 'Logged out successfully' });
  });



const bulkUploadGeeks = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

  const filePath = path.join(__dirname, "../uploads/geeks.xlsx");

  if (!fs.existsSync(filePath)) {
      throw new Error("Excel file not found.");
  }

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const results = [];
    const geeksToInsert = [];

    const [allBrands, allCategories, existingGeekDocs] = await Promise.all([
      Brand.find().session(session),
      Category.find().session(session),
      Geek.find({}, "mobile").session(session),
    ]);

    const brandMap = new Map(allBrands.map(b => [b.name.toLowerCase(), b._id]));
    const categoryMap = new Map(allCategories.map(c => [c._id.toString(), c]));
    const existingMobiles = new Set(existingGeekDocs.map(g => g.mobile));

  for (let row of rows) {
      const mobile = row["mobile"]?.toString().trim();

    try {
      const fullName = {
        first: row["first"]?.trim(),
          last: row["last"] !== undefined ? row["last"]?.trim() : "",
        };

        const primarySkillId = row["primarySkill"]?.trim();
        const secondarySkills = row["secondarySkills"];
        const brandsServiced = row["brandsServiced"];
        const yoe = parseInt(row["experience"] || 0);
        const type = row["Type"]?.trim() || "Individual";

        const rawAddress = {
        line1: row["line1"]?.trim(),
          city: row["city"]?.trim(),
          state: row["state"]?.trim(),
          country: row["country"]?.trim(),
          pin: row["pincode"]?.toString().trim(),
      };

        /* ---------- REQUIRED VALIDATION ---------- */

        if (!fullName.first || !fullName.last || !mobile || !primarySkillId || isNaN(yoe)) {
          results.push({ mobile, status: "skipped", reason: "Missing required fields" });
          continue;
        }

        if (!rawAddress.line1 || !rawAddress.city || !rawAddress.pin) {
        results.push({
          mobile,
            status: "skipped",
            reason: "Address incomplete",
          });
        continue;
      }

        if (existingMobiles.has(mobile)) {
        results.push({ mobile, status: "skipped", reason: "Already exists" });
        continue;
      }

        const primaryCategory = categoryMap.get(primarySkillId);
      if (!primaryCategory) {
          results.push({ mobile, status: "failed", reason: "Primary category not found" });
        continue;
      }

        /* ---------- GEOCODE (REQUIRED) ---------- */

        const coords = await geocodeAddress.geocodeByPin(rawAddress.pin);

        if (
          !Array.isArray(coords) ||
          coords.length !== 2 ||
          isNaN(coords[0]) ||
          isNaN(coords[1])
        ) {
          results.push({
            mobile,
            status: "skipped",
            reason: "Invalid address geocode",
          });
          continue;
        }

        /* ---------- CATEGORY COUNTS ---------- */

        primaryCategory.totalGeeks++;

      const secondaryCategories = [];
        if (secondarySkills) {
          for (let skillId of secondarySkills.split(",")) {
            const cat = categoryMap.get(skillId.trim());
            if (cat) {
              cat.totalGeeks++;
              secondaryCategories.push(cat._id);
            }
          }
        }

        /* ---------- BRAND LOOKUP ---------- */

        const brandIds = [];
        if (brandsServiced) {
          for (let b of brandsServiced.split(",")) {
            const id = brandMap.get(b.trim().toLowerCase());
            if (id) brandIds.push(id);
          }
        }

        /* ---------- BUILD DOCUMENT ---------- */

        const address = {
          ...rawAddress,
          location: {
            type: "Point",
            coordinates: [Number(coords[0]), Number(coords[1])],
          },
        };

        const baseGeekData = {
    fullName,
    mobile,
    primarySkill: primaryCategory._id,
    secondarySkills: secondaryCategories,
    yoe,
    brandsServiced: brandIds,
    address,
          createdAt: new Date(),
        };

        geeksToInsert.push(
          type === "Corporate"
            ? { __t: "Corporate", companyName: row["CompanyName"]?.trim(), ...baseGeekData }
            : { __t: "Individual", ...baseGeekData }
        );

        existingMobiles.add(mobile);
        results.push({ mobile, status: "validated" });

    } catch (err) {
      results.push({
          mobile: mobile || "unknown",
        status: "error",
        reason: err.message,
      });
    }
  }

    /* ---------- SAVE COUNTS ---------- */

    for (let category of categoryMap.values()) {
      await category.save({ session });
    }

    /* ---------- BULK INSERT ---------- */

    if (geeksToInsert.length) {
      await Geek.insertMany(geeksToInsert, { session });
    }

    await session.commitTransaction();

  res.status(200).json({
      message: "Bulk upload completed",
      inserted: geeksToInsert.length,
    summary: results,
  });

  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();

    res.status(500).json({
      message: "Bulk upload failed",
      error: err.message,
    });
  } finally {
    session.endSession();
  }
});




// controllers/geekController.ts
const updateGeekRateCard = asyncHandler(async (req, res) => {
  const geekId = req.params.id;
  const rateCards = req.body

  if (!Array.isArray(rateCards) || rateCards.length === 0) {
    return res.status(400).json({ message: "Rate cards array is required" });
  }

  const geek = await Geek.findById(geekId);
  if (!geek) return res.status(404).json({ message: "Geek not found" });

  rateCards.forEach(({ skill, chargeType, rate }) => {
    if (!skill || !chargeType || rate == null) return;

    const existingIndex = geek.rateCard.findIndex(
      (entry) => entry.skill.toString() === skill
    );

    if (existingIndex >= 0) {
      // Update
      geek.rateCard[existingIndex].chargeType = chargeType;
      geek.rateCard[existingIndex].rate = rate;
    } else {
      // Insert
      geek.rateCard.push({ skill, chargeType, rate });
    }
  });

  await geek.save();

  const updatedGeek = await Geek.findById(geekId);

  res.status(200).json(updatedGeek.rateCard);
});

// POST /auth/send-verification
const sendVerificationEmail = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await Geek.findById(userId);

    if (!user) return res.status(404).json({ message: "Geek not found" });
    if (user.isEmailVerified) return res.status(400).json({ message: "Email already verified" });

    // Generate token
    const token = crypto.randomBytes(32).toString("hex");
    user.emailVerificationToken = token;
    user.emailVerificationTokenExpiry = Date.now() + 3600000; // 1 hour
    await user.save();

    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;

        const data={
            to:user.email,
            from:process.env.SMTP_EMAIL,
            subject:"Verify your email",
            text:
            `Hey ${user.fullName.first} ${user.fullName.last},
            
            Please click on the link below to verify your email:
            ${verifyUrl}`,
        }
        await sendMail(data)

    res.status(200).json({ message: "Verification email sent" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// GET /auth/verify-email/:token
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await Geek.findOne({
      emailVerificationToken: token,
      emailVerificationTokenExpiry: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationTokenExpiry = undefined;
    await user.save();

    res.status(200).json({ message: "Email verified successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


const getGeeksByBrand = asyncHandler(async (req, res) => {
    try{
        const { brandId } = req.params;
      if(!brandId){
        return res.status(400).json({ message: 'Brand ID is required' });
      }
      if(!mongoose.Types.ObjectId.isValid(brandId)){
        return res.status(400).json({ message: 'Invalid brand ID' });
      }
      if(!await Brand.findById(brandId)){
        return res.status(404).json({ message: 'Brand not found' });
      }

      
      const geeks = await Geek.find({ brandsServiced: brandId });
      if(geeks.length === 0){
        return res.status(404).json({ message: 'No geeks found for this brand' });
      }
      res.status(200).json(geeks);
    }catch(error){
      res.status(500).json({ message: error.message });
    }
});


const getGeeksByRefCode = asyncHandler(async (req, res) => {
  try {
    let { refCode, startDate, endDate } = req.body;
      console.log(req.body);

    // Normalize values
    refCode = refCode?.trim() || null;
    startDate = startDate ? new Date(startDate) : null;
    endDate = endDate ? new Date(endDate) : null;

    // ✅ CASE 1: No filters at all → return all geeks
    if (!refCode && !startDate && !endDate) {
      const allGeeks = await Geek.find().sort({ createdAt: -1 });

      return res.status(200).json({
        count: allGeeks.length,
        geeks: allGeeks,
      });
    }

    // ✅ Build query dynamically
    const query = {};

    if (refCode) {
      query.refCode = refCode;
    }

    if (startDate || endDate) {
      query.createdAt = {};

      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    const geeks = await Geek.find(query).sort({ createdAt: -1 });

    return res.status(200).json({
      count: geeks.length,
      geeks,
      appliedFilters: {
        refCode,
        startDate,
        endDate,
      },
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});




module.exports = {
  searchGeeks,
  updateGeekDetails,
  updateAvailability,
  deleteGeek,
  updateAddress,
  verifyGeekAadhaar,
  deleteRateCardItem,
  addRateCard,
  sendOtpToPhone,
  verifyOtpAndLogin,
  verifyOtpAndCreateGeek,
  updateProfileImage,
  deleteCertificate,
  uploadCertificate,
  getGeekById,
  findGeekById,
  pollAadhaarStatus,
  logoutGeek,
  bulkUploadGeeks,
  updateGeekRateCard,
  sendVerificationEmail,
  verifyEmail,
  getGeeksByBrand,
  getGeeksByRefCode,
  updateGeekAssignments
};


  