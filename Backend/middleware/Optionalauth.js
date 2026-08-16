const jwt = require("jsonwebtoken");
const Storage = require("../utils/storage");

// Like the real `auth` middleware, but never rejects the request.
// If a valid token is present AND the user still exists, req.user is set
// to the same shape auth.js uses (full user object minus password).
// If the token is missing, invalid, expired, or the user no longer
// exists, the request just proceeds as a guest (req.user stays undefined).
//
// Use this on routes that should work both logged-in and logged-out —
// e.g. browsing the problem list before signing in.
module.exports = (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return next();

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key",
    );
    const user = Storage.findUserById(decoded.userId);
    if (!user) return next();

    const { password, ...userWithoutPassword } = user;
    req.user = userWithoutPassword;
    req.token = token;
  } catch {
    // invalid/expired token — just proceed as a guest, don't block
  }
  next();
};
