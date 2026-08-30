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
      // token was stale/invalid — clear it and continue as a guest
      authToken = null;
      currentUser = null;
      localStorage.removeItem("authToken");
      localStorage.removeItem("user");
    }
  }

  // The site is always browsable, logged in or not. Signing in is only
  // ever prompted when the person tries to do something that needs an
  // account — solving a problem or connecting LeetCode.
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
  } else {
    renderGuestState();
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
  } catch (error) {
    reportUnexpectedError(error);
  }
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
        sessionInput.placeholder =
          "Session cookie saved — enter new one to update";
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
    $("lc-total").textContent = data.totalSolved || 0;
    $("lc-easy").textContent = data.easySolved || 0;
    $("lc-medium").textContent = data.mediumSolved || 0;
    $("lc-hard").textContent = data.hardSolved || 0;
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
  } finally {
    btn.disabled = false;
  }
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
  // Theme toggle
  $("theme-toggle")?.addEventListener("click", () => {
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "light" ? "dark" : "light";
    html.setAttribute("data-theme", next);
    localStorage.setItem("leetpath_theme", next);
  });

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
  $("btn-clear-session").addEventListener(
    "click",
    guardAsyncClick(clearSavedSession),
  );
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
