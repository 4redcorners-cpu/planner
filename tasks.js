(() => {
  "use strict";

  const STORAGE_KEY = "single-file-todo-pomodoro-app-v1";
  const THEME_STORAGE_KEY = "single-file-todo-pomodoro-app-v1-theme";

  const FILTER_LABELS = {
    all: "Все",
    active: "Активные",
    completed: "Выполненные",
  };

  function createDefaultState() {
    return {
      tasks: [],
      filter: "all",
      selectedTaskId: null,
      pomodoroCount: 0,
      settings: {
        work: 25,
        shortBreak: 5,
        longBreak: 15,
        longBreakInterval: 4,
      },
      timer: {
        mode: "work",
        remaining: 25 * 60,
        isRunning: false,
        endTimestamp: null,
        cycleWorkSessionsCompleted: 0,
      },
    };
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeState(raw) {
    const safe = createDefaultState();

    if (!raw || typeof raw !== "object") return safe;

    const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    safe.tasks = tasks
      .map((task) => {
        if (!task || typeof task !== "object") return null;
        return {
          id: typeof task.id === "string" && task.id ? task.id : generateId(),
          title: typeof task.title === "string" ? task.title.trim() : "",
          completed: Boolean(task.completed),
          pomodorosCompleted: clampNumber(task.pomodorosCompleted, 0, 100000, 0),
          createdAt: typeof task.createdAt === "number" ? task.createdAt : Date.now(),
        };
      })
      .filter((task) => task && task.title);

    safe.filter = ["all", "active", "completed"].includes(raw.filter) ? raw.filter : "all";

    safe.selectedTaskId =
      typeof raw.selectedTaskId === "string" &&
      safe.tasks.some((task) => task.id === raw.selectedTaskId)
        ? raw.selectedTaskId
        : null;

    safe.pomodoroCount = clampNumber(raw.pomodoroCount, 0, 100000, 0);

    const rawSettings = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
    safe.settings = {
      work: clampNumber(rawSettings.work, 1, 180, 25),
      shortBreak: clampNumber(rawSettings.shortBreak, 1, 60, 5),
      longBreak: clampNumber(rawSettings.longBreak, 1, 120, 15),
      longBreakInterval: clampNumber(rawSettings.longBreakInterval, 1, 12, 4),
    };

    const rawTimer = raw.timer && typeof raw.timer === "object" ? raw.timer : {};
    const mode = ["work", "shortBreak", "longBreak"].includes(rawTimer.mode) ? rawTimer.mode : "work";
    const modeDurationSeconds = safe.settings[mode] * 60;

    safe.timer = {
      mode,
      remaining: clampNumber(rawTimer.remaining, 0, 24 * 60 * 60, modeDurationSeconds),
      isRunning: Boolean(rawTimer.isRunning),
      endTimestamp:
        typeof rawTimer.endTimestamp === "number" && Number.isFinite(rawTimer.endTimestamp) ? rawTimer.endTimestamp : null,
      cycleWorkSessionsCompleted: clampNumber(rawTimer.cycleWorkSessionsCompleted, 0, 100000, 0),
    };

    return safe;
  }

  function loadState() {
    const defaultState = createDefaultState();
    try {
      const rawState = localStorage.getItem(STORAGE_KEY);
      if (!rawState) return defaultState;
      return normalizeState(JSON.parse(rawState));
    } catch (error) {
      // If parse failed or storage blocked, fallback safely.
      console.error("Не удалось прочитать состояние из localStorage:", error);
      return defaultState;
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Не удалось сохранить состояние в localStorage:", error);
    }
  }

  function getFilteredTasks(state) {
    switch (state.filter) {
      case "active":
        return state.tasks.filter((task) => !task.completed);
      case "completed":
        return state.tasks.filter((task) => task.completed);
      default:
        return state.tasks;
    }
  }

  function getSelectedTask(state) {
    return state.tasks.find((task) => task.id === state.selectedTaskId) || null;
  }

  /* ===== Theme ===== */
  const elements = {
    taskForm: document.getElementById("task-form"),
    taskInput: document.getElementById("task-input"),
    taskList: document.getElementById("task-list"),
    filterButtons: Array.from(document.querySelectorAll(".filter-btn")),
    statTotal: document.getElementById("stat-total"),
    statActive: document.getElementById("stat-active"),
    statCompleted: document.getElementById("stat-completed"),
    headerSelectedTask: document.getElementById("header-selected-task"),
    toast: document.getElementById("toast"),
    themeToggleButton: document.getElementById("theme-toggle"),
    themeToggleIcon: document.getElementById("theme-toggle-icon"),
  };

  function loadThemeFromStorage() {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") return stored;
    } catch (error) {
      console.warn("Не удалось прочитать тему из localStorage:", error);
    }
    return null;
  }

  function getDefaultTheme() {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
    return "dark";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const isLight = theme === "light";

    if (elements.themeToggleButton) {
      elements.themeToggleButton.setAttribute("aria-pressed", String(isLight));
      elements.themeToggleButton.title = isLight ? "Включить тёмную тему" : "Включить светлую тему";
    }

    if (elements.themeToggleIcon) {
      elements.themeToggleIcon.textContent = isLight ? "☀️" : "🌙";
    }
  }

  function saveThemeToStorage(theme) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      console.warn("Не удалось сохранить тему в localStorage:", error);
    }
  }

  function initTheme() {
    const storedTheme = loadThemeFromStorage();
    const theme = storedTheme || getDefaultTheme();
    applyTheme(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const next = current === "light" ? "dark" : "light";
    applyTheme(next);
    saveThemeToStorage(next);
  }

  initTheme();

  /* ===== App ===== */
  let state = loadState();
  let editingTaskId = null;
  let toastTimeoutId = null;

  function showToast(message, duration = 3200) {
    if (!elements.toast) return;
    clearTimeout(toastTimeoutId);
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    toastTimeoutId = setTimeout(() => elements.toast.classList.remove("show"), duration);
  }

  function bindEvents() {
    elements.taskForm.addEventListener("submit", handleTaskFormSubmit);

    elements.filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        editingTaskId = null;
        state.filter = button.dataset.filter;
        saveState(state);
        render();
      });
    });

    if (elements.themeToggleButton) {
      elements.themeToggleButton.addEventListener("click", toggleTheme);
    }

    window.addEventListener("beforeunload", () => saveState(state));
  }

  function handleTaskFormSubmit(event) {
    event.preventDefault();
    const rawTitle = elements.taskInput.value.trim();
    if (!rawTitle) {
      showToast("Сначала введи название задачи.");
      elements.taskInput.focus();
      return;
    }

    const newTask = {
      id: generateId(),
      title: rawTitle,
      completed: false,
      pomodorosCompleted: 0,
      createdAt: Date.now(),
    };

    state.tasks.unshift(newTask);
    if (!state.selectedTaskId) state.selectedTaskId = newTask.id;

    elements.taskInput.value = "";
    editingTaskId = null;
    saveState(state);
    render();
    showToast("Задача добавлена.");
    elements.taskInput.focus();
  }

  function toggleTaskCompletion(taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.completed = !task.completed;
    saveState(state);
    render();
  }

  function deleteTask(taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;

    const shouldDelete = window.confirm(`Удалить задачу:\n«${task.title}»?`);
    if (!shouldDelete) return;

    state.tasks = state.tasks.filter((item) => item.id !== taskId);

    if (state.selectedTaskId === taskId) {
      state.selectedTaskId = state.tasks.length ? state.tasks[0].id : null;
    }

    if (editingTaskId === taskId) editingTaskId = null;

    saveState(state);
    render();
    showToast("Задача удалена.");
  }

  function selectTask(taskId) {
    state.selectedTaskId = state.selectedTaskId === taskId ? null : taskId;
    saveState(state);
    render();
  }

  function beginEditTask(taskId) {
    editingTaskId = taskId;
    render();

    const input = document.querySelector(`[data-edit-input-id="${taskId}"]`);
    if (input) {
      input.focus();
      input.select();
    }
  }

  function cancelEditTask() {
    editingTaskId = null;
    render();
  }

  function saveEditedTask(taskId, value) {
    const cleanValue = String(value).trim();
    if (!cleanValue) {
      showToast("Название задачи не может быть пустым.");
      return;
    }

    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.title = cleanValue;
    editingTaskId = null;
    saveState(state);
    render();
    showToast("Задача обновлена.");
  }

  function render() {
    renderTaskFilters();
    renderTaskStats();
    renderTaskList();
    renderHeaderSelectedTask();
    document.title = `Задачи • ${getSelectedTask(state) ? "фокус" : "без фокуса"}`;
  }

  function renderHeaderSelectedTask() {
    const selectedTask = getSelectedTask(state);
    elements.headerSelectedTask.textContent = selectedTask ? selectedTask.title : "не выбрана";
  }

  function renderTaskFilters() {
    elements.filterButtons.forEach((button) => {
      const isActive = button.dataset.filter === state.filter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
  }

  function renderTaskStats() {
    const total = state.tasks.length;
    const completed = state.tasks.filter((task) => task.completed).length;
    const active = total - completed;
    elements.statTotal.textContent = String(total);
    elements.statActive.textContent = String(active);
    elements.statCompleted.textContent = String(completed);
  }

  function renderTaskList() {
    const tasks = getFilteredTasks(state);
    elements.taskList.innerHTML = "";

    if (!tasks.length) {
      const emptyState = document.createElement("li");
      emptyState.className = "empty-state";
      emptyState.innerHTML =
        state.tasks.length === 0
          ? "Список пуст. Добавь первую задачу и выбери её как фокус."
          : `По фильтру «${FILTER_LABELS[state.filter]}» задач не найдено.`;
      elements.taskList.appendChild(emptyState);
      return;
    }

    tasks.forEach((task) => {
      const item = document.createElement("li");
      item.className = "task-item";
      item.classList.toggle("is-selected", task.id === state.selectedTaskId);
      item.classList.toggle("is-completed", task.completed);

      // Checkbox
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "task-checkbox";
      checkbox.checked = task.completed;
      checkbox.setAttribute("aria-label", `Отметить задачу «${task.title}» выполненной`);
      checkbox.addEventListener("change", () => toggleTaskCompletion(task.id));

      const content = document.createElement("div");
      content.className = "task-content";

      if (editingTaskId === task.id) {
        const editWrap = document.createElement("div");
        editWrap.className = "task-edit-wrap";

        const editInput = document.createElement("input");
        editInput.type = "text";
        editInput.className = "input";
        editInput.value = task.title;
        editInput.maxLength = 140;
        editInput.setAttribute("data-edit-input-id", task.id);

        editInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            saveEditedTask(task.id, editInput.value);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancelEditTask();
          }
        });

        const editActions = document.createElement("div");
        editActions.className = "task-edit-actions";

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "btn btn-sm btn-success";
        saveButton.textContent = "Сохранить";
        saveButton.addEventListener("click", () => saveEditedTask(task.id, editInput.value));

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "btn btn-sm btn-ghost";
        cancelButton.textContent = "Отмена";
        cancelButton.addEventListener("click", cancelEditTask);

        editActions.append(saveButton, cancelButton);
        editWrap.append(editInput, editActions);
        content.appendChild(editWrap);
      } else {
        const titleButton = document.createElement("button");
        titleButton.type = "button";
        titleButton.className = "task-title-button";
        titleButton.addEventListener("click", () => selectTask(task.id));

        const title = document.createElement("div");
        title.className = "task-title";
        title.textContent = task.title;

        const meta = document.createElement("div");
        meta.className = "task-meta";

        const statusPill = document.createElement("span");
        statusPill.className = "task-pill";
        statusPill.textContent = task.completed ? "Выполнена" : "Активна";

        const pomodoroPill = document.createElement("span");
        pomodoroPill.className = "task-pill";
        pomodoroPill.textContent = `🍅 ${task.pomodorosCompleted}`;

        meta.append(statusPill, pomodoroPill);

        if (task.id === state.selectedTaskId) {
          const focusPill = document.createElement("span");
          focusPill.className = "task-pill focus";
          focusPill.textContent = "Фокус";
          meta.appendChild(focusPill);
        }

        titleButton.append(title, meta);
        content.appendChild(titleButton);
      }

      const actions = document.createElement("div");
      actions.className = "task-actions";

      const focusButton = document.createElement("button");
      focusButton.type = "button";
      focusButton.className = "btn btn-sm btn-ghost";
      focusButton.textContent = task.id === state.selectedTaskId ? "Снять фокус" : "Выбрать";
      focusButton.addEventListener("click", () => selectTask(task.id));

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "btn btn-sm btn-ghost";
      editButton.textContent = "Редактировать";
      editButton.addEventListener("click", () => beginEditTask(task.id));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn btn-sm btn-danger";
      deleteButton.textContent = "Удалить";
      deleteButton.addEventListener("click", () => deleteTask(task.id));

      actions.append(focusButton, editButton, deleteButton);
      item.append(checkbox, content, actions);
      elements.taskList.appendChild(item);
    });
  }

  function init() {
    bindEvents();
    render();
  }

  init();
})();

