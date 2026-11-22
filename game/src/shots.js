// The screenshot scenes behind ?shot=title|stealth|alert|win.
// Each one plays the REAL rules forward from a fresh world (seed 1) for a
// fixed script of moves, driven by a small waypoint controller that uses
// the same input the player does — walk, jump over cover, press E to open
// the hacking minigame and stop its needle, spend coins on tools — so the
// frame is what a real game looks like and the same seed always gives the
// same frame. Every number the HUD shows in a shot (alarm %, timer, grade,
// score) is the live state at the freeze, never typed in by hand.
//
// Rev11: the layout is two storeys now (ground hall + upper floor +
// vent), and the hack is the timing minigame (E opens it, E stops the
// needle in the green zone, 3 hits). The win route is the package-M
// route: wait out the floor guard behind the crate, EMP the camera,
// hack the terminal, cross the upper floor for all four side loot,
// drop to the ground floor, EMP + FLASH for the final sprint to the
// service door. The timer on the win screen is the real time that run
// took.
import { COVER, STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE, newWorld, startGame, update } from './world.js';

function blankInput() {
  return {
    left: false, right: false, jump: false, crouch: false,
    interact: false, interactPressed: false,
    useEmp: false, useDecoy: false, useFlash: false, useLockpick: false,
    pausePressed: false, restartPressed: false, confirmPressed: false,
  };
}

// Climb chains: [playerX, topY] pairs. The player walks (on whatever
// surface they stand on) to playerX, jumps straight up, and lands on
// the platform whose top is topY. Each hop is at most ~68px, inside the
// ~110px jump, and the body overlaps both the surface stood on and the
// next step at the jump spot, so a vertical hop lands cleanly. The
// balcony chain climbs the left staircase; the vent chain climbs from
// the balcony's right end up to the vent duct (the vent was unreachable
// in v1: balcony 440 to the old first vent step 250 is 190px).
const CLIMBS = {
  balcony: [
    [92, 578], [104, 542], [168, 506], [232, 472], [296, 440],
  ],
  vent: [
    [520, 372], [580, 316], [590, 250], [600, 210], [668, 168],
  ],
};

/** True when the thief stands (or crouches) with its bottom at `top`. */
function bottomAt(state, top) {
  const p = state.player;
  return Math.abs(p.y + p.height - top) <= 8 || p.y + p.height < top;
}

/**
 * One step of the climb state machine. `wp` carries `chain` (the
 * CLIMBS list), `idx` (next point) and `phase` ('walk' | 'jump' |
 * 'settle'). Returns the input for this step; shifts the waypoint off
 * the plan when the chain is done.
 */
function climbStep(state, wp, plan) {
  const input = blankInput();
  const p = state.player;
  const chain = wp.chain;
  if (wp.idx >= chain.length) {
    plan.shift();
    return { input, done: false };
  }
  const [jumpX, topY] = chain[wp.idx];
  const bottom = p.y + p.height;

  if (wp.phase === 'settle') {
    wp.settleT = (wp.settleT ?? 0) + STEP;
    if (p.onGround) {
      if (bottomAt(state, topY)) {
        wp.idx += 1;
        wp.phase = 'walk';
        wp.settleT = 0;
        wp.tries = 0;
      } else if (wp.settleT > 1.2) {
        // Landed on a lower surface (or the same one): retry this hop,
        // and if the target is now out of jump reach, restart the chain.
        wp.tries = (wp.tries ?? 0) + 1;
        if (wp.tries > 2 || bottom < topY - 118) wp.idx = 0;
        wp.phase = 'walk';
        wp.settleT = 0;
      }
      return { input, done: false };
    }
    if (wp.settleT > 1.5) {
      // Still airborne far too long: give up on this hop and retry.
      wp.phase = 'walk';
      wp.settleT = 0;
    }
    return { input, done: false };
  }

  if (wp.phase === 'jump') {
    // One vertical hop, no horizontal input: the body is already over
    // both the surface below and the next step.
    input.jump = true;
    wp.phase = 'settle';
    wp.settleT = 0;
    return { input, done: false };
  }

  // Phase 'walk': get to the jump spot on the current surface.
  if (Math.abs(p.x - jumpX) <= 6) {
    // Already over the next step (e.g. an earlier hop overshot onto a
    // higher step): skip the hop and move on.
    if (bottomAt(state, topY)) {
      wp.idx += 1;
      return { input, done: false };
    }
    wp.phase = 'jump';
    return { input, done: false };
  }
  const dx = jumpX - p.x;
  return moveToward(state, input, dx);
}

