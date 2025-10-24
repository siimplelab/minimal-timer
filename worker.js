'use strict';

// High-precision timing worker using performance.now()
// Avoids main-thread throttling and provides monotonic time source

const TICK_RATE_MS = 16; // ~60Hz refresh for smooth display

let running = false;
let startTime = 0;
let accumulatedMs = 0;
let tickInterval = null;

/**
 * Send current elapsed time to main thread
 */
function tick() {
  if (!running) return;

  const now = performance.now();
  const currentElapsed = accumulatedMs + (now - startTime);

  self.postMessage({
    type: 'tick',
    elapsed: currentElapsed
  });
}

/**
 * Start the timer from a given accumulated value
 */
function start(fromMs = 0) {
  if (running) return;

  running = true;
  accumulatedMs = fromMs;
  startTime = performance.now();

  // Use setInterval for regular ticks, but rely on performance.now() for accuracy
  tickInterval = setInterval(tick, TICK_RATE_MS);

  self.postMessage({
    type: 'started',
    elapsed: accumulatedMs
  });
}

/**
 * Pause the timer and preserve accumulated time
 */
function pause() {
  if (!running) return;

  running = false;
  const now = performance.now();
  accumulatedMs += (now - startTime);

  if (tickInterval !== null) {
    clearInterval(tickInterval);
    tickInterval = null;
  }

  self.postMessage({
    type: 'paused',
    elapsed: accumulatedMs
  });
}

/**
 * Reset timer to zero
 */
function reset() {
  const wasRunning = running;

  if (running) {
    clearInterval(tickInterval);
    tickInterval = null;
  }

  running = false;
  startTime = 0;
  accumulatedMs = 0;

  self.postMessage({
    type: 'reset',
    elapsed: 0
  });

  // If was running, restart from zero
  if (wasRunning) {
    start(0);
  }
}

/**
 * Get current state without changing it
 */
function getState() {
  let currentElapsed = accumulatedMs;

  if (running) {
    const now = performance.now();
    currentElapsed = accumulatedMs + (now - startTime);
  }

  self.postMessage({
    type: 'state',
    running: running,
    elapsed: currentElapsed
  });
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'start':
      start(payload?.fromMs ?? accumulatedMs);
      break;

    case 'pause':
      pause();
      break;

    case 'reset':
      reset();
      break;

    case 'getState':
      getState();
      break;

    default:
      console.warn('Unknown message type:', type);
  }
});

// Notify main thread that worker is ready
self.postMessage({ type: 'ready' });
