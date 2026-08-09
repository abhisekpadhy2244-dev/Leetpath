const express = require("express");
const router = express.Router();
const passport = require("passport");
const jwt = require("jsonwebtoken");
const Storage = require("../utils/storage");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5000";

// Initiate Google OAuth
router.get(
  "/",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  }),
);

// Google OAuth callback
router.get(
  "/callback",
  passport.authenticate("google", {
    failureRedirect: `${FRONTEND_URL}?error=auth_failed`,
    session: false,
  }),
  (req, res) => {
    const token = jwt.sign(
      { userId: req.user.id },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" },
    );

    const { password, ...userWithoutPassword } = req.user;

    res.redirect(
      `${FRONTEND_URL}/auth-success.html?token=${token}&user=${encodeURIComponent(
        JSON.stringify(userWithoutPassword),
      )}`,
    );
  },
);

// Link Google account (for existing users)
router.post("/link", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: "Google credential required" });
    }

    const { OAuth2Client } = require("google-auth-library");
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    const googleId = payload.sub;
    const name = payload.name;
    const picture = payload.picture;

    let user = Storage.findUserByEmail(email);

    if (!user) {
      user = Storage.createUser({
        username: name?.replace(/\s+/g, "_").toLowerCase() || email.split("@")[0],
        email,
        password: "",
        googleId,
        avatar: picture,
      });
    } else if (!user.googleId) {
      user = Storage.updateUser(user.id, {
        googleId,
        avatar: picture,
      });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" },
    );

    const { password, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error("Google link error:", error);
    res.status(400).json({ message: "Invalid Google credential" });
  }
});

module.exports = router;