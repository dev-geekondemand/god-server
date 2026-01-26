const Seeker = require('../models/seekerModel');
const asyncHandler = require('express-async-handler');
const { sendOtp, verifyOtp } = require('../utils/otpService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken')
const msalConfig = require('../config/msalConfig');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const sendMail = require('../middlewares/sendMail');
const msalClient = new ConfidentialClientApplication(msalConfig);
const crypto = require('crypto');
const { deleteFromAzure } = require('../utils/azureBlob');
const { uploadToAzure } = require('../middlewares/azureUploads');
const {  geocodeByPin } = require('../utils/geocode');

// /controllers/authController.js
const registerCustomUser = asyncHandler(async (req, res) => {
  let { phone, otp, fullName,refCode } = req.body;

  

  if (!phone || !otp || !fullName?.first || !fullName?.last) {
    return res.status(400).json({ message: 'Phone, OTP, and full name are required' });
  }

  phone = phone.replace(/\D/g, ''); // Remove non-digits
  if (!phone.startsWith("91")) {
    phone = "91" + phone;
  }
  phone = "+" + phone;

  const isVerified = await  verifyOtp(phone, otp);
  if (!isVerified) return res.status(401).json({ message: 'Invalid or expired OTP' });

  // Check if user already exists
  let user = await Seeker.findOne({ phone });
  if (user) return res.status(404).json({ message: 'User already exists. Please login instead.' });

  // Create new user
  user = await Seeker.create({
    authProvider: 'custom',
    authProviderId: phone,
    refCode,
    phone,
    isPhoneVerified: true,
    fullName,
    profileCompleted: true,
    needsReminderToCompleteProfile: true,
  });

  // Generate JWT
  const tokenPayload = {
    id: user._id,
    phone: user.phone,
    provider: user.authProvider,
  };

  const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });

  // Hash the token and save it
  const hashedToken = await bcrypt.hash(token, 10);
  user.authToken = hashedToken;
  await user.save();

  // Set the token in an HttpOnly cookie
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.status(201).json({
    message: 'User registered successfully',
    user: {
      id: user._id,
      phone: user.phone,
      fullName: user.fullName,
      token: token,
    },
  });
});
  

// Update Profile
const updateProfile = asyncHandler(async (req, res) => {
  try {
    const { phone,email, fullName } = req.body;
    if (!req.user) return res.status(401).json({ message: 'Unauthorized access' });
    console.log(req.user);
    const user = await Seeker.findById(req.user.id);

    if (!user) return res.status(404).json({ message: 'User not found' });

    if(user?.authProvider === "custom" && phone && phone !== user.phone){
      console.log("You cannot change your registered Phone");
      return res.status(403).send("You cannot change your registered Phone");
    }

    if(user?.authProvider === "google" && email  && email !== user.email){
      return res.status(403).send("You cannot change your google email.");
    }

    if(user?.authProvider === "microsoft" && email && email !== user.email){
      return res.status(403).send("You cannot change your microsoft email.");
    }

    if(user?.authProvider === "custom" && email){
      user.email = email;
    }

      user.phone = phone;
    
    if(user?.authProvider !== "custom" && phone){
      user.phone = phone;
    }

    user.fullName = fullName || user.fullName;
    if(user?.address?.city && user?.profileImage && user?.isPhoneVerified && user.isEmailVerified){
      user.profileCompleted = true;
      user.needsReminderToCompleteProfile = false;
    }else{
      user.profileCompleted = false;
      user.needsReminderToCompleteProfile = true;
    }
    await user.save();
    res.status(200).json({ message: 'Profile updated', user });
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile', error });
  }
});


const loginWithGoogle = asyncHandler(async(req, res) => {
  const { token } = req.user; // token is returned from passport strategy
  
   // Store JWT token in HttpOnly cookie
      res.cookie('auth_token', token, {
        httpOnly: true, // Can't be accessed by JavaScript
        secure: process.env.NODE_ENV === 'production', // Only for HTTPS in production
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Strict', // Prevent CSRF attacks
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days expiration
      });

  res.redirect(`${process.env.FRONTEND_URL}/login-success?token=${token}`);

}) 