/**
 * One step of the waypoint controller. `plan` is a list of waypoints:
 * { x, y?, action?: 'take' | 'hack' | 'openHack' | 'wait' | 'hold' |
 * 'sneak' | 'waitGuardLeft' | 'waitGuardRight' | 'waitAlarm' | 'pace' |
 * 'emp' | 'flash' | 'decoy' | 'climbBalcony' |
 * 'climbVent', seconds?: number, alarm?: number }.
 * Returns the input for this step; advances the plan when a waypoint is
 * reached (or its action is done). The thief jumps when a solid block
 * stands in the way ahead.
 */
export function drive(state, plan, step) {
  const input = blankInput();
  const p = state.player;
  const current = plan[0];
  if (!current) return { input, done: true };
  const centre = p.x + p.width / 2;
  const bottom = p.y + p.height;

  // Climb waypoints run their own state machine.
  if (current.action === 'climbBalcony' || current.action === 'climbVent') {
    if (!current.chain) {
      current.chain = CLIMBS[current.action === 'climbBalcony' ? 'balcony' : 'vent'];
      current.idx = 0;
      current.phase = 'walk';
    }
    return climbStep(state, current, plan);
  }

  // 'waitAlarm' / 'waitChase' are used by the alert shot; see buildShot.

  // 'pace' walks back and forth between current.x and current.x1 and
  // never shifts off the plan (the caller stops the run): the thief
  // stays between the two crates (430 and 760) so the floor guard
  // keeps a clear line of sight while his suspicion fills, and keeps
  // moving so the guard cannot close to catch range before the chase
  // triggers. Running left past the crate at 430 shields the thief
  // and suspicion decays before it hits 100; standing still lets the
  // guard walk up adjacent. It runs before the arrived gate, which
  // would otherwise drag the thief back to current.x.
  if (current.action === 'pace') {
    if (current.target === undefined) current.target = current.x1 ?? current.x;
    if (Math.abs(centre - current.target) <= 12) {
      current.target = current.target === current.x ? (current.x1 ?? current.x) : current.x;
    }
    return moveToward(state, input, current.target - centre);
  }

  // A waypoint with a y is only "arrived" on the right level too.
  const arrived = Math.abs(centre - current.x) <= 12
    && (current.y === undefined || Math.abs(bottom - current.y) <= 30);

  // Wrong level, standing on something higher (e.g. a plinth the jump
  // landed on): walk on past the target in the approach direction until
  // the thief steps off the higher surface and drops to the target
  // level. Without this the driver centres exactly on the target x and
  // oscillates on top of the plinth forever, the y never matching.
  if (current.y !== undefined && p.onGround && bottom < current.y - 30) {
    if (current.approachDir === undefined) {
      current.approachDir = current.x - centre >= 0 ? 1 : -1;
    }
    return moveToward(state, input, current.x + current.approachDir * 100 - centre);
  }

  // Action waypoints: walk to the spot first, then do the action.
  if (current.action) {
    if (!arrived) {
      // 'sneak' crouch-walks to the spot (the crate jump still works:
      // moveToward jumps solid cover ahead, crouched or not).
      if (current.action === 'sneak') {
        const r = moveToward(state, input, current.x - centre);
        r.input.crouch = true;
        return r;
      }
      return moveToward(state, input, current.x - centre);
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
    if (current.action === 'sneak') {
      plan.shift();
      return { input, done: false };
    }
    if (current.action === 'waitAlarm') {
      // Stand still until the live alarm meter reaches current.alarm
      // (the camera's lock-ons do the work, +25% each). A 30s timeout
      // keeps a missed beam from hanging the run.
      current.left = (current.left ?? 30) - STEP;
      if (state.alarm >= (current.alarm ?? 50) || current.left <= 0) plan.shift();
      return { input, done: false };
    }
    if (current.action === 'waitGuardLeft' || current.action === 'waitGuardRight') {
      // Crouch behind cover until the floor guard turns at an end of
      // his patrol: 'Left' = at the right end (x~740) turning left,
      // 'Right' = at the left end (x~520) turning right. A 40s
      // timeout keeps a missed phase from hanging the run.
      input.crouch = true;
      current.left = (current.left ?? 40) - STEP;
      const g = state.guards[0];
      const gc = g.x + 19;
      const ok = current.action === 'waitGuardLeft'
        ? (gc >= 715 && g.facing === -1 && g.state === 'patrol')
        : (gc <= 545 && g.facing === 1 && g.state === 'patrol');
      if (ok || current.left <= 0) plan.shift();
      return { input, done: false };
    }
    if (current.action === 'openHack') {
      // Press E once to open the minigame, then move on: the caller
      // freezes the frame on the needle, it does not play the game.
      if (state.minigame && state.minigame.active) { plan.shift(); return { input, done: false }; }
      input.interactPressed = true;
      return { input, done: false };
    }
    if (current.action === 'hack') {
      // Play the hacking minigame for real: E opens it, then E stops
      // the needle once per green-zone visit (the flag clears when the
      // needle leaves the zone, so a visit can only fire one press).
      // Three green hits hack the terminal.
      if (state.terminalHacked) { plan.shift(); return { input, done: false }; }
      if (!state.minigame || !state.minigame.active) {
        input.interactPressed = true;
        return { input, done: false };
      }
      const needle = state.minigame.needle;
      if (needle >= 44 && needle <= 56 && !current.pressedInZone) {
        input.interactPressed = true;
        current.pressedInZone = true;
      } else if (needle < 40 || needle > 60) {
        current.pressedInZone = false;
      }
      return { input, done: false };
    }
    if (current.action === 'take') {
      input.interactPressed = true;
      plan.shift();
      return { input, done: false };
    }
    // One-shot tools: spend the coins once, then move on.
    if (current.action === 'emp') {
      input.useEmp = true;
      plan.shift();
      return { input, done: false };
    }
    if (current.action === 'flash') {
      input.useFlash = true;
      plan.shift();
      return { input, done: false };
    }
    if (current.action === 'decoy') {
      input.useDecoy = true;
      plan.shift();
      return { input, done: false };
    }
  }

  if (arrived) {
    plan.shift();
    return { input, done: false };
  }
  return moveToward(state, input, current.x - centre);
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
    // Range probe, not a single point: a single-point probe (front edge
    // + 70px) missed a block standing closer than 70px, so a thief who
    // stopped right against a plinth or crate never jumped and walked
    // into it forever. Jump when any solid block's span touches the
    // window ahead of the thief's front edge. The window is 40px, not
    // 70: a 70px jump starts so early the thief lands ON a balcony
    // plinth (top 372) and gets stuck up there; a 40px jump lands past
    // it, back on the balcony.
    const front = dir > 0 ? p.x + p.width : p.x;
    const near = dir > 0 ? front : front - 40;
    const far = dir > 0 ? front + 40 : front;
    for (const c of COVER) {
      if (!c.solid) continue;
      const verticalOverlap = c.y + c.h > p.y + 8 && c.y < p.y + p.height - 4;
      if (!verticalOverlap) continue;
      if (c.x + c.w >= near && c.x <= far) {
        input.jump = true;
        break;
      }
    }
  }
  return { input, done: false };
}

