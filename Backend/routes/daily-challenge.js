const express = require("express");
const router = express.Router();
const axios = require("axios");
const Storage = require("../utils/storage");
const auth = require("../middleware/auth");

const LEETCODE_API = "https://leetcode.com/graphql";
const LEETCODE_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0",
  Referer: "https://leetcode.com",
  Origin: "https://leetcode.com",
};

// In-memory cache: { date: "YYYY-MM-DD", data: {...} }
let dailyCache = { date: null, data: null };

async function fetchDailyChallengeFromLeetCode() {
  const query = `
    query questionOfToday {
      activeDailyCodingChallengeQuestion {
        date
        link
        question {
          title
          titleSlug
          difficulty
          topicTags {
            name
            slug
          }
          content
          stats
          hints
        }
      }
    }
  `;

  const response = await axios.post(
    LEETCODE_API,
    { query },
    { headers: LEETCODE_HEADERS, timeout: 10000 },
  );

  if (response.data.errors) {
    throw new Error(
      response.data.errors[0]?.message || "LeetCode daily challenge query error",
    );
  }

  const challenge =
    response.data.data?.activeDailyCodingChallengeQuestion;
  if (!challenge) throw new Error("No daily challenge found");

  return {
    date: challenge.date,
    title: challenge.question.title,
    titleSlug: challenge.question.titleSlug,
    difficulty: challenge.question.difficulty,
    topicTags: challenge.question.topicTags.map((t) => t.name),
    url: `https://leetcode.com${challenge.link}`,
    content: challenge.question.content,
    stats: challenge.question.stats,
    hints: challenge.question.hints,
  };
}

// GET /api/daily-challenge — public, returns today's cached challenge
router.get("/", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Serve from cache if available for today
    if (dailyCache.date === today && dailyCache.data) {
      return res.json({ ...dailyCache.data, cached: true });
    }

    // Fetch fresh from LeetCode
    const challenge = await fetchDailyChallengeFromLeetCode();
    dailyCache = { date: today, data: challenge };

    res.json({ ...challenge, cached: false });
  } catch (error) {
    console.error("Daily challenge fetch error:", error.message);
    res
      .status(500)
      .json({ message: "Failed to fetch daily challenge: " + error.message });
  }
});

// POST /api/daily-challenge/check — auth required, checks if user solved today's challenge
router.post("/check", auth, async (req, res) => {
  try {
    const user = Storage.findUserById(req.user.id);
    if (!user.leetcodeUsername) {
      return res.status(400).json({ message: "Connect your LeetCode account first" });
    }

    const today = new Date().toISOString().slice(0, 10);

    // Get today's challenge (use cache or fetch)
    let challenge;
    if (dailyCache.date === today && dailyCache.data) {
      challenge = dailyCache.data;
    } else {
      challenge = await fetchDailyChallengeFromLeetCode();
      dailyCache = { date: today, data: challenge };
    }

    // Check if already marked solved today
    if (user.dailyChallenges && user.dailyChallenges[today]?.solved) {
      return res.json({
        solved: true,
        date: today,
        title: challenge.title,
        message: "Already marked as solved today",
      });
    }

    // Fetch recent submissions to check
    const query = `
      query recentSubmissions($username: String!, $limit: Int!) {
        recentSubmissionList(username: $username, limit: $limit) {
          title
          statusDisplay
          timestamp
        }
      }
    `;

    const response = await axios.post(
      LEETCODE_API,
      { query, variables: { username: user.leetcodeUsername, limit: 50 } },
      { headers: LEETCODE_HEADERS, timeout: 10000 },
    );

    if (response.data.errors) {
      throw new Error(response.data.errors[0]?.message || "LeetCode query error");
    }

    const submissions = response.data.data?.recentSubmissionList || [];
    const solvedToday = submissions.some(
      (s) =>
        s.title === challenge.title && s.statusDisplay === "Accepted",
    );

    if (solvedToday) {
      Storage.markDailyChallengeSolved(req.user.id, today);
      return res.json({
        solved: true,
        date: today,
        title: challenge.title,
        message: "Daily challenge completed!",
      });
    }

    res.json({
      solved: false,
      date: today,
      title: challenge.title,
      message: "Not yet solved today's challenge",
    });
  } catch (error) {
    console.error("Daily challenge check error:", error.message);
    res
      .status(500)
      .json({ message: "Failed to check daily challenge: " + error.message });
  }
});

// GET /api/daily-challenge/history — auth required, returns user's daily challenge history
router.get("/history", auth, async (req, res) => {
  try {
    const user = Storage.findUserById(req.user.id);
    const dailyChallenges = user.dailyChallenges || {};
    res.json({ dailyChallenges });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch history: " + error.message });
  }
});

module.exports = router;
