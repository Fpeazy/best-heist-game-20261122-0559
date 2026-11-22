// VELVET VAULT — the entry point: canvas setup, the fixed-step loop, the
// title / play / pause / win / lose flow, and the staged screenshots
// (?shot=title|stealth|alert|win&seed=1). No network, no libraries.
import { FIELD, STEP } from './config.js';
import { render } from './render.js';
import { attachInput, clearEdgeFlags, createInput } from './input.js';
import { sfx } from './audio.js';
import {
  SCREEN_LOSE, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
  heatLevel, newWorld, startGame, update,
} from './world.js';
import { buildShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || '1') || 1;

// Rev11 — pre-heist planning is its own screen, between the title and
// the play: 'planning'. It is a plain string, not a world.js constant
// (world.js is frozen for this package): the world only ever sees
// SCREEN_TITLE / SCREEN_PLAY / SCREEN_WIN / SCREEN_LOSE, and main.js
// owns the planning step in between.
const SCREEN_PLANNING = 'planning';
const ENTRY_ORDER = ['door', 'vent', 'upper'];

/** The planning choice the player is making right now. */
let planningChoice = { gadget: null, entry: 'door' };
/** The choice the last started run used — R restarts with it. */
let lastPlanning = { gadget: null, entry: 'door' };
let prevPlanLeft = false;
let prevPlanRight = false;

const input = createInput();
attachInput(input, window);

let state;
let paused = false;
let lastScreen = '';

function resize() {
  const scale = Math.min(window.innerWidth / FIELD.width, window.innerHeight / FIELD.height);
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;
  canvas.style.width = `${Math.floor(FIELD.width * scale)}px`;
  canvas.style.height = `${Math.floor(FIELD.height * scale)}px`;
}
window.addEventListener('resize', resize);
resize();

function announce() {
  if (!statusEl) return;
  const lines = {
    [SCREEN_TITLE]: 'Velvet Vault. Press Enter to plan the heist.',
    [SCREEN_PLANNING]: 'Pre-heist planning. Pick a free gadget and an entry point, then press Enter.',
    [SCREEN_PLAY]: 'Heist in progress.',
    [SCREEN_WIN]: `Clean getaway. Grade ${state.grade}, score ${state.score}.`,
    [SCREEN_LOSE]: state.loseReason === 'alarm' ? 'The alarm won.' : 'Caught by a guard.',
  };
  statusEl.textContent = lines[state.screen] || '';
}

/** One frame of planning input: digits pick the free gadget (0 = none),
 *  Left/Right cycle the entry point. Edge-triggered: the use* flags are
 *  one-shot (cleared by clearEdgeFlags after this frame), the arrows
 *  are level-triggered so the previous frame's level is remembered. */
function handlePlanningInput() {
  if (input.useEmp) planningChoice.gadget = 'emp';
  if (input.useDecoy) planningChoice.gadget = 'decoy';
  if (input.useFlash) planningChoice.gadget = 'flash';
  if (input.useLockpick) planningChoice.gadget = 'lockpick';
  if (input.clearGadget) planningChoice.gadget = null;
  if (input.left && !prevPlanLeft) {
    const i = ENTRY_ORDER.indexOf(planningChoice.entry);
    planningChoice.entry = ENTRY_ORDER[(i + ENTRY_ORDER.length - 1) % ENTRY_ORDER.length];
  }
  if (input.right && !prevPlanRight) {
    const i = ENTRY_ORDER.indexOf(planningChoice.entry);
    planningChoice.entry = ENTRY_ORDER[(i + 1) % ENTRY_ORDER.length];
  }
  prevPlanLeft = input.left;
  prevPlanRight = input.right;
  // The renderer reads the choice off the state.
  state.planningChoice = planningChoice;
}

if (shotName) {
  // Staged screenshot: run the real simulation to its freeze frame,
  // render once, and signal the screenshot tool. Deterministic: the
  // same seed always gives the same frame.
  state = buildShot(shotName);
  render(ctx, state);
  window.__shotReady = true;
  window.__shotState = {
    shot: shotName,
    screen: state.screen,
    alarm: state.alarm,
    time: state.time,
    coins: state.coins,
    score: state.score,
    grade: state.grade,
    detections: state.detections,
    kancil: state.loot.kancil,
    hacked: state.terminalHacked,
    // Guard poses at the freeze, so a staged frame can be checked
    // without guessing from pixels (rev5: which way the win cone points).
    guards: state.guards.map((g) => ({ x: Math.round(g.x), facing: g.facing, state: g.state })),
    thief: { x: Math.round(state.player.x), y: Math.round(state.player.y) },
    cameraAngle: Number(state.camera.angle.toFixed(2)),
    cameraOff: state.camera.offT,
    // Rev12 live state, for the verifier: heat, inventory,
    // ghost streak, close calls, tracker and network status.
    heatPeak: Math.floor(state.heatPeak || 0),
    inventory: state.inventory,
    gadgetsUsed: state.gadgetsUsed,
    ghostStreak: state.ghostStreak || 0,
    closeCalls: state.closeCalls || 0,
    mission: state.mission,
    heat: heatLevel(state),
    netLive: !(state.camera.offT > 0 || state.terminalHacked),
  };
  announce();
} else {
  // Live play.
  state = newWorld(seed);
  window.__game = state;
  let last = performance.now();
  let accumulator = 0;
  let lastCoins = 0;
  let lastAlarm = 0;

  function frame(now) {
    const elapsed = Math.min(0.25, (now - last) / 1000);
    last = now;
    accumulator += elapsed;

    if (input.restartPressed) {
      // R restarts with the SAME planning choice (not back to title).
      startGame(state, lastPlanning);
      state.planningChoice = planningChoice;
      paused = false;
      input.restartPressed = false;
    }
    if (input.pausePressed) {
      if (state.screen === SCREEN_PLAY) paused = !paused;
      input.pausePressed = false;
    }
    if (input.confirmPressed) {
      // Title -> planning -> play. Starting from planning must clear
      // the one-shot tool flags first: the '1' that picked the EMP
      // gadget is still set this frame, and update() would fire the
      // EMP at spawn if it survived into the first play step.
      if (state.screen === SCREEN_TITLE) {
        state.screen = SCREEN_PLANNING;
        state.planningChoice = planningChoice;
      } else if (state.screen === SCREEN_PLANNING) {
        startGame(state, planningChoice);
        lastPlanning = { ...planningChoice };
        state.planningChoice = planningChoice;
        clearEdgeFlags(input);
      }
      input.confirmPressed = false;
    }
    if (state.screen === SCREEN_PLANNING) handlePlanningInput();

    if (!paused && state.screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        update(state, input, STEP);
        accumulator -= STEP;
        clearEdgeFlags(input);
        if (state.screen !== SCREEN_PLAY) break;
      }
      // Sound cues on real state changes.
      if (state.coins > lastCoins) sfx.coin();
      lastCoins = state.coins;
      if (state.alarm >= lastAlarm + 25) sfx.alarm();
      lastAlarm = state.alarm;
      if (state.screen === SCREEN_WIN) sfx.win();
      if (state.screen === SCREEN_LOSE) sfx.caught();
      if (state.glass.centre === 'smashed' && lastScreen === SCREEN_PLAY) sfx.smash();
    } else {
      accumulator = 0;
      clearEdgeFlags(input);
    }

    if (state.screen !== lastScreen) {
      announce();
      lastScreen = state.screen;
    }
    render(ctx, state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
