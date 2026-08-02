// Global variables
let allData = {};
let currentTopic = "all";
let currentStatusFilter = "all";
let currentDifficultyFilter = "all";
let searchQuery = "";

// Topic display names
const topicNames = {
  arrays: "Arrays",
  hashing: "Hashing",
  strings: "Strings",
  twoPointers: "Two Pointers",
  prefixSum: "Prefix Sum",
  binarySearch: "Binary Search",
  linkedList: "Linked List",
  stack: "Stack",
  queue: "Queue",
  heap: "Heap",
  slidingWindow: "Sliding Window",
  binaryTrees: "Binary Trees",
  bst: "Binary Search Tree",
  recursion: "Recursion",
  backtracking: "Backtracking",
  graphs: "Graphs",
  greedy: "Greedy",
  trie: "Trie",
  bitManipulation: "Bit Manipulation",
  dynamicProgramming: "Dynamic Programming",
};

// Load data from JSON file
document.addEventListener("DOMContentLoaded", function () {
  fetch("data/problems.json")
    .then((response) => response.json())
    .then((data) => {
      allData = data;
      loadSavedProgress();
      renderSidebar();
      renderProblems();
      updateHeaderStats();
      updateProgressRing();
    })
    .catch((error) => console.error("Error loading data:", error));
});

// Load saved progress from localStorage
function loadSavedProgress() {
  try {
    const savedStatuses = JSON.parse(
      localStorage.getItem("leetcodeProgress") || "{}",
    );

    Object.keys(allData).forEach((topic) => {
      if (Array.isArray(allData[topic])) {
        allData[topic].forEach((problem) => {
          const key = `${topic}-${problem.id}`;
          if (savedStatuses[key]) {
            problem.status = savedStatuses[key];
          }
        });
      }
    });
  } catch (e) {
    console.warn("Could not load saved progress:", e);
  }
}

// Save progress to localStorage
function saveProgress() {
  try {
    const statuses = {};
    Object.keys(allData).forEach((topic) => {
      if (Array.isArray(allData[topic])) {
        allData[topic].forEach((problem) => {
          const key = `${topic}-${problem.id}`;
          statuses[key] = problem.status;
        });
      }
    });
    localStorage.setItem("leetcodeProgress", JSON.stringify(statuses));
  } catch (e) {
    console.warn("Could not save progress:", e);
  }
}

// Render sidebar topics
function renderSidebar() {
  const topicList = document.getElementById("topic-list");
  topicList.innerHTML = "";

  // Add "All Topics" option
  const allItem = document.createElement("li");
  allItem.className = "topic-item active";
  allItem.dataset.topic = "all";
  allItem.innerHTML = `
        <span class="topic-name">All Topics</span>
        <span class="topic-count">${getTotalProblemCount()}</span>
    `;
  allItem.onclick = () => selectTopic("all");
  topicList.appendChild(allItem);

  // Add individual topics
  Object.keys(topicNames).forEach((topic) => {
    if (allData[topic] && Array.isArray(allData[topic])) {
      const count = allData[topic].length;
      const item = document.createElement("li");
      item.className = "topic-item";
      item.dataset.topic = topic;
      item.innerHTML = `
                <span class="topic-name">${topicNames[topic]}</span>
                <span class="topic-count">${count}</span>
            `;
      item.onclick = () => selectTopic(topic);
      topicList.appendChild(item);
    }
  });
}

// Get total problem count
function getTotalProblemCount() {
  let total = 0;
  Object.keys(allData).forEach((topic) => {
    if (
      Array.isArray(allData[topic]) &&
      topic !== "companyPriority" &&
      topic !== "revisionPlanner"
    ) {
      total += allData[topic].length;
    }
  });
  return total;
}

// Select topic
function selectTopic(topic) {
  currentTopic = topic;

  // Update active state
  document.querySelectorAll(".topic-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.topic === topic);
  });

  // Update header title
  document.getElementById("current-topic-name").textContent =
    topic === "all" ? "All Problems" : topicNames[topic];

  renderProblems();
  updateProgressBar();
}