const loginWithGoogleMobile = asyncHandler(async (req, res) => {
  const { token } = req.user; // token from Passport strategy

  // Normally you might store in DB, but for mobile just return JWT
  res.status(200).json({
    success: true,
    token,
    message: "Login successful",
  });
});



const loginWithMS = asyncHandler(async(req,res)=>{
  const tokenRequest = {
        code: req.query.code,
        scopes: ['user.read'],
        redirectUri: `${process.env.BACKEND_URL}/api/seeker/microsoft/callback`,
      }

  try {
    const response = await msalClient.acquireTokenByCode(tokenRequest);
    const profile = response.account;


    let user = await Seeker.findOne({ authProviderId: profile.homeAccountId });


    if (!user) {
      user = await Seeker.create({
        authProvider: 'microsoft',
        authProviderId: profile.homeAccountId,
        email: profile.username,
        isEmailVerified: true,
        fullName: {
          first: profile.name?.split(' ')[0] || 'First',
          last: profile.name?.split(' ')[1] || 'Last',
        },
      });
    }

    const tokenPayload = {
      id: user._id,
      email: user.email,
      provider: user.authProvider,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '7d' });
    const hashedToken = await bcrypt.hash(token, 10);

    user.authToken = hashedToken;
    await user.save();

    res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }).redirect(`${process.env.FRONTEND_URL}/login-success?token=${token}`);
  } catch (err) {
    console.error('Microsoft login error:', err);
    res.send("Soemthing Went Wrong:",err)
  }
})




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

      if (!phone || !otp) return res.status(400).json({ message: 'Phone and OTP are required' });


      phone="+91" + phone;
  
    
      
      // Verify OTP logic (you can integrate with your OTP service)
      const isVerified = await verifyOtp(phone, otp);
      if (!isVerified) return res.status(401).json({ message: 'Invalid or expired OTP' });
    
      // Check if user exists by phone number
      let user = await Seeker.findOne({ phone });
      
    
      if (!user) {
        return res.status(404).json({ message: 'User not Registered. Please Register First' });
      } else {
        user.isPhoneVerified = true;
      }
    
      // Generate JWT token for the user
      const tokenPayload = {
        id: user._id,
        phone: user.phone,
        authProvider: user.authProvider,
      };
    
      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1d' });
    
      // Hash the token using bcrypt
      const hashedToken = await bcrypt.hash(token, 10);
    
      // Save the hashed token to the user record in the database
      user.authToken = hashedToken;
      
      
      await user.save();
    
      // Store JWT token in HttpOnly cookie
      res.cookie('auth_token', token, {
        httpOnly: true, // Can't be accessed by JavaScript
        secure: process.env.NODE_ENV === 'production', // Only for HTTPS in production
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Strict', // Prevent CSRF attacks
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days expiration
      });
    
      return res.status(200).json({
        message: 'Login successful',
        user: {
          _id: user._id,
          phone: user.phone,
          profileCompleted: user.profileCompleted,
          token,
        },
      });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie('auth_token', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Strict',
    path: '/',
  });

  return res.status(200).json({ message: 'Logged out successfully' });
});



const getAllUsers = asyncHandler(async (req, res) => {
  try{
    const users = await Seeker.find();
    res.status(200).json({ users });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching users', error: err });
  }
});

