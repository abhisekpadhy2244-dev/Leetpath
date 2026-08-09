// ==================== CONFIGURATION ====================
const API_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "https://leetpath-19xb.onrender.com";

// ==================== STATE ====================
let authToken = localStorage.getItem("authToken");
let currentUser = JSON.parse(localStorage.getItem("user") || "null");
let allProblems = [];
let currentTopic = "all";
let currentFilterStatus = "all";
let currentFilterDifficulty = "all";
let searchQuery = "";
let streak = 0;

// ==================== DOM HELPERS ====================
const $ = (id) => document.getElementById(id);

// ==================== INIT ====================
document.addEventListener("DOMContentLoaded", async () => {
  setupAuth();
  setupApp();

  const params = new URLSearchParams(window.location.search);
  if (params.get("error") === "auth_failed") {
    showToast("Google sign-in failed. Please try again.", "error");
    history.replaceState(null, "", window.location.pathname);
  }

  if (authToken) {
    const restored = await hydrateCurrentUser();
    if (restored) {
      initApp();
      return;
    }
  }

  openAuth();
});

// ==================== AUTH ====================
function setupAuth() {
  const tabs = document.querySelectorAll(".auth-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const formId = `${tab.dataset.tab}-form`;
      document.querySelectorAll(".auth-form").forEach((f) => {
        const show = f.id === formId;
        f.hidden = !show;
        f.classList.toggle("active", show);
      });
    });
  });

  $("modal-close").addEventListener("click", closeAuth);
  $("auth-modal").addEventListener("click", (e) => {
    if (e.target === $("auth-modal")) closeAuth();
  });

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector(".btn-full");
    setLoading(btn, true, "Signing in...");
    try {
      await login($("login-email").value, $("login-password").value);
      showToast(`Welcome back, ${currentUser.username}!`);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(btn, false, "Sign In");
    }
  });

  $("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector(".btn-full");
    setLoading(btn, true, "Creating...");
    try {
      await register(
        $("register-username").value,
        $("register-email").value,
        $("register-password").value,
      );
      showToast(`Welcome, ${currentUser.username}!`);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(btn, false, "Create Account");
    }
  });

  $("btn-google-login").addEventListener("click", () => initGoogleSignIn());
  $("btn-google-register").addEventListener("click", () => initGoogleSignIn());
}

function initGoogleSignIn() {
  showGoogleLoading(true);
  // Use server-side OAuth redirect flow (requires GOOGLE_CLIENT_ID/SECRET in .env)
  const rand = Math.random().toString(36).slice(2);
  localStorage.setItem("oauth_state", rand);
  window.location.href = `${API_URL}/api/auth/google?state=${rand}`;
}

function handleGoogleCredential(response) {
  googleLogin(response.credential).catch((err) => {
    showGoogleLoading(false);
    showToast(err.message, "error");
  });
}

function setLoading(btn, loading, text) {
  if (!btn) return;
  if (loading) {
    btn.dataset.original = btn.textContent;
    btn.disabled = true;
    btn.textContent = text;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.original || text;
  }
}

function showGoogleLoading(loading) {
  document.querySelectorAll(".btn-google").forEach((btn) => {
    btn.disabled = loading;
    if (loading) btn.style.opacity = "0.6";
    else btn.style.opacity = "1";
  });
}