// Render problems table
function renderProblems() {
  const tbody = document.getElementById("problems-tbody");
  tbody.innerHTML = "";

  let problems = [];

  // Get problems based on selected topic
  if (currentTopic === "all") {
    Object.keys(allData).forEach((topic) => {
      if (
        Array.isArray(allData[topic]) &&
        topic !== "companyPriority" &&
        topic !== "revisionPlanner"
      ) {
        problems = problems.concat(
          allData[topic].map((p) => ({ ...p, topic })),
        );
      }
    });
  } else if (allData[currentTopic]) {
    problems = allData[currentTopic].map((p) => ({
      ...p,
      topic: currentTopic,
    }));
  }

  // Apply filters
  problems = problems.filter((problem) => {
    // Status filter
    if (
      currentStatusFilter !== "all" &&
      problem.status !== currentStatusFilter
    ) {
      return false;
    }

    // Difficulty filter
    if (
      currentDifficultyFilter !== "all" &&
      problem.difficulty !== currentDifficultyFilter
    ) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const nameMatch = problem.name.toLowerCase().includes(query);
      const companyMatch = problem.companies.some((c) =>
        c.toLowerCase().includes(query),
      );
      if (!nameMatch && !companyMatch) {
        return false;
      }
    }

    return true;
  });

  // Render rows
  problems.forEach((problem) => {
    const row = document.createElement("tr");

    // Status badge
    const statusCell = document.createElement("td");
    statusCell.className = "col-status";
    const statusBadge = document.createElement("span");
    statusBadge.className = `status-badge ${problem.status}`;
    statusBadge.innerHTML = `<span class="status-icon">${getStatusIcon(problem.status)}</span> ${getStatusText(problem.status)}`;
    statusBadge.onclick = () => toggleStatus(problem.topic, problem.id);
    statusCell.appendChild(statusBadge);

    // Problem ID
    const idCell = document.createElement("td");
    idCell.className = "col-id";
    idCell.textContent = problem.id;

    // Problem name with link
    const nameCell = document.createElement("td");
    nameCell.className = "col-problem";
    const link = document.createElement("a");
    link.href = problem.url;
    link.className = "problem-link";
    link.textContent = problem.name;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    nameCell.appendChild(link);

    // Difficulty
    const difficultyCell = document.createElement("td");
    difficultyCell.className = "col-difficulty";
    const diffBadge = document.createElement("span");
    diffBadge.className = `difficulty-badge ${problem.difficulty.toLowerCase()}`;
    diffBadge.textContent = problem.difficulty;
    difficultyCell.appendChild(diffBadge);

    // Companies
    const companiesCell = document.createElement("td");
    companiesCell.className = "col-companies";
    const tagsDiv = document.createElement("div");
    tagsDiv.className = "company-tags";
    problem.companies.slice(0, 4).forEach((company) => {
      const tag = document.createElement("span");
      tag.className = "company-tag";
      tag.textContent = company;
      tagsDiv.appendChild(tag);
    });
    if (problem.companies.length > 4) {
      const more = document.createElement("span");
      more.className = "company-tag";
      more.textContent = `+${problem.companies.length - 4}`;
      tagsDiv.appendChild(more);
    }
    companiesCell.appendChild(tagsDiv);

    row.appendChild(statusCell);
    row.appendChild(idCell);
    row.appendChild(nameCell);
    row.appendChild(difficultyCell);
    row.appendChild(companiesCell);

    tbody.appendChild(row);
  });

  // Show message if no problems found
  if (problems.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 40px; color: var(--text-tertiary);">
                    No problems found matching your filters.
                </td>
            </tr>
        `;
  }
}

// Get status icon
function getStatusIcon(status) {
  switch (status) {
    case "not-attempted":
      return "✗";
    case "attempted":
      return "◐";
    case "completed":
      return "✓";
    default:
      return "✗";
  }
}

// Get status text
function getStatusText(status) {
  switch (status) {
    case "not-attempted":
      return "Not Attempted";
    case "attempted":
      return "Attempted";
    case "completed":
      return "Completed";
    default:
      return "Not Attempted";
  }
}

// Toggle problem status
function toggleStatus(topic, problemId) {
  const problems = allData[topic];
  const problem = problems.find((p) => p.id === problemId);

  if (problem) {
    const statuses = ["not-attempted", "attempted", "completed"];
    const currentIndex = statuses.indexOf(problem.status);
    problem.status = statuses[(currentIndex + 1) % 3];

    saveProgress();
    renderProblems();
    updateProgressBar();
    updateHeaderStats();
    updateProgressRing();
    showToast(`Marked as "${getStatusText(problem.status)}"`);
  }
}

// Update progress bar
function updateProgressBar() {
  let problems = [];

  if (currentTopic === "all") {
    Object.keys(allData).forEach((topic) => {
      if (
        Array.isArray(allData[topic]) &&
        topic !== "companyPriority" &&
        topic !== "revisionPlanner"
      ) {
        problems = problems.concat(allData[topic]);
      }
    });
  } else if (allData[currentTopic]) {
    problems = allData[currentTopic];
  }

  const completed = problems.filter((p) => p.status === "completed").length;
  const total = problems.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  document.getElementById("topic-progress-bar").style.width = `${percentage}%`;
  document.getElementById("topic-progress-text").textContent =
    `${completed} / ${total}`;
}

// Update header stats
function updateHeaderStats() {
  let total = 0;
  let completed = 0;
  let attempted = 0;

  Object.keys(allData).forEach((topic) => {
    if (
      Array.isArray(allData[topic]) &&
      topic !== "companyPriority" &&
      topic !== "revisionPlanner"
    ) {
      allData[topic].forEach((problem) => {
        total++;
        if (problem.status === "completed") completed++;
        if (problem.status === "attempted") attempted++;
      });
    }
  });

  document.getElementById("header-completed").textContent = completed;
  document.getElementById("header-attempted").textContent = attempted;
  document.getElementById("header-total").textContent = total;
}

// Update progress ring
function updateProgressRing() {
  let total = 0;
  let completed = 0;

  Object.keys(allData).forEach((topic) => {
    if (
      Array.isArray(allData[topic]) &&
      topic !== "companyPriority" &&
      topic !== "revisionPlanner"
    ) {
      allData[topic].forEach((problem) => {
        total++;
        if (problem.status === "completed") completed++;
      });
    }
  });

  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Update main ring
  const ring = document.getElementById("overall-progress-ring");
  const circumference = 2 * Math.PI * 80;
  ring.style.strokeDashoffset =
    circumference - (percentage / 100) * circumference;

  document.getElementById("overall-percentage").textContent = `${percentage}%`;
  document.getElementById("completed-count").textContent = completed;
  document.getElementById("attempted-count").textContent = allData.arrays
    ? Object.keys(allData).reduce((acc, topic) => {
        if (Array.isArray(allData[topic])) {
          return (
            acc + allData[topic].filter((p) => p.status === "attempted").length
          );
        }
        return acc;
      }, 0)
    : 0;
  document.getElementById("remaining-count").textContent =
    total -
    completed -
    parseInt(document.getElementById("attempted-count").textContent);

  // Update mini ring in header
  const miniRing = document.getElementById("header-progress-ring");
  const miniCircumference = 2 * Math.PI * 20;
  miniRing.style.strokeDashoffset =
    miniCircumference - (percentage / 100) * miniCircumference;

  document.getElementById("header-percent").textContent = `${percentage}%`;
}

// Apply filters
function applyFilters() {
  currentStatusFilter = document.getElementById("filter-status").value;
  currentDifficultyFilter = document.getElementById("filter-difficulty").value;
  searchQuery = document.getElementById("search-input").value;

  renderProblems();
}

// Export progress
function exportProgress() {
  const dataStr = JSON.stringify(allData, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "leetcode-progress.json";
  a.click();

  URL.revokeObjectURL(url);
  showToast("Progress exported successfully!");
}

// Reset progress
function resetProgress() {
  if (
    confirm(
      "Are you sure you want to reset all progress? This cannot be undone.",
    )
  ) {
    Object.keys(allData).forEach((topic) => {
      if (Array.isArray(allData[topic])) {
        allData[topic].forEach((problem) => {
          problem.status = "not-attempted";
        });
      }
    });

    saveProgress();
    renderProblems();
    updateProgressBar();
    updateHeaderStats();
    updateProgressRing();
    showToast("Progress reset successfully!");
  }
}

// Show toast notification
function showToast(message) {
  const toast = document.getElementById("toast");
  document.getElementById("toast-message").textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}
