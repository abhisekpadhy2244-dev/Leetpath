const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PROBLEMS_FILE = path.join(DATA_DIR, "problems.json");

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
}

class Storage {
  static getUsers() {
    try {
      return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")).users;
    } catch {
      return [];
    }
  }

  static saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2));
  }

  static findUserByEmail(email) {
    return this.getUsers().find((u) => u.email === email);
  }

  static findUserById(id) {
    return this.getUsers().find((u) => u.id === id);
  }

  static findUserByUsername(username) {
    return this.getUsers().find((u) => u.username === username);
  }

  static findUserByGoogleId(googleId) {
    return this.getUsers().find((u) => u.googleId === googleId);
  }

  static createUser(userData) {
    const users = this.getUsers();
    const newUser = {
      id: Date.now().toString(),
      ...userData,
      leetcodeData: {
        totalSolved: 0,
        easySolved: 0,
        mediumSolved: 0,
        hardSolved: 0,
        lastUpdated: null,
      },
      leetcodeSessionCookie: null,
      progress: {},
      activityLog: {}, // { "YYYY-MM-DD": count } — powers the calendar and real streak
      googleId: userData.googleId || null,
      avatar: userData.avatar || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    users.push(newUser);
    this.saveUsers(users);
    return newUser;
  }

  static updateUser(id, updates) {
    const users = this.getUsers();
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) return null;
    users[index] = {
      ...users[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.saveUsers(users);
    return users[index];
  }

  static updateUserProgress(userId, problemId, status) {
    const users = this.getUsers();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) return null;
    users[index].progress[problemId] = status;
    users[index].updatedAt = new Date().toISOString();
    this.saveUsers(users);
    return users[index];
  }

  static getUserProgressStats(userId) {
    const user = this.findUserById(userId);
    if (!user) return null;
    let completed = 0,
      attempted = 0;
    const problems = this.getProblems();
    for (const [id, status] of Object.entries(user.progress)) {
      if (status === "completed") completed++;
      else if (status === "attempted") attempted++;
    }
    return {
      completed,
      attempted,
      total: problems.length,
      percentage: problems.length > 0 ? (completed / problems.length) * 100 : 0,
    };
  }

  static getProblems() {
    try {
      const problems = JSON.parse(fs.readFileSync(PROBLEMS_FILE, "utf8"));
      // Guard against malformed/incomplete entries so one bad row
      // can't break rendering for the whole list.
      return problems.filter(
        (p) =>
          typeof p.id === "number" &&
          typeof p.url === "string" &&
          Array.isArray(p.companies) &&
          Array.isArray(p.topics),
      );
    } catch {
      return [];
    }
  }

  static getProblemById(id) {
    return this.getProblems().find((p) => p.id === id);
  }

  static getProblemsByTopic(topic) {
    return this.getProblems().filter((p) => p.topics.includes(topic));
  }

  // ---- Activity log / streak ----

  // Records one solved problem against a given date (YYYY-MM-DD, server's local date
  // by default). Used to power the calendar heatmap and the real streak calculation.
  static recordActivity(userId, dateStr) {
    const users = this.getUsers();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) return null;
    if (!users[index].activityLog) users[index].activityLog = {};
    users[index].activityLog[dateStr] =
      (users[index].activityLog[dateStr] || 0) + 1;
    users[index].updatedAt = new Date().toISOString();
    this.saveUsers(users);
    return users[index].activityLog;
  }

  static getUserActivityLog(userId) {
    const user = this.findUserById(userId);
    return user?.activityLog || {};
  }

  // Current streak = consecutive days with activity, ending today or yesterday
  // (yesterday still counts as "alive" until today ends, so you don't get
  // flagged as broken the moment midnight passes if you haven't solved yet today).
  static computeStreak(activityLog) {
    const days = Object.keys(activityLog || {}).sort();
    if (days.length === 0)
      return { current: 0, longest: 0, solvedToday: false };

    const toDate = (s) => new Date(s + "T00:00:00Z");
    const oneDay = 24 * 60 * 60 * 1000;
    const todayStr = new Date().toISOString().slice(0, 10);
    const solvedToday = !!activityLog[todayStr];

    // Longest streak, scanning all days in order
    let longest = 1;
    let run = 1;
    for (let i = 1; i < days.length; i++) {
      const diff = (toDate(days[i]) - toDate(days[i - 1])) / oneDay;
      run = diff === 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
    }

    // Current streak: walk backwards from today (or yesterday if nothing today yet)
    let cursor = new Date(todayStr + "T00:00:00Z");
    if (!solvedToday) cursor = new Date(cursor.getTime() - oneDay);
    let current = 0;
    while (true) {
      const key = cursor.toISOString().slice(0, 10);
      if (activityLog[key]) {
        current++;
        cursor = new Date(cursor.getTime() - oneDay);
      } else {
        break;
      }
    }

    return { current, longest, solvedToday };
  }
}

module.exports = Storage;
