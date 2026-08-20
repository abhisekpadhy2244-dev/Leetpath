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

// ==================== GLOBAL SAFETY NET ====================
// Catches any error that would otherwise silently break the page (or leave
// it in a frozen/half-rendered state) and turns it into a visible, recoverable
// toast instead. This is a last line of defense, not a replacement for fixing
// the actual bug — but it means one unexpected error in one interaction can
// never take down the whole app for the user.
let lastErrorToastAt = 0;
function reportUnexpectedError(err) {
  console.error("Unexpected error:", err);
  const now = Date.now();
  if (now - lastErrorToastAt < 2000) return; // avoid a toast storm if errors repeat rapidly
  lastErrorToastAt = now;
  try {
    showToast("Something went wrong — please try again.", "error");
  } catch {
    /* showToast itself may not be ready yet during very early load; ignore */
  }
}
window.addEventListener("error", (e) =>
  reportUnexpectedError(e.error || e.message),
);
window.addEventListener("unhandledrejection", (e) =>
  reportUnexpectedError(e.reason),
);

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
    if (!restored) {
      // token was stale/invalid — clear it and redirect to landing
      authToken = null;
      currentUser = null;
      localStorage.removeItem("authToken");
      localStorage.removeItem("user");
      window.location.href = 'landing.html';
      return;
    }
  } else {
    // No token - redirect to landing page
    window.location.href = 'landing.html';
    return;
  }

  initApp();
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

  // Password toggle
  document.querySelectorAll(".password-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.previousElementSibling;
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.textContent = isPassword ? "🙈" : "👁";
    });
  });

  // Password strength meter
  const registerPassword = $("register-password");
  const strengthEl = $("register-password-strength");
  const strengthFill = $("register-strength-fill");
  const strengthText = $("register-strength-text");
  if (registerPassword && strengthEl) {
    registerPassword.addEventListener("input", () => {
      const val = registerPassword.value;
      if (val.length === 0) {
        strengthEl.hidden = true;
        return;
      }
      strengthEl.hidden = false;
      let score = 0;
      if (val.length >= 8) score++;
      if (/[A-Z]/.test(val)) score++;
      if (/[a-z]/.test(val)) score++;
      if (/[0-9]/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;
      const levels = [{ class: "weak", text: "Weak" }, { class: "fair", text: "Fair" }, { class: "good", text: "Good" }];
      const level = levels[Math.min(Math.floor(score / 2), 2)];
      strengthFill.className = "strength-fill " + level.class;
      strengthText.textContent = level.text;
      strengthText.style.color = level.class === "weak" ? "var(--danger)" : level.class === "fair" ? "var(--color-fog)" : "var(--success)";
    });
  }

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
  window.location.href = 'landing.html';
}

// Wraps an async click handler so rapid/repeated clicks while the previous
// call is still in flight are ignored instead of firing concurrent requests.
function guardAsyncClick(fn) {
  let running = false;
  return async (...args) => {
    if (running) return;
    running = true;
    try {
      await fn(...args);
    } finally {
      running = false;
    }
  };
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
function openAuth(reason) {
  const subtitle = $("modal-subtitle");
  if (subtitle) {
    subtitle.textContent = reason || "Track your DSA mastery journey";
  }
  $("auth-modal").classList.add("show");
  document.body.classList.add("modal-open");
}

function closeAuth() {
  $("auth-modal").classList.remove("show");
  document.body.classList.remove("modal-open");
  const subtitle = $("modal-subtitle");
  if (subtitle) subtitle.textContent = "Track your DSA mastery journey";
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
  if (currentUser) {
    await loadActivity();
  }
}

// Shown when browsing without an account — hides personal widgets that
// have nothing to show yet, and points people at the sign-in CTA instead.
function renderGuestState() {
  try {
    const banner = $("streak-banner");
    if (banner) banner.hidden = true;
    const calendarCard =
      $("calendar-card") || $("calendar-heatmap")?.closest(".card");
    if (calendarCard) calendarCard.hidden = true;
    updateStats();
  } catch (error) {
    reportUnexpectedError(error);
  }
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
  try {
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
      0
    );
    list.appendChild(allItem);

    Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([topic, count], index) => {
        const item = createTopicItem(
          formatTopicName(topic),
          count,
          topic,
          topic === currentTopic,
          index + 1
        );
        list.appendChild(item);
      });
  } catch (error) {
    reportUnexpectedError(error);
  }
}

