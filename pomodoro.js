(() => {
  "use strict";

  const STORAGE_KEY = "single-file-todo-pomodoro-app-v1";
  const THEME_STORAGE_KEY = "single-file-todo-pomodoro-app-v1-theme";

  const MODE_LABELS = {
    work: "Работа",
    shortBreak: "Короткий перерыв",
    longBreak: "Длинный перерыв",
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

  function formatTime(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const minutesPart = String(Math.floor(seconds / 60)).padStart(2, "0");
    const secondsPart = String(seconds % 60).padStart(2, "0");
    return `${minutesPart}:${secondsPart}`;
  }

  function getModeDurationInSeconds(state, mode) {
    return state.settings[mode] * 60;
  }

  function getSelectedTask(state) {
    return state.tasks.find((task) => task.id === state.selectedTaskId) || null;
  }

  /* ===== DOM elements ===== */
  const elements = {
    modeButtons: Array.from(document.querySelectorAll(".mode-btn")),
    timerRing: document.getElementById("timer-ring"),
    timerModeLabel: document.getElementById("timer-mode-label"),
    timerDisplay: document.getElementById("timer-display"),
    timerStatus: document.getElementById("timer-status"),
    timerNote: document.getElementById("timer-note"),

    focusTaskName: document.getElementById("focus-task-name"),
    focusTaskMeta: document.getElementById("focus-task-meta"),

    startButton: document.getElementById("start-btn"),
    pauseButton: document.getElementById("pause-btn"),
    resetButton: document.getElementById("reset-btn"),

    pomodoroTotal: document.getElementById("pomodoro-total"),
    pomodoroSelectedTask: document.getElementById("pomodoro-selected-task"),
    longBreakCounter: document.getElementById("long-break-counter"),

    settingsForm: document.getElementById("settings-form"),
    workDurationInput: document.getElementById("work-duration"),
    shortBreakDurationInput: document.getElementById("short-break-duration"),
    longBreakDurationInput: document.getElementById("long-break-duration"),
    longBreakIntervalInput: document.getElementById("long-break-interval"),

    headerSelectedTask: document.getElementById("header-selected-task"),
    toast: document.getElementById("toast"),

    themeToggleButton: document.getElementById("theme-toggle"),
    themeToggleIcon: document.getElementById("theme-toggle-icon"),
  };

  /* ===== Theme ===== */
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

  /* ===== App State ===== */
  let state = loadState();
  let timerIntervalId = null;
  let toastTimeoutId = null;
  let titleFlashIntervalId = null;
  const originalDocumentTitle = document.title;

  function showToast(message, duration = 3200) {
    if (!elements.toast) return;
    clearTimeout(toastTimeoutId);
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    toastTimeoutId = setTimeout(() => elements.toast.classList.remove("show"), duration);
  }

  function playCompletionSignal() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const context = new AudioContextClass();
      const startAt = context.currentTime;

      const melody = [
        { time: 0, frequency: 880, duration: 0.12 },
        { time: 0.18, frequency: 988, duration: 0.12 },
        { time: 0.36, frequency: 1318, duration: 0.18 },
      ];

      melody.forEach((note) => {
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(note.frequency, startAt + note.time);

        gainNode.gain.setValueAtTime(0.0001, startAt + note.time);
        gainNode.gain.exponentialRampToValueAtTime(0.18, startAt + note.time + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + note.time + note.duration);

        oscillator.connect(gainNode);
        gainNode.connect(context.destination);

        oscillator.start(startAt + note.time);
        oscillator.stop(startAt + note.time + note.duration + 0.02);
      });
    } catch (error) {
      console.warn("Не удалось воспроизвести звуковой сигнал:", error);
    }

    if (navigator.vibrate) {
      navigator.vibrate([160, 90, 160]);
    }
  }

  function triggerVisualCompletionSignal() {
    document.body.classList.remove("flash-finish");
    void document.body.offsetWidth; // Force reflow so animation can trigger twice.
    document.body.classList.add("flash-finish");
  }

  function startTitleFlash(message = "⏰ Время вышло!") {
    stopTitleFlash();

    let visible = false;
    let iterations = 0;

    titleFlashIntervalId = setInterval(() => {
      document.title = visible ? message : originalDocumentTitle;
      visible = !visible;
      iterations += 1;

      if (iterations >= 12) stopTitleFlash();
    }, 900);
  }

  function stopTitleFlash() {
    if (titleFlashIntervalId) {
      clearInterval(titleFlashIntervalId);
      titleFlashIntervalId = null;
      updateDocumentTitle();
    }
  }

  function updateDocumentTitle() {
    if (titleFlashIntervalId) return;
    document.title = `${formatTime(state.timer.remaining)} • ${MODE_LABELS[state.timer.mode]} • Таймер Помодоро`;
  }

  function bindEvents() {
    elements.modeButtons.forEach((button) => {
      button.addEventListener("click", () => switchTimerMode(button.dataset.mode));
    });

    elements.startButton.addEventListener("click", startTimer);
    elements.pauseButton.addEventListener("click", pauseTimer);
    elements.resetButton.addEventListener("click", resetTimer);

    elements.settingsForm.addEventListener("submit", handleSettingsSubmit);

    if (elements.themeToggleButton) {
      elements.themeToggleButton.addEventListener("click", toggleTheme);
    }

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !titleFlashIntervalId) updateDocumentTitle();
    });

    document.addEventListener("click", stopTitleFlash, { passive: true });
    document.addEventListener("keydown", stopTitleFlash);

    window.addEventListener("beforeunload", () => saveState(state));
  }

  function switchTimerMode(mode) {
    if (!MODE_LABELS[mode]) return;

    stopTimerInterval();
    state.timer.isRunning = false;
    state.timer.endTimestamp = null;
    state.timer.mode = mode;
    state.timer.remaining = getModeDurationInSeconds(state, mode);

    saveState(state);
    renderTimer();
    showToast(`Режим переключён: ${MODE_LABELS[mode]}.`);
  }

  function startTimer() {
    if (state.timer.isRunning) return;

    state.timer.isRunning = true;
    state.timer.endTimestamp = Date.now() + state.timer.remaining * 1000;
    startTimerInterval();
    saveState(state);
    renderTimer();
  }

  function pauseTimer() {
    if (!state.timer.isRunning) return;
    syncRemainingWithClock();

    state.timer.isRunning = false;
    state.timer.endTimestamp = null;
    stopTimerInterval();
    saveState(state);
    renderTimer();
    showToast("Таймер поставлен на паузу.");
  }

  function resetTimer() {
    stopTimerInterval();
    state.timer.isRunning = false;
    state.timer.endTimestamp = null;
    state.timer.remaining = getModeDurationInSeconds(state, state.timer.mode);
    saveState(state);
    renderTimer();
    showToast("Таймер сброшен.");
  }

  function startTimerInterval() {
    stopTimerInterval();

    timerIntervalId = setInterval(() => {
      syncRemainingWithClock();

      if (state.timer.remaining <= 0) {
        handleTimerCompletion();
        return;
      }

      renderTimer();
    }, 1000);
  }

  function stopTimerInterval() {
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
  }

  function syncRemainingWithClock() {
    if (!state.timer.isRunning || !state.timer.endTimestamp) return;
    const millisecondsLeft = state.timer.endTimestamp - Date.now();
    state.timer.remaining = Math.max(0, Math.ceil(millisecondsLeft / 1000));
  }

  function handleTimerCompletion(isSilent = false) {
    stopTimerInterval();

    const finishedMode = state.timer.mode;
    state.timer.isRunning = false;
    state.timer.endTimestamp = null;
    state.timer.remaining = 0;

    let toastMessage = "";

    if (finishedMode === "work") {
      state.pomodoroCount += 1;
      state.timer.cycleWorkSessionsCompleted += 1;

      const selectedTask = getSelectedTask(state);
      if (selectedTask) selectedTask.pomodorosCompleted += 1;

      const shouldUseLongBreak = state.timer.cycleWorkSessionsCompleted % state.settings.longBreakInterval === 0;
      const nextMode = shouldUseLongBreak ? "longBreak" : "shortBreak";

      state.timer.mode = nextMode;
      state.timer.remaining = getModeDurationInSeconds(state, nextMode);

      toastMessage = selectedTask
        ? `Помидор завершён для задачи «${selectedTask.title}». Дальше: ${MODE_LABELS[nextMode].toLowerCase()}.`
        : `Помидор завершён. Дальше: ${MODE_LABELS[nextMode].toLowerCase()}.`;
    } else {
      state.timer.mode = "work";
      state.timer.remaining = getModeDurationInSeconds(state, "work");
      toastMessage = `${MODE_LABELS[finishedMode]} завершён. Можно возвращаться к работе.`;
    }

    saveState(state);
    renderTimer();

    if (!isSilent) {
      playCompletionSignal();
      triggerVisualCompletionSignal();
      startTitleFlash("⏰ Таймер завершён!");
    }

    showToast(toastMessage, 5000);
  }

  function reconcileTimerAfterReload() {
    if (!state.timer.isRunning || !state.timer.endTimestamp) {
      state.timer.remaining = Math.max(0, state.timer.remaining);
      return;
    }

    const secondsLeft = Math.ceil((state.timer.endTimestamp - Date.now()) / 1000);
    if (secondsLeft <= 0) {
      handleTimerCompletion(true);
      return;
    }

    state.timer.remaining = secondsLeft;
    startTimerInterval();
  }

  /* ===== Settings ===== */
  function populateSettingsForm() {
    elements.workDurationInput.value = state.settings.work;
    elements.shortBreakDurationInput.value = state.settings.shortBreak;
    elements.longBreakDurationInput.value = state.settings.longBreak;
    elements.longBreakIntervalInput.value = state.settings.longBreakInterval;
  }

  function handleSettingsSubmit(event) {
    event.preventDefault();

    const nextSettings = {
      work: clampNumber(elements.workDurationInput.value, 1, 180, state.settings.work),
      shortBreak: clampNumber(elements.shortBreakDurationInput.value, 1, 60, state.settings.shortBreak),
      longBreak: clampNumber(elements.longBreakDurationInput.value, 1, 120, state.settings.longBreak),
      longBreakInterval: clampNumber(elements.longBreakIntervalInput.value, 1, 12, state.settings.longBreakInterval),
    };

    const oldModeDuration = getModeDurationInSeconds(state, state.timer.mode);
    state.settings = nextSettings;

    // Если таймер не идёт и стоит на "чистом" стартовом значении — обновим его длительность.
    const newModeDuration = getModeDurationInSeconds(state, state.timer.mode);
    const timerIsAtStartValue = !state.timer.isRunning && state.timer.remaining === oldModeDuration;
    if (timerIsAtStartValue) state.timer.remaining = newModeDuration;

    saveState(state);
    renderTimer();
    showToast("Настройки сохранены.");
  }

  /* ===== Render ===== */
  function renderTimer() {
    const selectedTask = getSelectedTask(state);
    const modeLabel = MODE_LABELS[state.timer.mode];
    const modeDuration = getModeDurationInSeconds(state, state.timer.mode);

    const progress = modeDuration > 0 ? ((modeDuration - state.timer.remaining) / modeDuration) * 100 : 0;
    const currentProgress = Math.max(0, Math.min(100, progress));

    elements.modeButtons.forEach((button) => {
      const isActive = button.dataset.mode === state.timer.mode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    elements.timerRing.dataset.mode = state.timer.mode;
    elements.timerRing.style.setProperty("--progress", currentProgress.toFixed(2));

    elements.timerModeLabel.textContent = `Режим: ${modeLabel}`;
    elements.timerDisplay.textContent = formatTime(state.timer.remaining);
    elements.timerStatus.textContent = getTimerStatusText();

    elements.startButton.disabled = state.timer.isRunning;
    elements.pauseButton.disabled = !state.timer.isRunning;
    elements.resetButton.disabled = false;

    elements.headerSelectedTask.textContent = selectedTask ? selectedTask.title : "не выбрана";
    elements.focusTaskName.textContent = selectedTask ? selectedTask.title : "Не выбрана";
    elements.focusTaskMeta.textContent = selectedTask
      ? `У этой задачи уже завершено помидоров: ${selectedTask.pomodorosCompleted}.`
      : "Таймер можно использовать и без привязки, но лучше выбрать задачу для учёта помидоров.";

    elements.pomodoroTotal.textContent = String(state.pomodoroCount);
    elements.pomodoroSelectedTask.textContent = String(selectedTask ? selectedTask.pomodorosCompleted : 0);

    const remainderBeforeLongBreak =
      state.settings.longBreakInterval - (state.timer.cycleWorkSessionsCompleted % state.settings.longBreakInterval || 0);

    elements.longBreakCounter.textContent =
      remainderBeforeLongBreak === state.settings.longBreakInterval
        ? `через ${state.settings.longBreakInterval}`
        : `через ${remainderBeforeLongBreak}`;

    elements.timerNote.textContent = selectedTask
      ? `Текущий фокус: «${selectedTask.title}». Завершённый рабочий таймер добавит 1 помидор этой задаче.`
      : "Задача не выбрана. Завершённый рабочий таймер будет учтён только в общем счётчике.";

    updateDocumentTitle();
  }

  function getTimerStatusText() {
    if (state.timer.isRunning) {
      if (state.timer.mode === "work") return "Идёт рабочая сессия. Сконцентрируйся на текущей задаче.";
      if (state.timer.mode === "shortBreak") return "Идёт короткий перерыв. Переключись и выдохни.";
      return "Идёт длинный перерыв. Полноценное восстановление.";
    }

    const defaultDuration = getModeDurationInSeconds(state, state.timer.mode);
    const pausedMidway = state.timer.remaining > 0 && state.timer.remaining < defaultDuration;
    if (pausedMidway) return "Таймер остановлен на паузе. Можно продолжить или сбросить.";
    return "Таймер готов к запуску.";
  }

  function init() {
    bindEvents();
    populateSettingsForm();
    reconcileTimerAfterReload();
    renderTimer();
  }

  init();
})();

