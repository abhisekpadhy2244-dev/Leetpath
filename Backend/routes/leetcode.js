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

// Pull the titleSlug out of a problem's stored LeetCode URL, e.g.
// "https://leetcode.com/problems/two-sum/" -> "two-sum"
function slugFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/problems\/([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

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
    { query, variables: { username } },
    { headers: LEETCODE_HEADERS, timeout: 10000 },
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

// Quick sync — only sees your last ~20 submissions (LeetCode's public API limit)
 // If session cookie is saved (or provided), also performs full history sync
 router.post("/sync", auth, async (req, res) => {
   try {
     const user = Storage.findUserById(req.user.id);
     if (!user.leetcodeUsername) {
       return res
         .status(400)
         .json({ message: "Please connect your LeetCode account first" });
     }

     // Check if a new session cookie was provided in the request body
     const providedCookie = req.body?.sessionCookie?.trim();
     const cookieToUse = providedCookie || user.leetcodeSessionCookie;

     // If a new cookie was provided, save it for future syncs
     if (providedCookie && providedCookie !== user.leetcodeSessionCookie) {
       Storage.updateUser(req.user.id, { leetcodeSessionCookie: providedCookie });
       user.leetcodeSessionCookie = providedCookie; // update local reference for this request
     }

     // First, do the quick sync (recent submissions)
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
       throw new Error(
         response.data.errors[0]?.message || "LeetCode query error",
       );
     }

     const submissions = response.data.data?.recentSubmissionList || [];
     let updatedCount = 0;
     let attemptedFromSync = 0;
     const problems = Storage.getProblems();

     for (const submission of submissions) {
       const problem = problems.find((p) => p.name === submission.title);
       if (!problem) continue;

       if (submission.statusDisplay === "Accepted") {
         if (user.progress[problem.id] !== "completed") {
           Storage.updateUserProgress(req.user.id, problem.id, "completed");
           // LeetCode's timestamp is unix seconds — convert to the actual
           // solve date so the calendar reflects reality, not "today".
           const solvedDate = submission.timestamp
             ? new Date(parseInt(submission.timestamp) * 1000)
                 .toISOString()
                 .slice(0, 10)
             : new Date().toISOString().slice(0, 10);
           Storage.recordActivity(req.user.id, solvedDate);
           updatedCount++;
         }
       } else {
         // Any other recent submission (Wrong Answer, TLE, Runtime Error, etc.)
         // still counts as a real attempt — don't leave it as "not-attempted"
         // just because it wasn't accepted yet. Never downgrade a completed one.
         if (
           !user.progress[problem.id] ||
           user.progress[problem.id] === "not-attempted"
         ) {
           Storage.updateUserProgress(req.user.id, problem.id, "attempted");
           attemptedFromSync++;
         }
       }
     }

     // If we have a session cookie (saved or provided), also do full history sync
     let completedCount = 0;
     let attemptedCount = 0;
     let fullSyncDone = false;

     if (cookieToUse) {
       try {
         const fullSyncResponse = await axios.get("https://leetcode.com/api/problems/all/", {
           headers: {
             "User-Agent": "Mozilla/5.0",
             Referer: "https://leetcode.com",
             Cookie: `LEETCODE_SESSION=${cookieToUse}`,
           },
           timeout: 15000,
         });

         const pairs = fullSyncResponse.data?.stat_status_pairs;
         if (Array.isArray(pairs)) {
           const slugMap = new Map();
           for (const p of problems) {
             const slug = slugFromUrl(p.url);
             if (slug) slugMap.set(slug, p);
           }

           for (const pair of pairs) {
             const slug = pair.stat?.question__title_slug;
             if (!slug) continue;
             const problem = slugMap.get(slug);
             if (!problem) continue;

             if (pair.status === "ac") {
               if (user.progress[problem.id] !== "completed") {
                 Storage.updateUserProgress(req.user.id, problem.id, "completed");
                 completedCount++;
               }
             } else if (pair.status === "notac") {
               if (
                 !user.progress[problem.id] ||
                 user.progress[problem.id] === "not-attempted"
               ) {
                 Storage.updateUserProgress(req.user.id, problem.id, "attempted");
                 attemptedCount++;
               }
             }
           }
           fullSyncDone = true;
         }
       } catch (fullSyncError) {
         // Session cookie might be expired - don't fail the whole request
         console.warn("Full sync with cookie failed:", fullSyncError.message);
         if (providedCookie) {
           // If the provided cookie failed, clear it so user knows to update
           Storage.updateUser(req.user.id, { leetcodeSessionCookie: null });
         }
       }
     }

     const stats = await fetchLeetCodeStats(user.leetcodeUsername);
     Storage.updateUser(req.user.id, {
       leetcodeData: { ...stats, lastUpdated: new Date().toISOString() },
     });

     let message = `Synced: ${updatedCount} newly completed, ${attemptedFromSync} newly attempted`;
     if (fullSyncDone) {
       message += `. Full history sync: ${completedCount} completed, ${attemptedCount} attempted`;
     }
     if (providedCookie) {
       message += `. Session cookie saved for future syncs.`;
     }

     res.json({
       message,
       stats,
       progressStats: Storage.getUserProgressStats(req.user.id),
     });
   } catch (error) {
     res.status(500).json({ message: "Failed to sync: " + error.message });
   }
 });

// Full-history sync — uses saved session cookie if available, otherwise requires new one
router.post("/full-sync", auth, async (req, res) => {
  const { sessionCookie } = req.body;
  const user = Storage.findUserById(req.user.id);
  
  // Use provided cookie or fall back to saved one
  const cookieToUse = sessionCookie?.trim() || user.leetcodeSessionCookie;
  
  if (!cookieToUse) {
    return res
      .status(400)
      .json({ message: "LeetCode session cookie is required (provide one or save it first)" });
  }

  if (!user.leetcodeUsername) {
    return res
      .status(400)
      .json({ message: "Please connect your LeetCode account first" });
  }

  try {
    const response = await axios.get("https://leetcode.com/api/problems/all/", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://leetcode.com",
        Cookie: `LEETCODE_SESSION=${cookieToUse}`,
      },
      timeout: 15000,
    });

    const pairs = response.data?.stat_status_pairs;
    if (!Array.isArray(pairs)) {
      throw new Error(
        "Unexpected response from LeetCode — session cookie may be invalid or expired",
      );
    }

    // Build a slug -> local problem lookup once
    const problems = Storage.getProblems();
    const slugMap = new Map();
    for (const p of problems) {
      const slug = slugFromUrl(p.url);
      if (slug) slugMap.set(slug, p);
    }

    let completedCount = 0;
    let attemptedCount = 0;

    for (const pair of pairs) {
      const slug = pair.stat?.question__title_slug;
      if (!slug) continue;
      const problem = slugMap.get(slug);
      if (!problem) continue;

      if (pair.status === "ac") {
        if (user.progress[problem.id] !== "completed") {
          Storage.updateUserProgress(req.user.id, problem.id, "completed");
          completedCount++;
        }
      } else if (pair.status === "notac") {
        if (
          !user.progress[problem.id] ||
          user.progress[problem.id] === "not-attempted"
        ) {
          Storage.updateUserProgress(req.user.id, problem.id, "attempted");
          attemptedCount++;
        }
      }
    }

    const stats = await fetchLeetCodeStats(user.leetcodeUsername);
    const updateData = {
      leetcodeData: { ...stats, lastUpdated: new Date().toISOString() },
    };
    // Only save session cookie if a new one was provided
    if (sessionCookie && sessionCookie.trim()) {
      updateData.leetcodeSessionCookie = sessionCookie.trim();
    }
    Storage.updateUser(req.user.id, updateData);

    let message = `Full sync complete — marked ${completedCount} newly completed and ${attemptedCount} newly attempted`;
    if (sessionCookie && sessionCookie.trim()) {
      message += `. Session saved for future syncs.`;
    }

    res.json({
      message,
      completedCount,
      attemptedCount,
      stats,
      progressStats: Storage.getUserProgressStats(req.user.id),
    });
  } catch (error) {
    const status = error.response?.status === 403 ? 401 : 500;
    res.status(status).json({
      message:
        status === 401
          ? "LeetCode rejected that session cookie — it may be expired. Please log into leetcode.com again and grab a fresh one."
          : "Full sync failed: " + error.message,
    });
  }
});

module.exports = router;
