const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID);
const asyncHandler = require("express-async-handler");

const loginWithGoogleMobile = asyncHandler(async (req, res) => {
  try {
    const { idToken } = req.body; // sent from Expo frontend
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    let user = await Seeker.findOne({ authProviderId: googleId }); 

    if (!user) {
      user = await Seeker.create({
        authProvider: "google",
        authProviderId: googleId,
        email,
        isEmailVerified: payload.email_verified || true,
        fullName: {
          first: name?.split(" ")[0],
          last: name?.split(" ")[1] || "",
        },
        profileImage: picture,
      });
    }

    // Issue your app’s JWT
    const tokenPayload = { id: user._id, email: user.email, provider: "google" };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.status(200).json({
      success: true,
      token,
      message: "Login successful",
    });
  } catch (err) {
    console.error("Google login error:", err);
    res.status(401).json({ success: false, message: "Invalid Google token" });
  }
});


module.exports = { loginWithGoogleMobile };