const express = require("express");
const router = express.Router();
const Storage = require("../utils/storage");
const auth = require("../middleware/auth");

// Get all problems
router.get("/problems", auth, (req, res) => {
  const problems = Storage.getProblems();
  const user = Storage.findUserById(req.user.id);
  const problemsWithProgress = problems.map((p) => ({
    ...p,
    status: user.progress[p.id] || "not-attempted",
  }));
  res.json(problemsWithProgress);
});

// Get problems by topic
router.get("/problems/topic/:topic", auth, (req, res) => {
  const problems = Storage.getProblemsByTopic(req.params.topic);
  const user = Storage.findUserById(req.user.id);
  const problemsWithProgress = problems.map((p) => ({
    ...p,
    status: user.progress[p.id] || "not-attempted",
  }));
  res.json(problemsWithProgress);
});

// Update problem status
router.put("/problems/:problemId/status", auth, (req, res) => {
  const { problemId } = req.params;
  const { status } = req.body;

  if (!["not-attempted", "attempted", "completed"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const problem = Storage.getProblemById(parseInt(problemId));
  if (!problem) return res.status(404).json({ message: "Problem not found" });

  Storage.updateUserProgress(req.user.id, problemId, status);
  const stats = Storage.getUserProgressStats(req.user.id);
  res.json({ message: "Progress updated", problemId, status, stats });
});

// Get stats
router.get("/stats", auth, (req, res) => {
  const stats = Storage.getUserProgressStats(req.user.id);
  res.json(stats);
});

// Reset progress
router.post("/reset", auth, (req, res) => {
  Storage.updateUser(req.user.id, { progress: {} });
  const stats = Storage.getUserProgressStats(req.user.id);
  res.json({ message: "Progress reset", stats });
});

// Export progress
router.get("/export", auth, (req, res) => {
  const user = Storage.findUserById(req.user.id);
  res.json({
    username: user.username,
    progress: user.progress,
    stats: Storage.getUserProgressStats(req.user.id),
  });
});

module.exports = router;
