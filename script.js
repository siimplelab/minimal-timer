'use strict';

// ============================================================================
// CONSTANTS & STATE
// ============================================================================

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const CENTISECONDS_PER_SECOND = 100;

const MODE_STOPWATCH = 'stopwatch';
const MODE_COUNTDOWN = 'countdown';

const STORAGE_KEYS = {
  MODE: 'timer-mode',
  COUNTDOWN_VALUE: 'timer-countdown-value',
  THEME: 'timer-theme',
  MUTE: 'timer-mute'
};

let state = {
  mode: MODE_STOPWATCH,
  running: false,
  elapsedMs: 0,
  countdownTargetMs: 0,
  countdownCompleted: false,
  muted: false,
  theme: 'auto', // 'auto', 'light', 'dark'
  worker: null,
  animationFrameId: null,
  workerFallback: false
};

// ============================================================================
// DOM REFERENCES
// ============================================================================

const elements = {
  timerDisplay: document.getElementById('timerDisplay'),
  timeEditor: document.getElementById('timeEditor'),
  editHint: document.getElementById('editHint'),
  startPauseBtn: document.getElementById('startPauseBtn'),
  resetBtn: document.getElementById('resetBtn'),
  modeToggle: document.getElementById('modeToggle'),
  muteToggle: document.getElementById('muteToggle'),
  themeToggle: document.getElementById('themeToggle'),
  fullscreenToggle: document.getElementById('fullscreenToggle'),
  announcement: document.getElementById('announcement')
};

// ============================================================================
// TIME FORMATTING & PARSING
// ============================================================================

/**
 * Format milliseconds to hh:mm:ss.cs (centiseconds)
 */
function formatTime(ms) {
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % CENTISECONDS_PER_SECOND;
  const totalSeconds = Math.floor(totalCs / CENTISECONDS_PER_SECOND);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const cc = String(cs).padStart(2, '0');

  return { hh, mm, ss, cc };
}

/**
 * Parse hh:mm:ss.cs string to milliseconds
 * Returns null if invalid
 */
function parseTime(str) {
  const pattern = /^(\d{1,2}):(\d{1,2}):(\d{1,2})\.(\d{1,2})$/;
  const match = str.trim().match(pattern);

  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const centiseconds = parseInt(match[4], 10);

  if (minutes >= 60 || seconds >= 60 || centiseconds >= 100) {
    return null;
  }

  const totalMs =
    hours * MS_PER_HOUR +
    minutes * MS_PER_MINUTE +
    seconds * MS_PER_SECOND +
    centiseconds * 10;

  return totalMs;
}

/**
 * Convert milliseconds to display format string
 */
function msToString(ms) {
  const { hh, mm, ss, cc } = formatTime(ms);
  return `${hh}:${mm}:${ss}.${cc}`;
}

// ============================================================================
// DISPLAY UPDATES
// ============================================================================

/**
 * Update the timer display with current time
 */
function updateDisplay(ms) {
  if (state.mode === MODE_COUNTDOWN) {
    // For countdown, show remaining time
    const remaining = Math.max(0, state.countdownTargetMs - ms);
    const { hh, mm, ss, cc } = formatTime(remaining);

    const mainText = `${hh}:${mm}:${ss}`;
    const msText = `.${cc}`;

    elements.timerDisplay.querySelector('.time-main').textContent = mainText;
    elements.timerDisplay.querySelector('.time-ms').textContent = msText;

    // Check if countdown complete
    if (remaining === 0 && state.running && !state.countdownCompleted) {
      handleCountdownComplete();
    }
  } else {
    // Stopwatch mode
    const { hh, mm, ss, cc } = formatTime(ms);

    const mainText = `${hh}:${mm}:${ss}`;
    const msText = `.${cc}`;

    elements.timerDisplay.querySelector('.time-main').textContent = mainText;
    elements.timerDisplay.querySelector('.time-ms').textContent = msText;
  }
}

/**
 * Animation loop for smooth display updates
 */
function renderLoop() {
  if (state.running) {
    updateDisplay(state.elapsedMs);
    state.animationFrameId = requestAnimationFrame(renderLoop);
  }
}

// ============================================================================
// WEB WORKER INTEGRATION
// ============================================================================

/**
 * Initialize Web Worker for timing
 */
