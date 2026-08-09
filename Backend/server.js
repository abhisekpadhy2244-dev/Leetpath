const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
require("dotenv").config();

require("./config/passport");

const app = express();

// Security
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use(
  cors({
    origin: [
      "http://localhost:5000",
      "http://127.0.0.1:5000",
      "http://localhost:5500",
      "http://localhost:3000",
    ],
    credentials: true,
  }),
);
app.use(express.json());

// Session for OAuth
app.use(
  session({
    secret: process.env.SESSION_SECRET || "leetpath-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

// Debug middleware
app.use((req, res, next) => {
  console.log("📨", req.method, req.url);
  console.log("📦 Body:", req.body);
  next();
});

// Serve frontend files
app.use(express.static(path.join(__dirname, "..")));

// Routes
const authRoutes = require("./routes/auth");
const progressRoutes = require("./routes/progress");
const leetcodeRoutes = require("./routes/leetcode");
const googleAuthRoutes = require("./routes/google-auth");

// Rate limiting
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  }),
);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/leetcode", leetcodeRoutes);
app.use("/api/auth/google", googleAuthRoutes);

// Serve index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../index.html"));
});

// Error handling
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.stack);
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
});

// 404 handler
app.use((req, res) => {
  console.log("404 - Route not found:", req.method, req.url);
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Open: http://localhost:${PORT}`);
});
