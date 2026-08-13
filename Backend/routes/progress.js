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

// Update problem status — user-facing endpoint. "Completed" is intentionally
// NOT allowed here: it can only be set by the LeetCode sync routes, which
// verify the problem was actually solved on LeetCode. Users can only mark
// something "attempted" (by opening it) or reset it back to "not-attempted".
router.put("/problems/:problemId/status", auth, (req, res) => {
  const { problemId } = req.params;
  const { status } = req.body;

  if (!["not-attempted", "attempted"].includes(status)) {
    return res.status(400).json({
      message:
        "Invalid status. 'Completed' can only be set by syncing your LeetCode account.",
    });
  }

  const problem = Storage.getProblemById(parseInt(problemId));
  if (!problem) return res.status(404).json({ message: "Problem not found" });

  const user = Storage.findUserById(req.user.id);

  // Never let this route downgrade an already-completed problem.
  if (user.progress[problemId] === "completed") {
    const stats = Storage.getUserProgressStats(req.user.id);
    return res.json({
      message: "Already completed",
      problemId,
      status: "completed",
      stats,
    });
  }

  Storage.updateUserProgress(req.user.id, problemId, status);
  const stats = Storage.getUserProgressStats(req.user.id);
  res.json({ message: "Progress updated", problemId, status, stats });
});

// Get stats
router.get("/stats", auth, (req, res) => {
  const stats = Storage.getUserProgressStats(req.user.id);
  res.json(stats);
});

// Get activity log + real streak (powers the calendar heatmap)
router.get("/activity", auth, (req, res) => {
  const log = Storage.getUserActivityLog(req.user.id);
  const streak = Storage.computeStreak(log);
  res.json({ activityLog: log, streak });
});

// Reset progress
router.post("/reset", auth, (req, res) => {
  Storage.updateUser(req.user.id, { progress: {}, activityLog: {} });
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
