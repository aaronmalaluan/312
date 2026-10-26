// FocusDesk: task list, Pomodoro timer, notes, and study checklist.
// Data is saved in this browser using localStorage.

const STORAGE_KEYS = {
  tasks: "focusdesk_tasks_v1",
  notes: "focusdesk_notes_v1",
  studies: "focusdesk_studies_v1",
  sessions: "focusdesk_sessions_v1"
};

let tasks = loadJSON(STORAGE_KEYS.tasks, []);
let studyProgress = loadJSON(STORAGE_KEYS.studies, {});
let sessions = loadJSON(STORAGE_KEYS.sessions, { date: todayKey(), count: 0 });
if (sessions.date !== todayKey()) sessions = { date: todayKey(), count: 0 };

let currentFilter = "all";
let timerDuration = 25 * 60;
let timeLeft = timerDuration;
let timerInterval = null;
let timerRunning = false;
let timerMode = "Focus";
let toastTimeout;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2400);
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}
function setView(viewName) {
  $$(".view").forEach(view => view.classList.toggle("active", view.id === `${viewName}-view`));
  $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.view === viewName));
  const titles = {
    dashboard: ["Good morning. Let's focus.", "Make today count, one task at a time."],
    tasks: ["Your plan, your pace.", "Turn your to-do list into small, doable steps."],
    focus: ["Protect your focus.", "A little uninterrupted time can go a long way."],
    notes: ["Get it out of your head.", "Save ideas here so you can return to what matters."],
    study: ["Study smart, not just long.", "Track your progress through the IT 312 reviewer."]
  };
  $("#page-title").textContent = titles[viewName][0];
  $("#page-subtitle").textContent = titles[viewName][1];
  if (viewName === "tasks") setTimeout(() => $("#task-input").focus(), 50);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function renderTaskRow(task) {
  return `<div class="task-row ${task.completed ? "done" : ""}">
    <input class="task-check" type="checkbox" aria-label="Mark ${escapeHTML(task.title)} complete" data-task-check="${task.id}" ${task.completed ? "checked" : ""}>
    <span class="task-name">${escapeHTML(task.title)}</span>
    <span class="priority ${task.priority}">${task.priority[0].toUpperCase() + task.priority.slice(1)}</span>
    <button class="delete-task" type="button" aria-label="Delete task" data-task-delete="${task.id}">×</button>
  </div>`;
}
function renderTasks() {
  const dashboardList = $("#dashboard-task-list");
  const dashboardTasks = tasks.filter(task => !task.completed).slice(0, 4);
  dashboardList.innerHTML = dashboardTasks.length
    ? dashboardTasks.map(renderTaskRow).join("")
    : `<div class="empty-state"><span>✦</span><h3>You're all caught up</h3><p>Add a task whenever you're ready.</p></div>`;

  const filtered = tasks.filter(task => {
    if (currentFilter === "active") return !task.completed;
    if (currentFilter === "completed") return task.completed;
    return true;
  });
  $("#all-task-list").innerHTML = filtered.map(renderTaskRow).join("");
  $("#empty-tasks").style.display = filtered.length ? "none" : "block";

  const completed = tasks.filter(task => task.completed).length;
  $("#completed-stat").textContent = completed;
  $("#remaining-stat").textContent = tasks.length - completed;
  $("#sessions-stat").textContent = sessions.count;
  $("#mini-timer-display").textContent = formatTime(timeLeft);
  updateTimerVisual();
}
function addTask(title, priority) {
  const trimmed = title.trim();
  if (!trimmed) return;
  tasks.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: trimmed,
    priority,
    completed: false,
    createdAt: Date.now()
  });
  saveJSON(STORAGE_KEYS.tasks, tasks);
  renderTasks();
  showToast("Task added to your list.");
}
function toggleTask(id, completed) {
  tasks = tasks.map(task => task.id === id ? { ...task, completed } : task);
  saveJSON(STORAGE_KEYS.tasks, tasks);
  renderTasks();
  if (completed) showToast("Nice work! Task completed.");
}
function deleteTask(id) {
  tasks = tasks.filter(task => task.id !== id);
  saveJSON(STORAGE_KEYS.tasks, tasks);
  renderTasks();
  showToast("Task deleted.");
}

// Navigation and task interactions use event delegation so newly rendered tasks work too.
$$(".nav-link").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
$$("[data-go]").forEach(button => button.addEventListener("click", () => setView(button.dataset.go)));
document.addEventListener("click", (event) => {
  const check = event.target.closest("[data-task-check]");
  const del = event.target.closest("[data-task-delete]");
  if (check) toggleTask(check.dataset.taskCheck, check.checked);
  if (del) deleteTask(del.dataset.taskDelete);
});
$("#header-add-task").addEventListener("click", () => {
  setView("tasks");
  setTimeout(() => $("#task-input").focus(), 50);
});
$("#inline-add-task").addEventListener("click", () => setView("tasks"));
$("#task-form").addEventListener("submit", (event) => {
  event.preventDefault();
  addTask($("#task-input").value, $("#task-priority").value);
  $("#task-input").value = "";
  $("#task-priority").value = "medium";
});
$$(".filter-btn").forEach(button => button.addEventListener("click", () => {
  currentFilter = button.dataset.filter;
  $$(".filter-btn").forEach(item => item.classList.toggle("active", item === button));
  renderTasks();
}));

