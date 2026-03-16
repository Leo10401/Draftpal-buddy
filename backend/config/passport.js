const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.SERVER_URL}/api/auth/google/callback`,
    scope: [
      'profile', 
      'email', 
      'https://www.googleapis.com/auth/gmail.send',
      'https://mail.google.com/'  // Add this more permissive scope for Gmail
    ],
    accessType: 'offline',
    prompt: 'consent'  // Forces consent screen to always appear, ensuring refresh token is issued
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log("Google auth tokens received:", { 
        accessTokenReceived: !!accessToken, 
        refreshTokenReceived: !!refreshToken 
      });

      // Check if user exists
      let user = await User.findOne({ googleId: profile.id });

      if (user) {
        // Update existing user's tokens
        user.googleTokens = {
          access_token: accessToken,
          refresh_token: refreshToken || user.googleTokens.refresh_token, // Keep old refresh token if new one not provided
          expiry_date: Date.now() + (3600 * 1000) // Google tokens typically expire in 1 hour
        };
        await user.save();
        console.log("User updated with tokens:", { 
          hasAccessToken: !!user.googleTokens.access_token, 
          hasRefreshToken: !!user.googleTokens.refresh_token 
        });
      } else {
        // Create new user
        user = await User.create({
          googleId: profile.id,
          email: profile.emails[0].value,
          displayName: profile.displayName,
          firstName: profile.name?.givenName || '',
          lastName: profile.name?.familyName || '',
          photo: profile.photos[0]?.value || '',
          googleTokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
            expiry_date: Date.now() + (3600 * 1000)
          }
        });
        console.log("New user created with tokens:", { 
          hasAccessToken: !!user.googleTokens.access_token, 
          hasRefreshToken: !!user.googleTokens.refresh_token 
        });
      }

      return done(null, user);
    } catch (error) {
      console.error('Google auth error:', error);
      return done(error, null);
    }
  }
));

// Required for passport to work
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});