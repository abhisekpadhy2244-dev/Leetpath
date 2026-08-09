const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Storage = require("../utils/storage");
const jwt = require("jsonwebtoken");

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  const user = Storage.findUserById(id);
  done(null, user);
});

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleCallbackUrl =
  process.env.GOOGLE_CALLBACK_URL ||
  "http://localhost:5000/api/auth/google/callback";

if (!googleClientId || !googleClientSecret) {
  throw new Error(
    "Google OAuth credentials are missing. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Backend/.env",
  );
}

passport.use(
  new GoogleStrategy(
    {
      clientID: googleClientId,
      clientSecret: googleClientSecret,
      callbackURL: googleCallbackUrl,
      scope: ["profile", "email"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const username = profile.displayName || email.split("@")[0];

        let user = Storage.findUserByEmail(email);

        if (!user) {
          user = Storage.createUser({
            username: username.replace(/\s+/g, "_").toLowerCase(),
            email,
            password: "",
            googleId: profile.id,
            avatar: profile.photos[0]?.value,
          });
        } else if (!user.googleId) {
          user = Storage.updateUser(user.id, {
            googleId: profile.id,
            avatar: profile.photos[0]?.value,
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    },
  ),
);

module.exports = passport;