async function hydrateCurrentUser() {
  if (!authToken) return false;
  try {
    const res = await api(`${API_URL}/api/auth/me`, {
      method: "GET",
      auth: true,
      noContentType: true,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.user)
      throw new Error(data?.message || "Session expired");
    currentUser = data.user;
    localStorage.setItem("user", JSON.stringify(currentUser));
    return true;
  } catch (error) {
    authToken = null;
    currentUser = null;
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    return false;
  }
}

async function login(email, password) {
  const res = await api(`${API_URL}/api/auth/login`, {
    method: "POST",
    body: { email, password },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Login failed");
  }
  const data = await res.json();
  setAuth(data);
}

async function register(username, email, password) {
  const res = await api(`${API_URL}/api/auth/register`, {
    method: "POST",
    body: { username, email, password },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Registration failed");
  }
  const data = await res.json();
  setAuth(data);
}

async function googleLogin(credential) {
  const res = await api(`${API_URL}/api/auth/google`, {
    method: "POST",
    body: { credential },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Google login failed");
  }
  const data = await res.json();
  setAuth(data);
  showToast(`Welcome, ${data.user.username}!`);
}

function setAuth(data) {
  authToken = data.token;
  currentUser = data.user;
  localStorage.setItem("authToken", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
  closeAuth();
  initApp();
}

function logout() {
  authToken = null;
  currentUser = null;
  allProblems = [];
  localStorage.removeItem("authToken");
  localStorage.removeItem("user");
  renderTopics();
  showToast("Signed out", "success");
  openAuth();
}

function api(url, options = {}) {
  const config = {
    method: options.method || "GET",
    headers: {
      ...(options.headers || {}),
    },
  };

  if (options.body && !options.noContentType) {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(options.body);
  }

  if (options.auth !== false && authToken) {
    config.headers["Authorization"] = `Bearer ${authToken}`;
  }

  return fetch(url, config);
}

// ==================== UI STATE ====================
function openAuth() {
  $("auth-modal").classList.add("show");
  $("app-shell").hidden = true;
  document.body.classList.add("modal-open");
}

function closeAuth() {
  $("auth-modal").classList.remove("show");
  document.body.classList.remove("modal-open");
}

function showApp() {
  $("app-shell").hidden = false;
}

// ==================== APP INIT ====================
async function initApp() {
  showApp();
  await loadProblems();
  updateUI();
  applyFilters();
  calculateStreak();
}

// ==================== DATA LOADING ====================
async function loadProblems() {
  try {
    const res = await api(`${API_URL}/api/progress/problems`, { auth: true });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Failed to load problems");
    }
    allProblems = await res.json();
    renderTopics();
  } catch (error) {
    console.error("Load problems error:", error);
    showToast("Failed to load problems: " + error.message, "error");
    if (error.message && error.message.toLowerCase().includes("auth")) logout();
  }
}

// ==================== RENDERING ====================
function renderTopics() {
  const topicCounts = {};
  for (const p of allProblems) {
    for (const t of p.topics || []) {
      topicCounts[t] = (topicCounts[t] || 0) + 1;
    }
  }

  const list = $("topic-list");
  list.innerHTML = "";

  const allItem = createTopicItem(
    "All Topics",
    allProblems.length,
    "all",
    currentTopic === "all",
  );
  list.appendChild(allItem);

  Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([topic, count]) => {
      const item = createTopicItem(
        formatTopicName(topic),
        count,
        topic,
        topic === currentTopic,
      );
      list.appendChild(item);
    });
}

function createTopicItem(name, count, topic, isActive) {
  const li = document.createElement("li");
  li.className = "topic-item" + (isActive ? " active" : "");
  li.dataset.topic = topic;
  li.setAttribute("role", "option");
  li.setAttribute("aria-selected", isActive ? "true" : "false");
  li.innerHTML = `<span class="topic-name">${escapeHtml(name)}</span><span class="topic-count">${count}</span>`;
  li.addEventListener("click", () => selectTopic(topic));
  return li;
}

function selectTopic(topic) {
  currentTopic = topic;
  document.querySelectorAll(".topic-item").forEach((item) => {
    const active = item.dataset.topic === topic;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", active ? "true" : "false");
  });
  applyFilters();
}

function formatTopicName(topic) {
  return topic
    .replace(/([A-Z])/g, " $1")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function applyFilters() {
  try {
    const statusFilter = $("filter-status").value;
    const difficultyFilter = $("filter-difficulty").value;
    searchQuery = $("global-search").value.toLowerCase().trim();

    let filtered = allProblems;

    if (currentTopic !== "all") {
      filtered = filtered.filter((p) =>
        (p.topics || []).includes(currentTopic),
      );
    }
    if (statusFilter !== "all") {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }
    if (difficultyFilter !== "all") {
      filtered = filtered.filter(
        (p) =>
          (p.difficulty || "").toLowerCase() === difficultyFilter.toLowerCase(),
      );
    }
    if (searchQuery) {
      filtered = filtered.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(searchQuery) ||
          (p.companies || []).some((c) =>
            c.toLowerCase().includes(searchQuery),
          ) ||
          (p.topics || []).some((t) => t.toLowerCase().includes(searchQuery)) ||
          String(p.id) === searchQuery,
      );
    }

    renderProblems(filtered);
    updateTopicProgress(filtered.length);
    updateStatCardActive(statusFilter);
  } catch (error) {
    console.error("applyFilters error:", error);
    showToast("Something went wrong filtering problems", "error");
  }
}

function updateStatCardActive(statusFilter) {
  ["card-completed", "card-attempted", "card-total"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    const isActive =
      (id === "card-completed" && statusFilter === "completed") ||
      (id === "card-attempted" && statusFilter === "attempted") ||
      (id === "card-total" && statusFilter === "all");
    el.classList.toggle("stat-card-active", isActive);
  });
}

function renderProblems(problems) {
  const tbody = $("problems-tbody");
  tbody.innerHTML = "";

  if (problems.length === 0) {
    $("table-empty").hidden = false;
    $("results-count").textContent = "0 problems";
    $("problems-tbody").hidden = true;
    return;
  }
  $("table-empty").hidden = true;
  $("problems-tbody").hidden = false;
  $("results-count").textContent =
    `${problems.length} problem${problems.length > 1 ? "s" : ""}`;

  const fragment = document.createDocumentFragment();

  problems.forEach((p, index) => {
    // Skip any malformed entry instead of letting it break the whole table.
    if (!p || typeof p.id === "undefined" || !p.difficulty) return;

    const row = document.createElement("tr");
    row.style.animationDelay = `${Math.min(index * 0.03, 0.5)}s`;
    row.innerHTML = `
      <td class="col-status">
        <span class="status-badge ${p.status}" data-id="${p.id}" role="button" tabindex="0" aria-label="Toggle status for ${escapeHtml(p.name)}">
          <span class="status-icon">${getStatusIcon(p.status)}</span>
          <span>${formatStatus(p.status)}</span>
        </span>
      </td>
      <td class="col-id">${p.id}</td>
      <td class="col-problem">
        <a href="${p.url}" target="_blank" rel="noopener" class="problem-link">${escapeHtml(p.name)}</a>
      </td>
      <td class="col-difficulty">
        <span class="difficulty-badge ${p.difficulty.toLowerCase()}">${p.difficulty}</span>
      </td>
      <td class="col-topics">
        <div class="topic-tags">
          ${(p.topics || [])
            .slice(0, 2)
            .map(
              (t) =>
                `<span class="topic-tag">${escapeHtml(formatTopicName(t))}</span>`,
            )
            .join("")}
        </div>
      </td>
      <td class="col-companies">
        <div class="company-tags">
          ${(p.companies || [])
            .slice(0, 3)
            .map((c) => `<span class="company-tag">${escapeHtml(c)}</span>`)
            .join("")}
          ${(p.companies || []).length > 3 ? `<span class="company-tag">+${p.companies.length - 3}</span>` : ""}
        </div>
      </td>
    `;
    fragment.appendChild(row);
  });
  tbody.appendChild(fragment);

  // Status cycling
  tbody.querySelectorAll(".status-badge").forEach((badge) => {
    const cycle = () => cycleStatus(parseInt(badge.dataset.id), badge);
    badge.addEventListener("click", cycle);
    badge.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cycle();
      }
    });
  });
}