export function stepWorld(state, plan, maxSteps, stopWhen) {
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
    // Rev6: the spawn (x=56) pins the thief to the left edge of the
    // frame — squeezed against the wall at 768x480. Pose him a step
    // into the hall (x=170, clear floor between the entrance steps and
    // the first coin): still "waiting by the entrance", no longer
    // cramped. The camera beam at the freeze (angle ~2.19) passes
    // ~145px right of the tagline, so the beam needs no move.
    state.player.x = 170;
    state.screen = SCREEN_TITLE;
    return state;
  }

  if (name === 'stealth') {
    // Rev13 — the rev11/12 stealth frame showed the hacking minigame,
    // but the two rev12 systems it was supposed to showcase never
    // read: the thief at the terminal stands in NO shadow zone, and
    // both guards were patrol/return (the LKP marker only draws for
    // search/suspect). This frame shows them both, from the real rules:
    // the thief is seen, FLASHes the chasing guard blind, and hides
    // crouched in the ground shadow zone (500-590) while the guard
    // SEARCHES the last-seen spot — IN SHADOW pill + teal ring on the
    // thief, amber "?" ring at the last-seen spot, SEARCHING label.
    // The route, measured in node (rev13 probes 9-12):
    //  - Walk to 860 and stand 2s: the guard finishes investigating
    //    the walk noise and his suspicion decays to 0 (patrol). A
    //    bare detour without the stand leaves him investigating at
    //    suspicion ~33, ten pixels from the thief — the chase then
    //    triggers with the guard adjacent and the staged catch
    //    flip-flops chase<->search every step (det 2000+, alarm 100).
    //  - Walk back to 700 (the alert shot's walk), pace 560-620:
    //    the guard investigates the pace noise and chases with ~60px
    //    of separation (det 1, alarm ~38 at the trigger).
    //  - FLASH at once, where the thief stands: the guard is blinded
    //    3s, so he cannot catch the thief while the thief moves, and
    //    loses the trail after 2s (chase -> search, alarm -6).
    //  - Run to 545 and crouch: the thief is inside the shadow zone
    //    (centre 565) before the guard flips to search. The freeze
    //    lands the step the guard enters search: alarm ~33, tier 0,
    //    the camera still live, the Kancil vitrine in frame.
    // The minigame panel leaves this frame (the minigame itself still
    // runs: the win route hacks the terminal through it, play-tested).
    stepWorld(state, [
      { x: 860 },
      { x: 860, action: 'hold', seconds: 2 },
    ], 20 / STEP);
    stepWorld(state, [{ x: 700 }], 10 / STEP);
    stepWorld(state, [
      { x: 560, x1: 620, action: 'pace' },
    ], 40 / STEP, (s) => s.guards[0].state === 'chase');
    const fx = Math.round(state.player.x);
    stepWorld(state, [{ x: fx, action: 'flash' }], 5 / STEP);
    stepWorld(state, [
      { x: 545 },
      { x: 545, action: 'wait', seconds: 10 },
    ], 12 / STEP, (s) => s.guards[0].state === 'search' && s.shadow.inShadow);
    return state;
  }

  if (name === 'alert') {
    // Rev13 — the alarm is earned honestly, but NOT by kiting the
    // floor guard, and NOT by the rev12 pace: pacing the wide lane
    // (520-740) crosses the laser grid (596/660/724) every 2s for
    // +10% a crossing, so the meter pins at 99% (tier 2 LOCKDOWN)
    // before the chase even triggers. The rev13 route freezes at
    // ~75% (tier 2 ALERT, door locked) instead — measured in node
    // (rev13 probes 2-13), same dramatic beat (THE BLACKOUT, thief
    // haloed, red cone, Kancil, CAMERA OFF, DOOR LOCKED -> ROOF):
    //  - One camera lock-on only (waitAlarm 25): the thief stands at
    //    860, where the beam reaches him but the crate at 760 blocks
    //    the floor guard's line of sight. Phase 1 ends at alarm ~39
    //    (one lock-on +25, grid crossings on the walk in, creep).
    //  - Walk to 700, crouch-wait 1.0s at 590, pace the NARROW lane
    //    560-620: the guard investigates the pace noise and chases
    //    with ~60px of separation, 2s in. The freeze lands at ~75%
    //    (tier 2 ALERT, door locked -> ROOF): one lock-on +25, one
    //    walk grid +10, the crouch-wait's body across the 596 laser
    //    grid +10, the chase +15, creep. The stop is the chase
    //    itself — the rev12 stop (alarm >= 66 AND chase) would also
    //    fire now, but the chase alone is the honest trigger.
    //    A 1.5s wait lets the guard close in and the staged catch
    //    flip-flops (det 10, alarm 99); a 2.0s wait never triggers a
    //    clean chase at all (det 2828). 1.0s is the measured value.
    //  - EMP where the thief stands, run away from the guard: the
    //    blackout (3s) and camera-off (5s) still frame the freeze.
    // Lanes that do NOT work, measured: 520-580 (a 60px lane lets the
    // guard catch the thief in the same update the chase triggers, so
    // the staged catch flip-flops chase<->search every step: det
    // 2000+, alarm 100); standing still / holding (same catch, the
    // guard walks up adjacent); 530-590 and 500-560 (the chase never
    // triggers cleanly). Without the crouch-wait the freeze lands at
    // 65% (tier 1, door NOT locked): the second lock-on would add
    // +25 and overshoot to ~90, and the one grid crossing that would
    // lift it to ~75 is blocked by the 2s grid cooldown in every lane
    // tried — the crouch-wait is what buys that crossing.
    const plan = [
      { x: 860 },
      { x: 860, action: 'waitAlarm', alarm: 25 },
      { x: 700 },
      { x: 590, action: 'wait', seconds: 1.0 },
      { x: 560, x1: 620, action: 'pace' },
    ];
    stepWorld(state, plan, 60 / STEP, (s) => s.guards[0].state === 'chase');
    const cx = Math.round(state.player.x + state.player.width / 2);
    const gx = Math.round(state.guards[0].x + 19);
    const dir = cx < gx ? -1 : 1; // keep running away from the guard
    stepWorld(state, [{ x: cx, action: 'emp' }], 5 / STEP);
    stepWorld(state, [{ x: cx + dir * 200 }], 20);
    return state;
  }

  if (name === 'win') {
    // The full heist on the two-storey layout (package-M route): wait
    // out the floor guard behind the crate, EMP the camera, hack the
    // terminal through the minigame, cross the upper floor for all
    // four side loot, drop to the ground floor, EMP + FLASH for the
    // final sprint to the service door. The timer, alarm, score and
    // grade on the win screen are computed from this very run —
    // nothing is typed in. The run is built to finish unseen
    // (0 detections) so the Grade S on the screen agrees with the
    // "never saw a thing" line and the TIMES SPOTTED 0 row.
    // The run starts with the EMP as its free planning gadget: the
    // first FLASH (upstairs, at the idol) costs 2 coins, and paying
    // for the first EMP too would leave the thief 1 coin short.
    startGame(state, { gadget: 'emp', entry: 'door' });
    state.staged = true;
    state.screen = SCREEN_PLAY;
    const plan = [
      { x: 250 },
      // Wait behind the crate until the floor guard turns left at the
      // right end of his patrol: the crate shields the thief from the
      // guard's cone while waiting.
      { x: 350, action: 'waitGuardLeft' },
      // Floor coins at 540 and 580 (see config): the thief walks both
      // on the floor, so the EMP below fires with the planning gadget
      // free. The EMP fires AT 580, before the thief walks into the
      // camera's floor zone (x>=795): EMPing at 990 meant crossing
      // that zone with the camera live, and the beam caught the thief
      // mid-jump over the statue.
      { x: 540 },
      { x: 580, action: 'emp' },
      // Hack the terminal through the minigame: 3 green-zone hits.
      { x: 1100, action: 'hack' },
      // Wait at the terminal until the floor guard turns right at the
      // left end of his patrol, so the crouch-walk back crosses his
      // lane while he walks away to the right.
      { x: 1100, action: 'waitGuardRight' },
      // Crouch-walk to the left staircase (jumping the crate at 760
      // on the way), then climb to the upper floor.
      { x: 92, action: 'sneak' },
      { action: 'climbBalcony' },
      // Upper floor, left to right: coin at 150, FLASH to blind the
      // upper guard, idol at 165, coin at 340, gold bar, vase, tiara.
      { x: 150 },
      { x: 150, action: 'flash' },
      { x: 165, action: 'take' },
      { x: 340 },
      { x: 885, action: 'take' },
      { x: 1002, action: 'take' },
      { x: 1115, action: 'take' },
      // Walk off the slab's right edge and drop to the ground floor,
      // then run left to the Kancil's vitrine. The waypoint carries
      // y:620 on purpose: a bare {x:1230} completes while the thief
      // still stands ON the slab (centre 1201 is within 12 of 1230),
      // and the whole rest of the route then plays out upstairs. With
      // y:620 the driver only counts the waypoint once the thief has
      // actually dropped to the ground floor.
      { x: 1260, y: 620 },
      { x: 750 },
      // FLASH + EMP for the final stretch: the floor guard is blind
      // for 3s and the camera is dead for 5s.
      { x: 750, action: 'flash' },
      { x: 750, action: 'emp' },
      // Crouch to the Kancil, take it, sprint to the service door.
      // y:620 on the last waypoint is the same safety net as the drop:
      // the win fires during the sprint, but if anything went wrong
      // upstairs the driver would walk off the slab instead of
      // completing the route on the wrong floor.
      { x: 660, action: 'sneak' },
      { x: 660, action: 'take' },
      { x: 1210, y: 620 },
    ];
    stepWorld(state, plan, 120 / STEP);
    // Rev5: the freeze is the win moment, not the walk that got there.
    // Clear floaters and particles: the "+1 COIN" from the coin at 1160
    // used to hang over the thief at the service door, and burst
    // particles from the Kancil grab littered the gold. The win screen
    // numbers are untouched — they are the live state of this run.
    state.floaters = [];
    state.particles = [];
    return state;
  }

  return state;
}
