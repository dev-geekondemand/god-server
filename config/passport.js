const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Seeker = require('../models/seekerModel');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    callbackURL: `${process.env.BACKEND_URL}/api/seeker/google/callback`
  },
  async (accessToken, refreshToken, profile, done) => {
    
    try {
      let user = await Seeker.findOne({ authProviderId: profile.id });
      
      if (!user) {
        user = await Seeker.create({ 
          authProvider: 'google',
          authProviderId: profile.id,
          email: profile.emails[0].value,
          isEmailVerified: profile.emails[0].verified || true,
          phone: profile?.phone ? profile.phone : null,
          fullName: {
            first: profile.name.givenName,
            last: profile.name.familyName
          },
          profileImage: profile.photos[0].value,
        });
      }

      // Create JWT
      const tokenPayload = {
        id: user._id,
        email: user.email,
        provider: user.authProvider
      };
      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
        expiresIn: '7d',
      });

      // Hash and store in DB
      const hashedToken = await bcrypt.hash(token, 10);
      user.authToken = hashedToken;
      await user.save();

      return done(null, { token });
    } catch (err) {
      console.log(err);
      
      return done(err, null);
    }
  }
));
