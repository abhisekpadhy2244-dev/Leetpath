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
      progress: {},
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
}

module.exports = Storage;