function initWorker() {
  try {
    state.worker = new Worker('worker.js');

    state.worker.addEventListener('message', (event) => {
      const { type, elapsed, running } = event.data;

      switch (type) {
        case 'ready':
          console.log('Timer worker ready');
          break;

        case 'tick':
          state.elapsedMs = elapsed;
          break;

        case 'started':
          state.running = true;
          state.elapsedMs = elapsed;
          startRenderLoop();
          break;

        case 'paused':
          state.running = false;
          state.elapsedMs = elapsed;
          stopRenderLoop();
          updateDisplay(elapsed);
          break;

        case 'reset':
          state.running = false;
          state.elapsedMs = 0;
          state.countdownCompleted = false;
          stopRenderLoop();
          updateDisplay(0);
          break;

        case 'state':
          state.running = running;
          state.elapsedMs = elapsed;
          break;
      }
    });

    state.worker.addEventListener('error', (error) => {
      console.error('Worker error:', error);
      fallbackToMainThread();
    });

  } catch (error) {
    console.warn('Worker unavailable, using main-thread timing:', error);
    fallbackToMainThread();
  }
}

/**
 * Fallback timing using main thread
 */
let fallbackStartTime = 0;
let fallbackAccumulated = 0;
let fallbackInterval = null;

function fallbackToMainThread() {
  state.workerFallback = true;
  console.warn('Using main-thread timing fallback (less accurate)');
}

function startRenderLoop() {
  if (state.animationFrameId === null) {
    state.animationFrameId = requestAnimationFrame(renderLoop);
  }
}

function stopRenderLoop() {
  if (state.animationFrameId !== null) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }
}

// ============================================================================
// TIMER CONTROL
// ============================================================================

/**
 * Start or resume timer
 */
function startTimer() {
  if (state.running) return;

  state.countdownCompleted = false;

  if (state.workerFallback) {
    // Main-thread fallback
    state.running = true;
    fallbackStartTime = performance.now();
    fallbackAccumulated = state.elapsedMs;

    fallbackInterval = setInterval(() => {
      const now = performance.now();
      state.elapsedMs = fallbackAccumulated + (now - fallbackStartTime);
    }, 16);

    startRenderLoop();
  } else {
    // Use worker
    state.worker.postMessage({
      type: 'start',
      payload: { fromMs: state.elapsedMs }
    });
  }

  elements.startPauseBtn.textContent = 'Pause';
  elements.timerDisplay.setAttribute('aria-label', 'Timer running');
}

/**
 * Pause timer
 */
function pauseTimer() {
  if (!state.running) return;

  if (state.workerFallback) {
    state.running = false;
    fallbackAccumulated = state.elapsedMs;
    clearInterval(fallbackInterval);
    fallbackInterval = null;
    stopRenderLoop();
    updateDisplay(state.elapsedMs);
  } else {
    state.worker.postMessage({ type: 'pause' });
  }

  elements.startPauseBtn.textContent = 'Start';
  elements.timerDisplay.setAttribute('aria-label', 'Timer paused');
}

/**
 * Reset timer to zero
 */
function resetTimer() {
  const wasRunning = state.running;

  if (state.workerFallback) {
    if (state.running) {
      clearInterval(fallbackInterval);
      fallbackInterval = null;
    }
    state.running = false;
    state.elapsedMs = 0;
    fallbackAccumulated = 0;
    state.countdownCompleted = false;
    stopRenderLoop();
    updateDisplay(0);
  } else {
    state.worker.postMessage({ type: 'reset' });
  }

  elements.startPauseBtn.textContent = 'Start';
  elements.timerDisplay.setAttribute('aria-label', 'Timer reset');
  announce('Timer reset');
}

/**
 * Toggle start/pause
 */
function toggleStartPause() {
  if (state.running) {
    pauseTimer();
  } else {
    startTimer();
  }
}

// ============================================================================
// MODE SWITCHING
// ============================================================================

/**
 * Switch between stopwatch and countdown modes
 */
function toggleMode() {
  const newMode = state.mode === MODE_STOPWATCH ? MODE_COUNTDOWN : MODE_STOPWATCH;
  setMode(newMode);
}

/**
 * Set timer mode
 */
function setMode(mode) {
  if (state.mode === mode) return;

  // Pause if running
  if (state.running) {
    pauseTimer();
  }

  state.mode = mode;
  state.elapsedMs = 0;
  state.countdownCompleted = false;

  if (mode === MODE_COUNTDOWN) {
    elements.modeToggle.textContent = 'Countdown';
    elements.timerDisplay.setAttribute('aria-label', 'Countdown timer');

    // Load saved countdown value
    const saved = localStorage.getItem(STORAGE_KEYS.COUNTDOWN_VALUE);
    if (saved) {
      const ms = parseInt(saved, 10);
      if (!isNaN(ms) && ms > 0) {
        state.countdownTargetMs = ms;
      }
    }

    // Default to 5 minutes if not set
    if (state.countdownTargetMs === 0) {
      state.countdownTargetMs = 5 * MS_PER_MINUTE;
    }
  } else {
    elements.modeToggle.textContent = 'Stopwatch';
    elements.timerDisplay.setAttribute('aria-label', 'Stopwatch timer');
  }

  localStorage.setItem(STORAGE_KEYS.MODE, mode);
  updateDisplay(0);
  elements.startPauseBtn.textContent = 'Start';
}

