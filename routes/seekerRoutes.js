const express = require("express");
const asyncHandler = require('express-async-handler');
const {updateProfile,
    sendOtpToPhone, 
    registerCustomUser,
    getAllUsers, 
    deleteUser,
     loginWithGoogle,
     loginWithMS,
      verifyOtpAndLogin, 
      logout,
      updateAddress,
      sendVerificationEmail,
      verifyEmail,
      updateProfileImage,
      getSeekersByRefCode,
    } = require('../controllers/seekerController.js')
const multer = require('multer');
const {authenticateJWT, authenticateMobileJWT, protectAdmin} = require("../middlewares/authMiddleware.js")
const passport = require('passport');
const msalConfig = require('../config/msalConfig');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const Seeker = require("../models/seekerModel.js");
const { loginWithGoogleMobile } = require("../controllers/mobileControllers.js");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const {singleUploader, uploadLimiter} = require('../middlewares/azureUploads.js');
const { generateSasUrl } = require("../utils/azureBlob.js");

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_OAUTH_MOBILE_CLIENT_ID);
const msalClient = new ConfidentialClientApplication(msalConfig);

const profileImageUploader = singleUploader(['image/jpeg', 'image/png'], 'profileImage');
router.post('/:id/profile-image', 
  uploadLimiter,
  profileImageUploader,
  updateProfileImage
);

router.post('/custom/send-otp', sendOtpToPhone);
router.post('/custom/register', registerCustomUser);
router.post('/seekers-by-refCode',protectAdmin, getSeekersByRefCode);
router.post('/seeker-login', verifyOtpAndLogin);
router.get('/get-all',getAllUsers)
router.delete('/delete/:userId',deleteUser);

router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })
  );

  router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: '/login' }),
    loginWithGoogle
  );

  router.post("/google/mobile", loginWithGoogleMobile);


  router.post('/push-token', authenticateMobileJWT, async (req, res) => {
    const { seekerId, token } = req.body;
    console.log(seekerId, token);
    if (!seekerId || !token) {
      return res.status(400).json({ message: 'seekerId and token required' });
    }
  
    try {
      await Seeker.findByIdAndUpdate(seekerId, { expoPushToken: token });
      return res.json({ success: true });
    } catch (err) {
      console.error('Error saving push token:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });


  router.get('/microsoft', (req, res) => {
    const authCodeUrlParams = {
      scopes: ['user.read'],
      redirectUri: `${process.env.BACKEND_URL}/api/seeker/microsoft/callback`,
    };
  
    msalClient.getAuthCodeUrl(authCodeUrlParams).then((url) => {
      res.redirect(url);
    });
  });


  router.get('/microsoft/callback',loginWithMS)

router.get('/me', authenticateJWT,asyncHandler( async (req, res) => {
  const user = await Seeker.findById(req.user.id).select('-authToken');
  if(!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  if (user.profileImage?.includes("godstore.blob.core.windows.net")) {
    const blobName = user.profileImage.split("/").pop(); // get the last segment of URL
    const sasUrl = await generateSasUrl(blobName);
    user.profileImage = sasUrl;
  }
  res.status(200).json(user);
}));

router.get('/mobile-me', authenticateMobileJWT,asyncHandler( async (req, res) => {
  const user = await Seeker.findById(req.user.id).select('-authToken');
  if(!user) {
    console.log("User not found");
    return res.status(404).json({ message: 'User not found' });
  }
  // Only generate SAS URL if the image is an Azure blob
  if (user.profileImage?.includes("godstore.blob.core.windows.net")) {
    const blobName = user.profileImage.split("/").pop(); // get the last segment of URL
    const sasUrl = await generateSasUrl(blobName);
    user.profileImage = sasUrl;
  }

  
  res.status(200).json(user);
}));

router.post('/logout', logout);

router.put('/:id/address', authenticateJWT, updateAddress);
router.put('/update-profile', authenticateJWT, updateProfile);

router.post('/verify-mail', authenticateJWT,sendVerificationEmail);
router.post('/verify-mail/:token',authenticateJWT,verifyEmail);




router.post('/google-mobile', async (req, res) => {
  const { id_token } = req.body;
  if (!id_token) {
    return res.status(400).json({ message: "ID token is required" });
  }
  try {
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_OAUTH_MOBILE_CLIENT_ID, // Must match the client ID used in frontend
    });

    const payload = ticket.getPayload();
    const profile = payload;

    console.log("Google profile:", profile);

    const user = await Seeker.findOneAndUpdate(
      { email: profile.email, authProvider: 'google' },
      {
        authProvider: 'google',
          authProviderId: profile.id,
          email: profile.email,
          isEmailVerified: profile.email_verified,
          phone: profile?.phone ? profile.phone : null,
          fullName: {
            first: profile.given_name,
            last: profile.family_name
          },
          profileImage: profile.picture || null,
        },
      { upsert: true, new: true }
    );

    const token = jwt.sign({ id: user?._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (error) {
    console.error("ID token verification failed", error);
    res.status(401).json({ message: "Invalid ID token" });
  }
});

// MICROSOFT SIGN-IN
router.post('/microsoft-mobile', async (req, res) => {
  try {
    const {access_token} = req.body;

    console.log("Access Token:", access_token);
    

    if (!access_token) {
      
      return res.status(400).json({ error: 'Access token is required' });
    }

    // Fetch user profile from Microsoft Graph API
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    

    if (!response.ok) {
      return res.status(400).json({ error: 'Failed to fetch Microsoft user info' });
    }

    const profile = await response.json();

    // Validate essential data
    const email = profile.mail || profile.userPrincipalName;
    const name = profile.displayName;

    if (!email) {
      return res.status(400).json({ error: 'Email not found in Microsoft profile' });
    }

    // Find or create the user
    const user = await Seeker.findOneAndUpdate(
      {
        email,
        authProvider: 'microsoft',
        authProviderId: profile?.id,
      },
      {
        $setOnInsert: {
          fullName: { first: name, last: "" },
          phone: null,
          isEmailVerified: true,
          profileImage: profile.photo || null,
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );


    if(!user?._id) {
      console.log(user);

      return res.status(400).json({ error: 'User not found' });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.json({ token, user });
  } catch (err) {
    console.error('Microsoft OAuth error:', err);
    res.status(500).json({ error: 'Server error during Microsoft login' });
  }
});


  

module.exports = router;