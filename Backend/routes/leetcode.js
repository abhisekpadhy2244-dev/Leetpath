const express = require("express");
const router = express.Router();
const axios = require("axios");
const Storage = require("../utils/storage");
const auth = require("../middleware/auth");

const LEETCODE_API = "https://leetcode.com/graphql";

async function fetchLeetCodeStats(username) {
  const query = `
    query userProfile($username: String!) {
      matchedUser(username: $username) {
        username
        submitStats: submitStatsGlobal {
          acSubmissionNum { difficulty count submissions }
        }
        profile { realName userAvatar ranking }
      }
    }
  `;

  const response = await axios.post(
    LEETCODE_API,
    {
      query,
      variables: { username },
    },
    {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
        Referer: "https://leetcode.com",
        Origin: "https://leetcode.com",
      },
      timeout: 10000,
    },
  );

  if (response.data.errors) {
    throw new Error(response.data.errors[0]?.message || "LeetCode query error");
  }

  const data = response.data.data;
  if (!data.matchedUser) throw new Error("User not found on LeetCode");

  const stats = data.matchedUser.submitStats.acSubmissionNum;
  return {
    username: data.matchedUser.username,
    totalSolved: stats.find((s) => s.difficulty === "All")?.count || 0,
    easySolved: stats.find((s) => s.difficulty === "Easy")?.count || 0,
    mediumSolved: stats.find((s) => s.difficulty === "Medium")?.count || 0,
    hardSolved: stats.find((s) => s.difficulty === "Hard")?.count || 0,
    ranking: data.matchedUser.profile.ranking || 0,
    realName: data.matchedUser.profile.realName || "",
    avatar: data.matchedUser.profile.userAvatar || "",
  };
}

// Get LeetCode stats
router.get("/stats", auth, async (req, res) => {
  try {
    const user = Storage.findUserById(req.user.id);
    if (!user.leetcodeUsername) {
      return res
        .status(400)
        .json({ message: "Please connect your LeetCode account first" });
    }

    const stats = await fetchLeetCodeStats(user.leetcodeUsername);
    Storage.updateUser(req.user.id, {
      leetcodeData: { ...stats, lastUpdated: new Date().toISOString() },
    });

    res.json(stats);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch LeetCode stats: " + error.message });
  }
});

// Verify LeetCode username
router.post("/verify", auth, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username)
      return res.status(400).json({ message: "Username is required" });

    const stats = await fetchLeetCodeStats(username);
    res.json({ valid: true, stats });
  } catch (error) {
    res.status(404).json({ valid: false, message: "LeetCode user not found" });
  }
});

// Sync with LeetCode
router.post("/sync", auth, async (req, res) => {
  try {
    const user = Storage.findUserById(req.user.id);
    if (!user.leetcodeUsername) {
      return res
        .status(400)
        .json({ message: "Please connect your LeetCode account first" });
    }

    const query = `
      query recentSubmissions($username: String!, $limit: Int!) {
        recentSubmissionList(username: $username, limit: $limit) {
          title
          statusDisplay
        }
      }
    `;

    const response = await axios.post(
      LEETCODE_API,
      {
        query,
        variables: { username: user.leetcodeUsername, limit: 50 },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
          Referer: "https://leetcode.com",
          Origin: "https://leetcode.com",
        },
        timeout: 10000,
      },
    );

    if (response.data.errors) {
      throw new Error(
        response.data.errors[0]?.message || "LeetCode query error",
      );
    }

    const submissions = response.data.data?.recentSubmissionList || [];
    let updatedCount = 0;
    const problems = Storage.getProblems();

    for (const submission of submissions) {
      if (submission.statusDisplay === "Accepted") {
        const problem = problems.find((p) => p.name === submission.title);
        if (problem && user.progress[problem.id] !== "completed") {
          Storage.updateUserProgress(req.user.id, problem.id, "completed");
          updatedCount++;
        }
      }
    }

    const stats = await fetchLeetCodeStats(user.leetcodeUsername);
    Storage.updateUser(req.user.id, {
      leetcodeData: { ...stats, lastUpdated: new Date().toISOString() },
    });

    res.json({
      message: `Synced ${updatedCount} new completed problems`,
      stats,
      progressStats: Storage.getUserProgressStats(req.user.id),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to sync: " + error.message });
  }
});

module.exports = router;