function getStatusIcon(status) {
  return status === "completed" ? "✓" : status === "attempted" ? "⟳" : "○";
}

function formatStatus(status) {
  return status
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function cycleStatus(problemId, badgeEl) {
  const statuses = ["not-attempted", "attempted", "completed"];
  const current = badgeEl.classList.contains("completed")
    ? "completed"
    : badgeEl.classList.contains("attempted")
      ? "attempted"
      : "not-attempted";
  const next = statuses[(statuses.indexOf(current) + 1) % statuses.length];

  badgeEl.style.pointerEvents = "none";

  try {
    const res = await api(
      `${API_URL}/api/progress/problems/${problemId}/status`,
      {
        method: "PUT",
        body: { status: next },
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Failed to update status");
    }

    const problem = allProblems.find((p) => p.id === problemId);
    if (problem) problem.status = next;

    badgeEl.className = `status-badge ${next}`;
    badgeEl.querySelector(".status-icon").textContent = getStatusIcon(next);
    badgeEl.querySelector("span:last-child").textContent = formatStatus(next);

    updateStats();
    updateTopicProgress();
    showToast(`Marked as ${formatStatus(next)}`);
  } catch (error) {
    console.error("Update status error:", error);
    showToast(error.message, "error");
  } finally {
    badgeEl.style.pointerEvents = "";
  }
}

// ==================== STATS & PROGRESS ====================
function updateStats() {
  const completed = allProblems.filter((p) => p.status === "completed").length;
  const attempted = allProblems.filter((p) => p.status === "attempted").length;
  const total = allProblems.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  $("stat-completed").textContent = completed;
  $("stat-attempted").textContent = attempted;
  $("stat-total").textContent = total;
  $("stat-streak").textContent = streak;

  $("overview-percent").textContent = percent + "%";
  $("overview-fraction").textContent = `${completed} / ${total}`;
  const circumference = 326.7;
  $("overview-ring").style.strokeDashoffset =
    circumference * (1 - percent / 100);
  $("overview-bar").style.width = percent + "%";

  $("bp-completed").textContent = completed;
  $("bp-attempted").textContent = attempted;
  $("bp-remaining").textContent = total - completed - attempted;
  $("overview-title").textContent =
    currentTopic === "all" ? "All Problems" : formatTopicName(currentTopic);
}

function updateTopicProgress(filteredCount) {
  const topicProblems =
    currentTopic === "all"
      ? allProblems
      : allProblems.filter((p) => p.topics.includes(currentTopic));
  const completed = topicProblems.filter(
    (p) => p.status === "completed",
  ).length;
  const total = topicProblems.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  $("current-topic-title").textContent =
    currentTopic === "all" ? "All Problems" : formatTopicName(currentTopic);
  if (typeof filteredCount === "number") {
    $("results-count").textContent =
      `${filteredCount} problem${filteredCount !== 1 ? "s" : ""}`;
  }
}

// ==================== USER UI ====================
function updateUI() {
  if (!currentUser) return;
  const avatarEl = $("user-avatar");
  const dropdownAvatar = $("dropdown-avatar");
  $("dropdown-name").textContent = currentUser.username;
  $("dropdown-email").textContent = currentUser.email;

  if (currentUser.avatar) {
    setAvatar(avatarEl, currentUser.avatar);
    setAvatar(dropdownAvatar, currentUser.avatar);
  } else {
    const initials = (currentUser.username || "?").charAt(0).toUpperCase();
    avatarEl.textContent = initials;
    avatarEl.classList.add("initial");
    avatarEl.style.backgroundImage = "";
    dropdownAvatar.textContent = initials;
    dropdownAvatar.classList.add("initial");
    dropdownAvatar.style.backgroundImage = "";
  }

  if (currentUser.leetcodeUsername) {
    $("lc-username-input").value = currentUser.leetcodeUsername;
    $("leetcode-stats").hidden = false;
    if (currentUser.leetcodeData) updateLeetCodeStats(currentUser.leetcodeData);
  } else {
    $("leetcode-stats").hidden = true;
  }
}

function updateLeetCodeStats(data) {
  $("lc-total").textContent = data.totalSolved || 0;
  $("lc-easy").textContent = data.easySolved || 0;
  $("lc-medium").textContent = data.mediumSolved || 0;
  $("lc-hard").textContent = data.hardSolved || 0;
}

// ==================== LEETCODE INTEGRATION ====================
async function connectLeetCode() {
  const username = $("lc-username-input").value.trim();
  if (!username) {
    showToast("Please enter a LeetCode username", "error");
    return;
  }
  try {
    const res = await api(`${API_URL}/api/leetcode/verify`, {
      method: "POST",
      body: { username },
    });
    const data = await res.json();
    if (!res.ok || !data.valid)
      throw new Error(data.message || "LeetCode user not found");

    const updateRes = await api(`${API_URL}/api/auth/leetcode-username`, {
      method: "PUT",
      body: { leetcodeUsername: username },
    });
    const updateData = await updateRes.json();
    if (!updateRes.ok)
      throw new Error(updateData.message || "Failed to update");

    currentUser.leetcodeUsername = username;
    currentUser.leetcodeData = data.stats;
    localStorage.setItem("user", JSON.stringify(currentUser));
    updateUI();
    showToast("LeetCode connected!");
  } catch (error) {
    console.error("Connect LeetCode error:", error);
    showToast(error.message, "error");
  }
}

async function syncWithLeetCode() {
  try {
    showToast("Syncing with LeetCode...", "success");
    const res = await api(`${API_URL}/api/leetcode/sync`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Sync failed");

    await loadProblems();
    updateUI();
    updateStats();
    applyFilters();
    showToast(data.message || "Synced!");
  } catch (error) {
    console.error("Sync error:", error);
    showToast(error.message, "error");
  }
}

// ==================== EXPORT / RESET ====================
async function exportProgress() {
  try {
    const res = await api(`${API_URL}/api/progress/export`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Export failed");

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leetpath-progress-${currentUser.username}-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Progress exported!");
  } catch (error) {
    console.error("Export error:", error);
    showToast(error.message, "error");
  }
}

async function resetProgress() {
  if (!confirm("Reset ALL your progress? This cannot be undone.")) return;

  try {
    const res = await api(`${API_URL}/api/progress/reset`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Reset failed");

    await loadProblems();
    updateStats();
    applyFilters();
    showToast("Progress reset!");
  } catch (error) {
    console.error("Reset error:", error);
    showToast(error.message, "error");
  }
}

// ==================== STREAK (mock for demo) ====================
function calculateStreak() {
  // Count completed problems as a simple proxy, or read from localStorage
  streak = parseInt(localStorage.getItem("leetpath_streak") || "0");
  if (allProblems.some((p) => p.status === "completed")) {
    streak = Math.max(streak, 1);
  }
  updateStats();
}

// ==================== TOAST ====================
function showToast(message, type = "success") {
  const container = $("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : "success"}`;
  const icon = type === "error" ? "✕" : message.includes("...") ? "⟳" : "✓";
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 350);
  }, 3000);
}

// ==================== USER MENU ====================
let userMenuBound = false;
function setupUserMenu(force) {
  const dropdown = $("user-dropdown");
  const willShow = typeof force === "undefined" ? dropdown.hidden : force;
  dropdown.hidden = !willShow;
  $("user-avatar-btn").setAttribute(
    "aria-expanded",
    willShow ? "true" : "false",
  );
}

// ==================== SHORTCUTS ====================
function openShortcuts() {
  if (typeof $("shortcuts-dialog").showModal === "function") {
    $("shortcuts-dialog").showModal();
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==================== AVATAR HELPER ====================
function setAvatar(el, url) {
  el.style.backgroundImage = `url('${url}')`;
  el.textContent = "";
  el.style.backgroundSize = "cover";
  el.style.backgroundPosition = "center";
}

// ==================== GLOBAL SETUP ====================
function setupApp() {
  // User menu toggle
  const avatarBtn = $("user-avatar-btn");
  avatarBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setupUserMenu();
  });
  document.addEventListener("click", (e) => {
    if (!$("user-dropdown").hidden && !e.target.closest(".user-menu")) {
      setupUserMenu(false);
    }
  });

  // Dropdown actions
  $("btn-connect-lc").addEventListener("click", connectLeetCodeFull);
  $("btn-sync-lc").addEventListener("click", syncWithLeetCode);
  $("btn-export").addEventListener("click", exportProgress);
  $("btn-reset").addEventListener("click", resetProgress);
  $("btn-logout").addEventListener("click", logout);

  // Filters & search
  $("filter-status").addEventListener("change", applyFilters);
  $("filter-difficulty").addEventListener("change", applyFilters);
  $("global-search").addEventListener("input", applyFilters);

  // Clickable stat cards -> filter by status
  document.querySelectorAll(".stat-card[data-filter]").forEach((card) => {
    const activate = () => {
      $("filter-status").value = card.dataset.filter;
      applyFilters();
      $("problems-tbody")
        .closest(".card")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    card.addEventListener("click", activate);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });

  // Keyboard shortcuts
  const searchInput = $("global-search");
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      searchInput.focus();
    }
    if (
      e.key === "/" &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
    ) {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === "Escape" && document.activeElement === searchInput) {
      searchInput.value = "";
      searchInput.blur();
      applyFilters();
    }
    if (e.shiftKey && e.key === "?") {
      e.preventDefault();
      openShortcuts();
    }
  });

  $("close-shortcuts").addEventListener("click", () =>
    $("shortcuts-dialog").close(),
  );
}

function connectLeetCodeFull() {
  connectLeetCode();
}