// Pomodoro timer
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}
function updateTimerVisual() {
  $("#big-timer-display").textContent = formatTime(timeLeft);
  $("#mini-timer-display").textContent = formatTime(timeLeft);
  const progress = timerDuration > 0 ? ((timerDuration - timeLeft) / timerDuration) * 100 : 0;
  $("#timer-progress-bar").style.width = `${progress}%`;
  const ring = document.querySelector(".timer-ring");
  const degrees = Math.max(0, Math.min(360, (timerDuration - timeLeft) / timerDuration * 360));
  ring.style.background = `conic-gradient(var(--purple) ${degrees}deg, #eeeafa ${degrees}deg)`;
}
function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  $("#timer-start").textContent = "▶ Start";
}
function startTimer() {
  if (timerRunning) {
    stopTimer();
    $("#timer-start").textContent = "▶ Resume";
    return;
  }
  timerRunning = true;
  $("#timer-start").textContent = "Ⅱ Pause";
  timerInterval = setInterval(() => {
    timeLeft -= 1;
    updateTimerVisual();
    if (timeLeft <= 0) {
      stopTimer();
      timeLeft = 0;
      updateTimerVisual();
      if (timerMode === "Focus") {
        sessions.count += 1;
        sessions.date = todayKey();
        saveJSON(STORAGE_KEYS.sessions, sessions);
        renderTasks();
        showToast("Focus session complete. Take a short break!");
        $("#timer-hint").textContent = "Well done. Stand up, stretch, and take a break.";
      } else {
        showToast("Break finished. Ready when you are!");
        $("#timer-hint").textContent = "Your break is complete. Start another session when ready.";
      }
      $("#timer-start").textContent = "↻ Start again";
    }
  }, 1000);
}
function resetTimer() {
  stopTimer();
  timeLeft = timerDuration;
  $("#timer-start").textContent = "▶ Start";
  $("#timer-hint").textContent = timerMode === "Focus"
    ? "Put away distractions and give one task your attention."
    : "Take a breath, move around, and rest your eyes.";
  updateTimerVisual();
}
function setTimerMode(button) {
  stopTimer();
  timerMode = button.dataset.mode;
  timerDuration = Number(button.dataset.minutes) * 60;
  timeLeft = timerDuration;
  $$(".timer-tab").forEach(tab => tab.classList.toggle("active", tab === button));
  $("#timer-mode").textContent = timerMode.toUpperCase() === "FOCUS" ? "TIME TO FOCUS" : `TIME FOR A ${timerMode.toUpperCase()}`;
  $("#timer-start").textContent = "▶ Start";
  $("#timer-hint").textContent = timerMode === "Focus"
    ? "Put away distractions and give one task your attention."
    : "Take a breath, move around, and rest your eyes.";
  updateTimerVisual();
}
$$(".timer-tab").forEach(button => button.addEventListener("click", () => setTimerMode(button)));
$("#timer-start").addEventListener("click", startTimer);
$("#timer-reset").addEventListener("click", resetTimer);

// Notes save automatically in this browser.
const notesArea = $("#notes-area");
notesArea.value = localStorage.getItem(STORAGE_KEYS.notes) || "";
let notesSaveTimeout;
notesArea.addEventListener("input", () => {
  $("#notes-status").textContent = "Saving...";
  clearTimeout(notesSaveTimeout);
  notesSaveTimeout = setTimeout(() => {
    localStorage.setItem(STORAGE_KEYS.notes, notesArea.value);
    $("#notes-status").textContent = "Saved on this browser.";
  }, 250);
});
$("#clear-notes").addEventListener("click", () => {
  if (!notesArea.value.trim()) {
    showToast("Your notes are already empty.");
    return;
  }
  if (confirm("Clear all your notes? This cannot be undone.")) {
    notesArea.value = "";
    localStorage.removeItem(STORAGE_KEYS.notes);
    $("#notes-status").textContent = "Notes cleared.";
    showToast("Notes cleared.");
  }
});

// Chapter checklist
$$("[data-study]").forEach(input => {
  input.checked = Boolean(studyProgress[input.dataset.study]);
  input.addEventListener("change", () => {
    studyProgress[input.dataset.study] = input.checked;
    saveJSON(STORAGE_KEYS.studies, studyProgress);
    showToast(input.checked ? "Chapter marked as reviewed." : "Chapter unchecked.");
  });
});

const now = new Date();
$("#today-label").textContent = now.toLocaleDateString(undefined, {
  weekday: "long", month: "long", day: "numeric"
}).toUpperCase();

renderTasks();
updateTimerVisual();
