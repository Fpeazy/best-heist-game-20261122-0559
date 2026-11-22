// The screenshot scenes behind ?shot=title|stealth|alert|win.
// Each one plays the REAL rules forward from a fresh world (seed 1) for a
// fixed script of moves, driven by a small waypoint controller that uses
// the same input the player does — walk, jump over cover, hold E to hack,
// press E to take loot — so the frame is what a short game really looks
// like and the same seed always gives the same frame. Every number the
// HUD shows in a shot (alarm %, timer, grade, score) is the live state
// at the freeze, never typed in by hand.
import { COVER, STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE, newWorld, update } from './world.js';

function blankInput() {
  return {
    left: false, right: false, jump: false, crouch: false,
    interact: false, interactPressed: false,
    useEmp: false, useDecoy: false, useFlash: false,
    pausePressed: false, restartPressed: false, confirmPressed: false,
  };
}

/**
 * One step of the waypoint controller. `plan` is a list of waypoints:
 * { x, action?: 'take' | 'hack' | 'wait', seconds?: number }.
 * Returns the input for this step; advances the plan when a waypoint is
 * reached (or its action is done). The thief jumps when a solid block
 * stands in the way ahead.
 */
function drive(state, plan, step) {
  const input = blankInput();
  const p = state.player;
  const current = plan[0];
  if (!current) return { input, done: true };
  const centre = p.x + p.width / 2;

  // Action waypoints: walk to the spot first, then do the action.
  if (current.action) {
    const dx = current.x - centre;
    if (Math.abs(dx) > 12) {
      return moveToward(state, input, dx);
    }
    if (current.action === 'wait') {
      input.crouch = true;
      current.left = (current.left ?? current.seconds) - STEP;
      if (current.left <= 0) plan.shift();
      return { input, done: false };
    }
    if (current.action === 'hold') {
      // Stand still in the open (no crouch): the guards can see you.
      current.left = (current.left ?? current.seconds) - STEP;
      if (current.left <= 0) plan.shift();
      return { input, done: false };
    }
    if (current.action === 'hack') {
      if (state.terminalHacked) { plan.shift(); return { input, done: false }; }
      input.interact = true;
      return { input, done: false };
    }
    if (current.action === 'take') {
      input.interactPressed = true;
      plan.shift();
      return { input, done: false };
    }
  }

  const dx = current.x - centre;
  if (Math.abs(dx) <= 12) {
    plan.shift();
    return { input, done: false };
  }
  return moveToward(state, input, dx);
}

/** Walk toward `dx` (signed distance), jumping over solid cover ahead.
 * Only blocks that actually overlap the thief's body count, and the
 * jump starts early enough (~70px) to clear the tallest block. */
function moveToward(state, input, dx) {
  const p = state.player;
  const dir = dx > 0 ? 1 : -1;
  if (dir > 0) input.right = true;
  else input.left = true;
  if (p.onGround) {
    const aheadX = dir > 0 ? p.x + p.width + 70 : p.x - 70;
    for (const c of COVER) {
      if (!c.solid) continue;
      const verticalOverlap = c.y + c.h > p.y + 8 && c.y < p.y + p.height - 4;
      if (!verticalOverlap) continue;
      if (aheadX >= c.x && aheadX <= c.x + c.w) {
        input.jump = true;
        break;
      }
    }
  }
  return { input, done: false };
}

function stepWorld(state, plan, maxSteps, stopWhen) {
  const hadPlan = plan.length > 0;
  for (let i = 0; i < maxSteps; i += 1) {
    const { input, done } = drive(state, plan, i);
    update(state, input, STEP);
    if (state.screen !== SCREEN_PLAY) break;
    if (stopWhen && stopWhen(state)) break;
    // An empty plan from the start means "let the hall run": never break
    // on it, only on the step budget.
    if (done && hadPlan && plan.length === 0) break;
  }
}

export const SHOT_NAMES = ['title', 'stealth', 'alert', 'win'];

/**
 * Build one staged scene on a fresh world and freeze it. Returns the
 * state, ready to render. `state.staged` keeps the scene from ending in
 * a catch or an alarm trip while the script runs.
 */
export function buildShot(name) {
  const state = newWorld(1);
  state.staged = true;
  state.screen = SCREEN_PLAY;

  if (name === 'title') {
    // The hall alive behind the title: guards patrol, the camera sweeps,
    // the thief waits by the entrance. Freeze, then lay the title over it.
    stepWorld(state, [], 6 / STEP);
    state.screen = SCREEN_TITLE;
    return state;
  }

  if (name === 'stealth') {
    // Walk in, grab the first coin, then crouch behind the floor crate
    // while the guard's amber cone sweeps past, cut short by the crate.
    // Alarm here is only the slow creep: ~24s of play, so ~12%.
    const plan = [
      { x: 250 },
      { x: 410 },
      { x: 410, action: 'wait', seconds: 21 },
    ];
    stepWorld(state, plan, 40 / STEP);
    // Freeze crouched behind the crate (the last step stands the thief
    // back up as the plan empties; the staged pose is the crouch).
    state.player.crouch = true;
    state.player.height = 36;
    state.player.y = 620 - 36;
    return state;
  }

  if (name === 'alert') {
    // Walk into the open in front of the floor guard and stand there.
    // The cone fills suspicion, the chase starts (+15%), the red laser
    // sweeps across the thief (+25%). Freeze the moment the live alarm
    // meter crosses 66%.
    const plan = [{ x: 800 }, { x: 800, action: 'hold', seconds: 60 }];
    stepWorld(state, plan, 60 / STEP, (s) => s.alarm >= 66);
    return state;
  }

  if (name === 'win') {
    // The full heist, floor route: coins, both side vitrines, hack the
    // terminal, take the Kancil Emas, out the service door. The timer,
    // alarm, score and grade on the win screen are computed from this
    // very run — nothing is typed in.
    const plan = [
      { x: 250 },
      { x: 365, action: 'take' },
      { x: 500 },
      { x: 860 },
      { x: 1000, action: 'take' },
      { x: 1060, action: 'hack' },
      { x: 660, action: 'take' },
      { x: 1210 },
    ];
    stepWorld(state, plan, 90 / STEP);
    return state;
  }

  return state;
}