const deleteUser = asyncHandler(async (req, res) => {
  try
    {const { userId } = req.params;
    const user = await Seeker.findByIdAndDelete(userId);    
    if(!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ message: 'User deleted successfully' });
  }catch(err){
    res.status(500).json({ message: 'Error deleting user', error: err });
  }
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
    coordinates // optional: [longitude, latitude]
  } = req.body;

  const user = await Seeker.findById(id);
  
  if (!user) {
    return res.status(404).json({ message: 'Geek not found.' });
  }

  // Only update fields that are provided
  if (!user.address) user.address = {};

  if (pin !== undefined) user.address.pin = pin;
  if (city !== undefined) user.address.city = city;
  if (state !== undefined) user.address.state = state;
  if (country !== undefined) user.address.country = country;
  if (line1 !== undefined) user.address.line1 = line1;
  if (line2 !== undefined) user.address.line2 = line2;
  if (line3 !== undefined) user.address.line3 = line3;

  if (coordinates !== undefined) {
    if (
      !Array.isArray(coordinates) ||
      coordinates.length !== 2 ||
      typeof coordinates[0] !== 'number' ||
      typeof coordinates[1] !== 'number'
    ) {
      return res.status(400).json({ message: 'Invalid coordinates. Expected [longitude, latitude].' });
    }

    user.address.location = {
      type: 'Point',
      coordinates
    };
  }

  else if (pin) {
    const geoCoords = await geocodeByPin(pin);
    console.log(geoCoords);
  
    if (!geoCoords) {
      return res.status(400).json({
        message: "Invalid pincode"
      });
    }
  
    console.log("Coordinates",geoCoords);
  
    user.address.location = {
      type: "Point",
      coordinates: geoCoords
    };
  
  }

  await user.save();

  res.status(200).json({ message: 'Address updated.', newAddress: user?.address });
});


const sendVerificationEmail = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await Seeker.findById(userId);

    if (!user) return res.status(404).json({ message: "Geek not found" });
    if (user.isEmailVerified) return res.status(400).json({ message: "Email already verified" });

    // Generate token
    const token = crypto.randomBytes(32).toString("hex");
    user.emailVerificationToken = token;
    user.emailVerificationTokenExpiry = Date.now() + 3600000; // 1 hour
    await user.save();

    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/seeker/${token}`;

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
    const user = await Seeker.findOne({
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


const getSeekerById = asyncHandler(async (req, res) => {
  const { id } = req.user;
 
  console.log(req)
  
  const user = await Seeker.findById(id).select('-authToken')
  if (!user) return res.status(404).json({ message: 'Seeker not found' });
  return res.status(200).json(user);
});


const updateProfileImage = asyncHandler(async (req, res) => {

   const file = req.file;
  const seekerId = req.params.id;



  if (!file) return res.status(400).json({ message: 'No image uploaded.' });

  // Fetch existing Geek data
  const seeker = await Seeker.findById(seekerId);
  if (!seeker) return res.status(404).json({ message: 'User not found.' });

  // If there is an existing profile image, delete it
  const oldImageUrl = seeker.profileImage;
  if (oldImageUrl) {
  
      await deleteFromAzure(oldImageUrl);
  }

  // Upload the new image
  const imageUrl = await uploadToAzure(file);

  console.log(imageUrl);

  seeker.profileImage = imageUrl?.url;
  await seeker.save();

  res.status(200).json({ message: 'Profile image updated.', imageUrl });

});


const getSeekersByRefCode = asyncHandler(async (req, res) => {
  try {
    let { refCode, startDate, endDate } = req.body;
      console.log(req.body);

    // Normalize values
    refCode = refCode?.trim() || null;
    startDate = startDate ? new Date(startDate) : null;
    endDate = endDate ? new Date(endDate) : null;

    // ✅ CASE 1: No filters at all → return all geeks
    if (!refCode && !startDate && !endDate) {
      const allUsers = await Seeker.find().sort({ createdAt: -1 });

      return res.status(200).json({
        count: allUsers.length,
        seekers: allUsers,
      });
    }

    // ✅ Build query dynamically
    const query = {};

    if (refCode) {
      query.refCode = { $regex: refCode, $options: 'i' };

    }

    if (startDate || endDate) {
      query.createdAt = {};

      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    const seekers = await Seeker.find(query).sort({ createdAt: -1 });

    return res.status(200).json({
      count: seekers.length,
      seekers,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


module.exports = {
  updateProfile,
  sendOtpToPhone,
  verifyOtpAndLogin,
  registerCustomUser,
  getAllUsers,
  deleteUser,
  loginWithGoogle,
  loginWithMS,
  logout,
  updateAddress,
  sendVerificationEmail,
  verifyEmail,
  loginWithGoogleMobile,
  updateProfileImage,
  getSeekersByRefCode
};