// ============================================================================
// TIME EDITING
// ============================================================================

let isEditing = false;

/**
 * Enter edit mode for time value
 */
function enterEditMode() {
  if (isEditing) return;

  isEditing = true;

  // Pause timer
  if (state.running) {
    pauseTimer();
  }

  const currentValue = state.mode === MODE_COUNTDOWN
    ? msToString(state.countdownTargetMs)
    : msToString(state.elapsedMs);

  elements.timeEditor.value = currentValue;
  elements.timerDisplay.style.display = 'none';
  elements.timeEditor.style.display = 'block';
  elements.editHint.style.display = 'block';
  elements.editHint.textContent = 'Format: hh:mm:ss.cs';

  setTimeout(() => {
    elements.timeEditor.focus();
    elements.timeEditor.select();
  }, 0);
}

/**
 * Exit edit mode and save value
 */
function exitEditMode(save = true) {
  if (!isEditing) return;

  isEditing = false;

  if (save) {
    const value = elements.timeEditor.value;
    const ms = parseTime(value);

    if (ms !== null) {
      if (state.mode === MODE_COUNTDOWN) {
        state.countdownTargetMs = ms;
        state.elapsedMs = 0;
        localStorage.setItem(STORAGE_KEYS.COUNTDOWN_VALUE, String(ms));
      } else {
        state.elapsedMs = ms;
      }
      elements.editHint.style.display = 'none';
    } else {
      // Invalid input
      elements.editHint.textContent = 'Invalid format. Use hh:mm:ss.cs';
      elements.editHint.style.color = 'var(--fg-muted)';
      setTimeout(() => {
        elements.editHint.style.display = 'none';
      }, 2000);
    }
  }

  elements.timeEditor.style.display = 'none';
  elements.timerDisplay.style.display = 'block';
  updateDisplay(state.elapsedMs);
}

// ============================================================================
// COUNTDOWN COMPLETION
// ============================================================================

/**
 * Handle countdown reaching zero
 */
function handleCountdownComplete() {
  state.countdownCompleted = true;
  pauseTimer();

  elements.timerDisplay.setAttribute('aria-live', 'polite');
  announce('Countdown complete');

  // Visual feedback
  elements.timerDisplay.classList.add('pulsing');
  setTimeout(() => {
    elements.timerDisplay.classList.remove('pulsing');
    elements.timerDisplay.setAttribute('aria-live', 'off');
  }, 3000);

  // Sound and vibration
  if (!state.muted) {
    playBeep();
    vibrate([200, 100, 200]);
  }
}

/**
 * Play beep sound using Web Audio API
 */
function playBeep() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.warn('Audio playback failed:', error);
  }
}

/**
 * Vibrate device
 */
function vibrate(pattern) {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

/**
 * Cycle through theme options
 */
function cycleTheme() {
  const themes = ['auto', 'light', 'dark'];
  const currentIndex = themes.indexOf(state.theme);
  const nextIndex = (currentIndex + 1) % themes.length;
  const nextTheme = themes[nextIndex];

  setTheme(nextTheme);
}

/**
 * Set theme
 */
function setTheme(theme) {
  state.theme = theme;

  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
    elements.themeToggle.textContent = '☀️';
    elements.themeToggle.setAttribute('aria-label', 'Theme: Auto');
  } else if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    elements.themeToggle.textContent = '☀️';
    elements.themeToggle.setAttribute('aria-label', 'Theme: Light');
  } else if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    elements.themeToggle.textContent = '🌙';
    elements.themeToggle.setAttribute('aria-label', 'Theme: Dark');
  }

  localStorage.setItem(STORAGE_KEYS.THEME, theme);
}

/**
 * Toggle mute state
 */
function toggleMute() {
  state.muted = !state.muted;
  elements.muteToggle.textContent = state.muted ? '🔇' : '🔊';
  elements.muteToggle.setAttribute('aria-label', state.muted ? 'Unmute' : 'Mute');
  localStorage.setItem(STORAGE_KEYS.MUTE, state.muted ? '1' : '0');
}

