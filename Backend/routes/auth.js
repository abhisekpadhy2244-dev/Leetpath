const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const Storage = require("../utils/storage");
const auth = require("../middleware/auth");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ---------- REGISTER ----------
router.post("/register", async (req, res) => {
  console.log("🔵 REGISTER endpoint hit!");
  console.log("📝 Request body:", req.body);

  try {
    const { username, email, password } = req.body;
    console.log("📝 Username:", username);
    console.log("📝 Email:", email);
    console.log("📝 Password length:", password?.length);

    // Validate
    if (!username || !email || !password) {
      console.log("❌ Missing fields");
      return res.status(400).json({ message: "All fields are required" });
    }
    if (password.length < 6) {
      console.log("❌ Password too short");
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    // Check existing
    const existingEmail = Storage.findUserByEmail(email);
    console.log("📧 Email exists?", !!existingEmail);
    if (existingEmail) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const existingUsername = Storage.findUserByUsername(username);
    console.log("👤 Username exists?", !!existingUsername);
    if (existingUsername) {
      return res.status(400).json({ message: "Username already taken" });
    }

    // Create user
    console.log("🔒 Hashing password...");
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("✅ Password hashed");

    console.log("💾 Creating user...");
    const user = Storage.createUser({
      username,
      email,
      password: hashedPassword,
    });
    console.log("✅ User created:", user.id);

    // Generate token
    console.log("🔑 Generating token...");
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" },
    );
    console.log("✅ Token generated");

    const { password: _, ...userWithoutPassword } = user;
    console.log("✅ Registration successful!");
    res.status(201).json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error("❌ Registration error:", error);
    console.error("❌ Error stack:", error.stack);
    res.status(500).json({ message: error.message || "Server error" });
  }
});

// ---------- LOGIN ----------
router.post("/login", async (req, res) => {
  console.log("🔵 LOGIN endpoint hit!");
  console.log("📝 Request body:", req.body);

  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = Storage.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" },
    );

    const { password: _, ...userWithoutPassword } = user;
    console.log("✅ Login successful");
    res.json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ message: error.message || "Server error" });
  }
});

// ---------- GET CURRENT USER ----------
router.get("/me", auth, (req, res) => {
  const user = Storage.findUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  const stats = Storage.getUserProgressStats(user.id);
  const { password, ...userWithoutPassword } = user;
  res.json({ user: { ...userWithoutPassword, progressStats: stats } });
});

// ---------- UPDATE LEETCODE USERNAME ----------
router.put("/leetcode-username", auth, (req, res) => {
  const { leetcodeUsername } = req.body;
  if (!leetcodeUsername) {
    return res.status(400).json({ message: "LeetCode username is required" });
  }
  const updatedUser = Storage.updateUser(req.user.id, { leetcodeUsername });
  const { password: _, ...userWithoutPassword } = updatedUser;
  res.json({ message: "LeetCode username updated", user: userWithoutPassword });
});

// ---------- LOGOUT ----------
router.post("/logout", auth, (req, res) => {
  res.json({ message: "Logged out successfully" });
});

// ---------- CLEAR LEETCODE SESSION COOKIE ----------
router.post("/clear-leetcode-session", auth, (req, res) => {
  const updatedUser = Storage.updateUser(req.user.id, { leetcodeSessionCookie: null });
  const { password: _, ...userWithoutPassword } = updatedUser;
  res.json({ message: "LeetCode session cleared", user: userWithoutPassword });
});

// ---------- GOOGLE TOKEN LOGIN ----------
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: "Google credential required" });
    }

    const ticket = await googleClient.verifyIdToken({
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
        username:
          name?.replace(/\s+/g, "_").toLowerCase() || email.split("@")[0],
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
    console.error("Google login error:", error);
    res.status(400).json({ message: "Invalid Google credential" });
  }
});

// Simple admin stats endpoint — protected by a secret key, not by login.
// Usage: GET /api/auth/admin/stats?key=YOUR_ADMIN_KEY
router.get("/admin/stats", (req, res) => {
  if (!process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const users = Storage.getUsers();
  const summary = users.map((u) => ({
    username: u.username,
    email: u.email,
    signedUpVia: u.googleId ? "google" : "email",
    leetcodeConnected: !!u.leetcodeUsername,
    createdAt: u.createdAt,
  }));

  res.json({
    totalUsers: users.length,
    users: summary,
  });
});

module.exports = router;