function createTopicItem(name, count, topic, isActive, index) {
  const li = document.createElement("li");
  li.className = "topic-item" + (isActive ? " active" : "");
  li.dataset.topic = topic;
  li.setAttribute("role", "option");
  li.setAttribute("aria-selected", isActive ? "true" : "false");
  li.style.animationDelay = `${Math.min(index * 30, 300)}ms`;
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
  // Coalesce rapid repeated calls (e.g. spam-clicking topics/filters) into
  // a single render per animation frame instead of stacking up full
  // 400-row table rebuilds back to back, which is what actually freezes
  // the page under fast repeated clicks.
  if (applyFilters._scheduled) return;
  applyFilters._scheduled = true;
  requestAnimationFrame(() => {
    applyFilters._scheduled = false;
    runFilters();
  });
}

function runFilters() {
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
    el.classList.toggle("stat-item-active", isActive);
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
        <span class="status-badge ${p.status}" data-id="${p.id}" aria-label="Status: ${formatStatus(p.status)}">
          <span class="status-icon">${getStatusIcon(p.status)}</span>
          <span>${formatStatus(p.status)}</span>
        </span>
      </td>
      <td class="col-id">${p.id}</td>
      <td class="col-problem">
        <a href="${p.url}" target="_blank" rel="noopener" class="problem-link" data-id="${p.id}">${escapeHtml(p.name)}</a>
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

  // Opening a problem marks it "attempted" automatically — status is otherwise
  // read-only in the UI. "Completed" can only be set by an actual LeetCode sync.
  // Guests get prompted to sign in instead of being let straight through.
  tbody.querySelectorAll(".problem-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      if (!currentUser) {
        e.preventDefault();
        openAuth("Sign in to start tracking your progress before you solve.");
        return;
      }
      markAttemptedOnOpen(parseInt(link.dataset.id));
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

// Fires when the user clicks a problem link to open it on LeetCode.
// Only moves not-attempted -> attempted; never touches an already
// attempted/completed problem, and can never itself mark "completed".
const markingInFlight = new Set();

async function markAttemptedOnOpen(problemId) {
  const problem = allProblems.find((p) => p.id === problemId);
  if (!problem || problem.status !== "not-attempted") return;
  if (markingInFlight.has(problemId)) return; // already in progress, ignore repeat clicks
  markingInFlight.add(problemId);

  try {
    const res = await api(
      `${API_URL}/api/progress/problems/${problemId}/status`,
      {
        method: "PUT",
        body: { status: "attempted" },
      },
    );
    if (!res.ok) return; // silent — this is a background nicety, not critical

    problem.status = "attempted";
    const badge = document.querySelector(
      `.status-badge[data-id="${problemId}"]`,
    );
    if (badge) {
      badge.className = "status-badge attempted";
      badge.querySelector(".status-icon").textContent =
        getStatusIcon("attempted");
      badge.querySelector("span:last-child").textContent =
        formatStatus("attempted");
    }
    updateStats();
    updateTopicProgress();
  } catch (error) {
    console.error("Auto-mark attempted error:", error);
  } finally {
    markingInFlight.delete(problemId);
  }
}

// ==================== STATS & PROGRESS ====================
function animateValue(el, start, end, duration = 400) {
  if (!el) return;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const current = Math.round(start + (end - start) * eased);
    el.textContent = current;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateStats() {
  try {
    const completed = allProblems.filter(
      (p) => p.status === "completed",
    ).length;
    const attempted = allProblems.filter(
      (p) => p.status === "attempted",
    ).length;
    const total = allProblems.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    animateValue($("stat-completed"), parseInt($("stat-completed").textContent) || 0, completed);
    animateValue($("stat-attempted"), parseInt($("stat-attempted").textContent) || 0, attempted);
    animateValue($("stat-total"), parseInt($("stat-total").textContent) || 0, total);
    animateValue($("stat-streak"), parseInt($("stat-streak").textContent) || 0, streak);

    $("overview-percent").textContent = percent + "%";
    $("overview-fraction").textContent = `${completed} / ${total}`;
    const circumference = 326.7;
    $("overview-ring").style.strokeDashoffset =
      circumference * (1 - percent / 100);
    $("overview-bar").style.width = percent + "%";

    animateValue($("bp-completed"), parseInt($("bp-completed").textContent) || 0, completed);
    animateValue($("bp-attempted"), parseInt($("bp-attempted").textContent) || 0, attempted);
    animateValue($("bp-remaining"), parseInt($("bp-remaining").textContent) || 0, total - completed - attempted);
    $("overview-title").textContent =
      currentTopic === "all" ? "All Problems" : formatTopicName(currentTopic);
  } catch (error) {
    reportUnexpectedError(error);
  }
}

function updateTopicProgress(filteredCount) {
  try {
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
  } catch (error) {
    reportUnexpectedError(error);
  }
}

// ==================== USER UI ====================
function updateUI() {
  const signinBtn = $("btn-signin-header");
  const connectBtn = $("btn-connect-lc-header");
  const userMenu = $("user-menu");
  if (!currentUser) {
    if (signinBtn) signinBtn.hidden = false;
    if (connectBtn) connectBtn.hidden = false;
    if (userMenu) userMenu.hidden = true;
    return;
  }
  if (signinBtn) signinBtn.hidden = true;
  if (connectBtn) connectBtn.hidden = true;
  if (userMenu) userMenu.hidden = false;
  try {
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
      if (currentUser.leetcodeData)
        updateLeetCodeStats(currentUser.leetcodeData);
      
      // Show saved session status
      const savedSessionStatus = $("saved-session-status");
      const sessionInput = $("lc-session-input");
      if (currentUser.leetcodeSessionCookie) {
        savedSessionStatus.hidden = false;
        sessionInput.placeholder = "Session cookie saved — enter new one to update";
        sessionInput.value = "";
      } else {
        savedSessionStatus.hidden = true;
        sessionInput.placeholder = "Paste LEETCODE_SESSION value";
      }
    } else {
      $("leetcode-stats").hidden = true;
      $("saved-session-status").hidden = true;
    }
  } catch (error) {
    reportUnexpectedError(error);
  }
}

function updateLeetCodeStats(data) {
  try {
    animateValue($("lc-total"), parseInt($("lc-total").textContent) || 0, data.totalSolved || 0);
    animateValue($("lc-easy"), parseInt($("lc-easy").textContent) || 0, data.easySolved || 0);
    animateValue($("lc-medium"), parseInt($("lc-medium").textContent) || 0, data.mediumSolved || 0);
    animateValue($("lc-hard"), parseInt($("lc-hard").textContent) || 0, data.hardSolved || 0);
  } catch (error) {
    reportUnexpectedError(error);
  }
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
  const btn = $("btn-sync-lc");
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "🔄 Syncing...";
  try {
    showToast("Syncing with LeetCode...", "success");
    // Send session cookie from input if user pasted one (will be saved server-side)
    const sessionCookie = $("lc-session-input")?.value?.trim();
    const body = sessionCookie ? { sessionCookie } : {};
    const res = await api(`${API_URL}/api/leetcode/sync`, {
      method: "POST",
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Sync failed");

    // Clear input if a new cookie was used (it's now saved server-side)
    if (sessionCookie) {
      $("lc-session-input").value = "";
      // Update local user object to reflect saved session
      if (currentUser) {
        currentUser.leetcodeSessionCookie = sessionCookie;
        localStorage.setItem("user", JSON.stringify(currentUser));
      }
    }
    await loadProblems();
    updateUI();
    updateStats();
    applyFilters();
    await loadActivity();
    showToast(data.message || "Synced!");
  } catch (error) {
    console.error("Sync error:", error);
    showToast(error.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function toggleFullSyncPanel() {
  const panel = $("leetcode-full-sync");
  const btn = $("btn-toggle-full-sync");
  const isHidden = panel.hidden;
  panel.hidden = !isHidden;
  btn.setAttribute("aria-expanded", String(isHidden));
}

function toggleFullSyncHelp() {
  $("full-sync-help").hidden = !$("full-sync-help").hidden;
}

async function runFullSync() {
  const sessionCookie = $("lc-session-input").value.trim();
  const hadSavedSession = !!currentUser.leetcodeSessionCookie;
  if (!sessionCookie && !hadSavedSession) {
    showToast("Paste your LEETCODE_SESSION cookie first", "error");
    return;
  }
  const btn = $("btn-full-sync");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Syncing...";
  try {
    showToast(
      "Running full history sync — this can take a moment...",
      "success",
    );
    const body = sessionCookie ? { sessionCookie } : {};
    const res = await api(`${API_URL}/api/leetcode/full-sync`, {
      method: "POST",
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Full sync failed");

    // Update local user object if a new cookie was provided
    if (sessionCookie && currentUser) {
      currentUser.leetcodeSessionCookie = sessionCookie;
      localStorage.setItem("user", JSON.stringify(currentUser));
    }
    // Only clear input if user entered a new cookie (not using saved one)
    if (sessionCookie) {
      $("lc-session-input").value = "";
    }
    await loadProblems();
    updateUI();
    updateStats();
    applyFilters();
    showToast(data.message || "Full sync complete!");
  } catch (error) {
    console.error("Full sync error:", error);
    showToast(error.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function clearSavedSession() {
  const btn = $("btn-clear-session");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Clearing...";
  try {
    const res = await api(`${API_URL}/api/auth/clear-leetcode-session`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to clear session");
    
    currentUser.leetcodeSessionCookie = null;
    localStorage.setItem("user", JSON.stringify(currentUser));
    updateUI();
    showToast("Saved session cleared");
  } catch (error) {
    console.error("Clear session error:", error);
    showToast(error.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ==================== EXPORT / RESET ====================
async function exportProgress() {
  const btn = $("btn-export");
  btn.disabled = true;
  try {
    const res = await api(`${API_URL}/api/progress/export`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Export failed");

    // Show export options modal
    showExportModal(data);
  } catch (error) {
    console.error("Export error:", error);
    showToast(error.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function showExportModal(data) {
  // Remove any existing modal
  const existing = document.getElementById("export-modal");
  if (existing) existing.remove();

  const completed = allProblems.filter(p => p.status === "completed").length;
  const attempted = allProblems.filter(p => p.status === "attempted").length;
  const total = allProblems.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const solvedProblems = allProblems.filter(p => p.status === "completed");
  const recentSolved = solvedProblems.slice(-10).reverse(); // Last 10 solved

  const modal = document.createElement("div");
  modal.id = "export-modal";
  modal.className = "modal-overlay show";
  modal.innerHTML = `
    <div class="modal-container" style="max-width: 520px; padding: var(--sp-24);">
      <button class="modal-close" id="export-modal-close" aria-label="Close" style="top: var(--sp-12); right: var(--sp-12);">✕</button>
      
      <div class="modal-header" style="margin-bottom: var(--sp-20);">
        <h2 style="font-size: var(--text-subheading); font-weight: 590; color: var(--text-heading);">Export Progress</h2>
        <p style="font-size: 13px; color: var(--text-muted); margin-top: var(--sp-8);">Choose how to export your progress</p>
      </div>

      <div class="export-options" style="display: flex; flex-direction: column; gap: var(--sp-12);">
        <!-- Visual Card Option -->
        <button class="export-option" data-type="visual" style="
          display: flex; align-items: center; gap: var(--sp-16);
          padding: var(--sp-16); background: var(--surface);
          border: 0.5px solid var(--border); border-radius: var(--radius-lg);
          cursor: pointer; transition: border-color 0.15s, background 0.15s;
          text-align: left; width: 100%;
        ">
          <div style="width: 48px; height: 48px; border-radius: var(--radius); background: linear-gradient(135deg, var(--color-iris-violet), var(--color-lavender)); display: flex; align-items: center; justify-content: center; color: var(--color-paper); font-size: 20px;">📸</div>
          <div style="flex: 1;">
            <div style="font-size: 15px; font-weight: 590; color: var(--text-heading);">Visual Share Card</div>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">PNG image with stats, progress ring & solved problems — perfect for sharing</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-muted);"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>

        <!-- JSON Option -->
        <button class="export-option" data-type="json" style="
          display: flex; align-items: center; gap: var(--sp-16);
          padding: var(--sp-16); background: var(--surface);
          border: 0.5px solid var(--border); border-radius: var(--radius-lg);
          cursor: pointer; transition: border-color 0.15s, background 0.15s;
          text-align: left; width: 100%;
        ">
          <div style="width: 48px; height: 48px; border-radius: var(--radius); background: var(--surface-elevated); display: flex; align-items: center; justify-content: center; color: var(--cta); font-size: 20px;">📄</div>
          <div style="flex: 1;">
            <div style="font-size: 15px; font-weight: 590; color: var(--text-heading);">JSON Data</div>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">Complete raw data including all problems, timestamps & metadata</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-muted);"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  // Event listeners
  modal.querySelector("#export-modal-close").addEventListener("click", () => closeExportModal());
  modal.addEventListener("click", (e) => { if (e.target === modal) closeExportModal(); });

  modal.querySelectorAll(".export-option").forEach(opt => {
    opt.addEventListener("mouseenter", () => { opt.style.borderColor = "var(--border-strong)"; opt.style.background = "var(--surface-pill)"; });
    opt.addEventListener("mouseleave", () => { opt.style.borderColor = "var(--border)"; opt.style.background = "var(--surface)"; });
    opt.addEventListener("click", () => {
      const type = opt.dataset.type;
      closeExportModal();
      if (type === "visual") generateVisualCard(data, completed, attempted, total, percent, recentSolved);
      else downloadJSON(data);
    });
  });

  function closeExportModal() {
    modal.classList.remove("show");
    document.body.classList.remove("modal-open");
    setTimeout(() => modal.remove(), 200);
  }
}

function downloadJSON(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leetpath-progress-${currentUser.username}-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Progress exported as JSON!");
}

function generateVisualCard(data, completed, attempted, total, percent, recentSolved) {
  showToast("Generating visual card...", "success");
  
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  
  // High DPI for crisp image
  const dpr = window.devicePixelRatio || 2;
  const width = 800;
  const height = 1200;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  ctx.scale(dpr, dpr);

  // Colors matching the theme
  const colors = {
    bg: "#08090a",
    surface: "#0f1011",
    surfaceElevated: "#161718",
    border: "#23252a",
    textPrimary: "#e5e5e6",
    textSecondary: "#d0d6e0",
    textMuted: "#8a8f98",
    cta: "#e4f222",
    ctaText: "#08090a",
    success: "#27a644",
    info: "#02b8cc",
    violet: "#6366f1",
    lavender: "#8b5cf6",
    danger: "#eb5757"
  };

  // Helper functions
  const drawRoundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const wrapText = (text, x, y, maxWidth, lineHeight) => {
    const words = text.split(" ");
    let line = "";
    const lines = [];
    for (const word of words) {
      const testLine = line + word + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line !== "") {
        lines.push(line);
        line = word + " ";
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
    return lines.length * lineHeight;
  };

  // Background
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  // Subtle grid pattern
  ctx.strokeStyle = "rgba(255,255,255,0.02)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }

  // Top accent bar
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, colors.violet);
  gradient.addColorStop(1, colors.lavender);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, 6);

  // Header
  let y = 60;
  ctx.fillStyle = colors.textPrimary;
  ctx.font = "600 28px Inter, sans-serif";
  ctx.fillText("LeetPath", 60, y);
  
  y += 36;
  ctx.fillStyle = colors.textMuted;
  ctx.font = "400 14px Inter, sans-serif";
  ctx.fillText("DSA Mastery Progress", 60, y);

  // Stats cards row
  y += 40;
  const cardWidth = (width - 120 - 32) / 3;
  const cardHeight = 100;
  const stats = [
    { label: "Completed", value: completed, color: colors.success, icon: "✓" },
    { label: "Attempted", value: attempted, color: colors.info, icon: "⟳" },
    { label: "Total", value: total, color: colors.violet, icon: "📋" }
  ];

  stats.forEach((stat, i) => {
    const x = 60 + i * (cardWidth + 16);
    drawRoundRect(x, y, cardWidth, cardHeight, 12);
    ctx.fillStyle = colors.surface;
    ctx.fill();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Icon
    ctx.fillStyle = stat.color + "20";
    ctx.beginPath();
    ctx.arc(x + cardWidth / 2, y + 30, 22, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = stat.color;
    ctx.font = "24px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(stat.icon, x + cardWidth / 2, y + 36);

    // Value
    ctx.fillStyle = colors.textPrimary;
    ctx.font = "600 28px Inter, sans-serif";
    ctx.fillText(stat.value.toString(), x + cardWidth / 2, y + 70);

    // Label
    ctx.fillStyle = colors.textMuted;
    ctx.font = "400 12px Inter, sans-serif";
    ctx.fillText(stat.label, x + cardWidth / 2, y + 88);
  });

  ctx.textAlign = "left";

  // Progress ring section
  y += cardHeight + 40;
  const ringCenterX = 160;
  const ringCenterY = y + 100;
  const ringRadius = 80;
  const ringStroke = 12;

  // Ring background
  ctx.beginPath();
  ctx.arc(ringCenterX, ringCenterY, ringRadius, 0, Math.PI * 2);
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = ringStroke;
  ctx.stroke();

  // Ring progress
  const progressAngle = (percent / 100) * Math.PI * 2;
  const progressGradient = ctx.createLinearGradient(ringCenterX - ringRadius, ringCenterY, ringCenterX + ringRadius, ringCenterY);
  progressGradient.addColorStop(0, colors.violet);
  progressGradient.addColorStop(1, colors.lavender);
  
  ctx.beginPath();
  ctx.arc(ringCenterX, ringCenterY, ringRadius, -Math.PI / 2, -Math.PI / 2 + progressAngle);
  ctx.strokeStyle = progressGradient;
  ctx.lineWidth = ringStroke;
  ctx.lineCap = "round";
  ctx.stroke();

  // Ring center text
  ctx.fillStyle = colors.textPrimary;
  ctx.font = "600 36px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(percent + "%", ringCenterX, ringCenterY + 12);
  ctx.fillStyle = colors.textMuted;
  ctx.font = "400 12px Inter, sans-serif";
  ctx.fillText("Complete", ringCenterX, ringCenterY + 32);
  ctx.textAlign = "left";

  // Right side of progress section - details
  const detailX = ringCenterX + ringRadius + 40;
  let detailY = y + 20;
  
  ctx.fillStyle = colors.textPrimary;
  ctx.font = "600 20px Inter, sans-serif";
  ctx.fillText("Your Progress", detailX, detailY);
  
  detailY += 32;
  ctx.fillStyle = colors.textSecondary;
  ctx.font = "400 15px Inter, sans-serif";
  ctx.fillText(`${completed} of ${total} problems solved`, detailX, detailY);
  
  detailY += 28;
  // Progress bar
  const barWidth = width - detailX - 60;
  const barHeight = 8;
  ctx.fillStyle = colors.border;
  drawRoundRect(detailX, detailY, barWidth, barHeight, 4);
  ctx.fill();
  
  ctx.fillStyle = colors.cta;
  drawRoundRect(detailX, detailY, barWidth * (percent / 100), barHeight, 4);
  ctx.fill();
  
  detailY += 24;
  ctx.fillStyle = colors.textMuted;
  ctx.font = "400 12px Inter, sans-serif";
  ctx.fillText(`${Math.round(percent / 100 * total)}% of the combined Striver + Love Babbar sheets`, detailX, detailY);

  // Streak
  detailY += 36;
  ctx.fillStyle = colors.danger + "20";
  ctx.beginPath();
  ctx.arc(detailX + 16, detailY + 16, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.danger;
  ctx.font = "20px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🔥", detailX + 16, detailY + 22);
  ctx.textAlign = "left";
  ctx.fillStyle = colors.textPrimary;
  ctx.font = "600 24px Inter, sans-serif";
  ctx.fillText(streak + " day streak", detailX + 52, detailY + 26);
  ctx.fillStyle = colors.textMuted;
  ctx.font = "400 12px Inter, sans-serif";
  ctx.fillText("Keep the momentum going!", detailX + 52, detailY + 42);

  // Recent solved problems
  y += 220;
  ctx.fillStyle = colors.textPrimary;
  ctx.font = "600 20px Inter, sans-serif";
  ctx.fillText("Recently Solved", 60, y);
  
  y += 32;
  if (recentSolved.length === 0) {
    ctx.fillStyle = colors.textMuted;
    ctx.font = "400 14px Inter, sans-serif";
    ctx.fillText("No problems solved yet. Start your journey!", 60, y + 40);
  } else {
    recentSolved.forEach((prob, i) => {
      if (i >= 8) return; // Show max 8
      const itemY = y + i * 52;
      
      // Card background
      drawRoundRect(60, itemY, width - 120, 44, 8);
      ctx.fillStyle = colors.surface;
      ctx.fill();
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Problem number
      ctx.fillStyle = colors.textMuted;
      ctx.font = "400 12px Inter, sans-serif";
      ctx.fillText("#" + prob.id, 80, itemY + 18);

      // Problem name
      ctx.fillStyle = colors.textPrimary;
      ctx.font = "500 14px Inter, sans-serif";
      const maxNameWidth = width - 300;
      let name = prob.name;
      if (ctx.measureText(name).width > maxNameWidth) {
        while (ctx.measureText(name + "...").width > maxNameWidth && name.length > 0) {
          name = name.slice(0, -1);
        }
        name += "...";
      }
      ctx.fillText(name, 130, itemY + 18);

      // Difficulty badge
      const diffColors = { "Easy": colors.success, "Medium": colors.violet, "Hard": colors.danger };
      const diffColor = diffColors[prob.difficulty] || colors.textMuted;
      const diffX = width - 180;
      drawRoundRect(diffX, itemY + 8, 100, 28, 6);
      ctx.fillStyle = diffColor + "20";
      ctx.fill();
      ctx.fillStyle = diffColor;
      ctx.font = "500 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(prob.difficulty, diffX + 50, itemY + 25);
      ctx.textAlign = "left";

      // Topic tags (first 2)
      const topics = (prob.topics || []).slice(0, 2);
      let topicX = diffX - 10;
      topics.forEach(topic => {
        const topicText = topic.replace(/([A-Z])/g, " $1").trim().split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
        const topicWidth = ctx.measureText(topicText).width + 16;
        topicX -= topicWidth + 6;
        drawRoundRect(topicX, itemY + 8, topicWidth, 28, 6);
        ctx.fillStyle = colors.surfaceElevated;
        ctx.fill();
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.fillStyle = colors.textSecondary;
        ctx.font = "400 10px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(topicText, topicX + topicWidth / 2, itemY + 24);
        ctx.textAlign = "left";
      });
    });
  }

  // Footer
  y = height - 80;
  ctx.fillStyle = colors.textMuted;
  ctx.font = "400 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Generated with LeetPath • " + new Date().toLocaleDateString(), width / 2, y);
  ctx.fillText("leetpath.vercel.app", width / 2, y + 20);
  ctx.textAlign = "left";

  // Watermark logo
  ctx.fillStyle = colors.violet;
  ctx.beginPath();
  ctx.arc(width - 50, height - 50, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.ctaText;
  ctx.font = "600 20px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("⚡", width - 50, height - 44);
  ctx.textAlign = "left";

  // Download
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leetpath-progress-${currentUser.username}-${new Date().toISOString().split("T")[0]}.png`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Visual progress card saved as PNG!");
  }, "image/png", 1.0);
}

async function resetProgress() {
  if (!confirm("Reset ALL your progress? This cannot be undone.")) return;

  const btn = $("btn-reset");
  btn.disabled = true;
  try {
    const res = await api(`${API_URL}/api/progress/reset`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Reset failed");

    await loadProblems();
    updateStats();
    applyFilters();
    await loadActivity();
    showToast("Progress reset!");
  } catch (error) {
    console.error("Reset error:", error);
    showToast(error.message, "error");
  } finally {
    btn.disabled = false;
  }
}

// ==================== ACTIVITY / STREAK / CALENDAR ====================
async function loadActivity() {
  try {
    const res = await api(`${API_URL}/api/progress/activity`, { auth: true });
    if (!res.ok) throw new Error("Failed to load activity");
    const data = await res.json();
    streak = data.streak.current;

    // Each sub-section is independent — one failing doesn't stop the others.
    try {
      renderCalendar(data.activityLog);
    } catch (error) {
      reportUnexpectedError(error);
    }
    try {
      renderStreakSummary(data.streak);
    } catch (error) {
      reportUnexpectedError(error);
    }
    try {
      maybeShowStreakBanner(data.streak);
    } catch (error) {
      reportUnexpectedError(error);
    }
  } catch (error) {
    console.error("loadActivity error:", error);
    streak = 0;
  }
  updateStats();
}

function renderStreakSummary(streakData) {
  const el = $("calendar-streak-summary");
  if (!el) return;
  el.textContent = `🔥 ${streakData.current} day streak · best ${streakData.longest}`;
}

// GitHub-style heatmap: last 18 weeks, Sun-first columns.
function renderCalendar(activityLog) {
  const container = $("calendar-heatmap");
  if (!container) return;
  container.innerHTML = "";

  const oneDay = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const weeks = 18;
  const totalDays = weeks * 7;
  // Align the grid to end on the most recent Saturday so columns are clean weeks.
  const endOffset = 6 - today.getUTCDay();
  const gridEnd = new Date(today.getTime() + endOffset * oneDay);
  const gridStart = new Date(gridEnd.getTime() - (totalDays - 1) * oneDay);

  const maxCount = Math.max(1, ...Object.values(activityLog || {}));

  const grid = document.createElement("div");
  grid.className = "heatmap-grid";

  for (let i = 0; i < totalDays; i++) {
    const date = new Date(gridStart.getTime() + i * oneDay);
    const key = date.toISOString().slice(0, 10);
    const count = activityLog?.[key] || 0;
    const isFuture = date > today;

    let level = 0;
    if (!isFuture && count > 0) {
      const ratio = count / maxCount;
      level = ratio >= 0.75 ? 4 : ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
    }

    const cell = document.createElement("div");
    cell.className = `heatmap-cell level-${level}${isFuture ? " future" : ""}`;
    cell.title = isFuture
      ? ""
      : `${count} problem${count === 1 ? "" : "s"} on ${key}`;
    grid.appendChild(cell);
  }

  container.appendChild(grid);
}

function maybeShowStreakBanner(streakData) {
  const banner = $("streak-banner");
  if (!banner) return;

  const todayKey = new Date().toISOString().slice(0, 10);
  const dismissedToday =
    localStorage.getItem("leetpath_banner_dismissed") === todayKey;

  if (streakData.solvedToday || dismissedToday) {
    banner.hidden = true;
    return;
  }

  const title = $("streak-banner-title");
  const sub = $("streak-banner-sub");
  if (streakData.current > 0) {
    title.textContent = `Don't break your ${streakData.current}-day streak!`;
    sub.textContent =
      "You haven't solved anything today — sync after solving to keep it alive.";
  } else {
    title.textContent = "No streak going yet";
    sub.textContent = "Solve a problem today and sync to start one.";
  }
  banner.hidden = false;
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
    toast.classList.add("removing");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
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
  // Guest CTAs — only visible when logged out
  $("btn-signin-header")?.addEventListener("click", () => openAuth());
  $("btn-connect-lc-header")?.addEventListener("click", () =>
    openAuth(
      "Sign in first, then connect your LeetCode account to sync your progress.",
    ),
  );

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

  // Dropdown actions — guarded so rapid/repeated clicks can't fire
  // concurrent requests while the previous one is still running.
  $("btn-connect-lc").addEventListener(
    "click",
    guardAsyncClick(connectLeetCodeFull),
  );
  $("btn-sync-lc").addEventListener("click", guardAsyncClick(syncWithLeetCode));
  $("btn-toggle-full-sync").addEventListener("click", toggleFullSyncPanel);
  $("btn-full-sync-help").addEventListener("click", toggleFullSyncHelp);
  $("btn-full-sync").addEventListener("click", guardAsyncClick(runFullSync));
  $("btn-clear-session").addEventListener("click", guardAsyncClick(clearSavedSession));
  $("streak-banner-dismiss")?.addEventListener("click", () => {
    localStorage.setItem(
      "leetpath_banner_dismissed",
      new Date().toISOString().slice(0, 10),
    );
    $("streak-banner").hidden = true;
  });
  $("btn-export").addEventListener("click", guardAsyncClick(exportProgress));
  $("btn-reset").addEventListener("click", guardAsyncClick(resetProgress));
  $("btn-logout").addEventListener("click", logout);

  // Filters & search
  $("filter-status").addEventListener("change", applyFilters);
  $("filter-difficulty").addEventListener("change", applyFilters);
  let searchDebounce;
  $("global-search").addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(applyFilters, 200);
  });

  // Density selector
  const densitySelector = $("density-selector");
  if (densitySelector) {
    const savedDensity = localStorage.getItem("layout-density") || "comfortable";
    document.documentElement.setAttribute("data-density", savedDensity);
    densitySelector.querySelectorAll(".density-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.density === savedDensity);
      btn.addEventListener("click", () => {
        densitySelector.querySelectorAll(".density-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document.documentElement.setAttribute("data-density", btn.dataset.density);
        localStorage.setItem("layout-density", btn.dataset.density);
      });
    });
  }

  // Clickable stat items -> filter by status
  document.querySelectorAll(".stat-item[data-filter]").forEach((item) => {
    const activate = () => {
      $("filter-status").value = item.dataset.filter;
      applyFilters();
      $("problems-tbody")
        .closest(".card")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    item.addEventListener("click", activate);
    item.addEventListener("keydown", (e) => {
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