// ============================================================================
// FULLSCREEN
// ============================================================================

/**
 * Toggle fullscreen mode
 */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn('Fullscreen request failed:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

// ============================================================================
// ACCESSIBILITY
// ============================================================================

/**
 * Announce message to screen readers
 */
function announce(message) {
  elements.announcement.textContent = message;
  setTimeout(() => {
    elements.announcement.textContent = '';
  }, 1000);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// Button clicks
elements.startPauseBtn.addEventListener('click', toggleStartPause);

elements.resetBtn.addEventListener('click', () => {
  resetTimer();
});

elements.modeToggle.addEventListener('click', toggleMode);

elements.muteToggle.addEventListener('click', toggleMute);

elements.themeToggle.addEventListener('click', cycleTheme);

elements.fullscreenToggle.addEventListener('click', toggleFullscreen);

// Timer display interactions
elements.timerDisplay.addEventListener('click', () => {
  if (!isEditing) {
    enterEditMode();
  }
});

// Double-tap to toggle mode
let lastTapTime = 0;
elements.timerDisplay.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTapTime < 300) {
    e.preventDefault();
    toggleMode();
  }
  lastTapTime = now;
});

// Time editor interactions
elements.timeEditor.addEventListener('blur', () => {
  exitEditMode(true);
});

elements.timeEditor.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    exitEditMode(true);
  } else if (e.key === 'Escape') {
    exitEditMode(false);
  }
});

// Long-press reset confirmation
let resetPressTimer = null;
elements.resetBtn.addEventListener('touchstart', (e) => {
  resetPressTimer = setTimeout(() => {
    if (confirm('Reset timer?')) {
      resetTimer();
    }
    resetPressTimer = null;
  }, 500);
});

elements.resetBtn.addEventListener('touchend', () => {
  if (resetPressTimer !== null) {
    clearTimeout(resetPressTimer);
    resetPressTimer = null;
  }
});

elements.resetBtn.addEventListener('touchcancel', () => {
  if (resetPressTimer !== null) {
    clearTimeout(resetPressTimer);
    resetPressTimer = null;
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ignore if editing
  if (isEditing) return;

  // Ignore if modifier keys pressed
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  switch (e.key.toLowerCase()) {
    case ' ':
      e.preventDefault();
      toggleStartPause();
      break;

    case 'r':
      e.preventDefault();
      resetTimer();
      break;

    case 'e':
      e.preventDefault();
      enterEditMode();
      break;

    case 'm':
      e.preventDefault();
      toggleMode();
      break;

    case 'f':
      e.preventDefault();
      toggleFullscreen();
      break;
  }
});

// Visibility change handling (prevent drift when tab inactive)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Tab hidden - worker continues but we stop rendering
    stopRenderLoop();
  } else {
    // Tab visible - resume rendering
    if (state.running) {
      startRenderLoop();
    } else {
      // Update display once to show current state
      updateDisplay(state.elapsedMs);
    }
  }
});

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Load saved state from localStorage
 */
function loadState() {
  // Load mode
  const savedMode = localStorage.getItem(STORAGE_KEYS.MODE);
  if (savedMode === MODE_COUNTDOWN) {
    state.mode = MODE_COUNTDOWN;

    // Load countdown value
    const savedValue = localStorage.getItem(STORAGE_KEYS.COUNTDOWN_VALUE);
    if (savedValue) {
      const ms = parseInt(savedValue, 10);
      if (!isNaN(ms) && ms > 0) {
        state.countdownTargetMs = ms;
      }
    }

    if (state.countdownTargetMs === 0) {
      state.countdownTargetMs = 5 * MS_PER_MINUTE;
    }
  }

  // Load theme
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
  if (savedTheme) {
    setTheme(savedTheme);
  } else {
    setTheme('auto');
  }

  // Load mute state
  const savedMute = localStorage.getItem(STORAGE_KEYS.MUTE);
  if (savedMute === '1') {
    state.muted = true;
    elements.muteToggle.textContent = '🔇';
    elements.muteToggle.setAttribute('aria-label', 'Unmute');
  }

  // Update UI to reflect loaded state
  setMode(state.mode);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the application
 */
function init() {
  // Load persisted state
  loadState();

  // Initialize worker
  initWorker();

  // Initial display update
  updateDisplay(0);

  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(error => {
      console.warn('Service worker registration failed:', error);
    });
  }

  console.log('Timer initialized');
}

// Start the app
init();
