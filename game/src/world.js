// VELVET VAULT — the simulation. A two-storey gallery hall, side view.
// The thief crosses the room, reads two guard cones and one red camera
// laser, works the security terminal, steals the Kancil Emas and leaves
// through the service door — or, when the alarm locks that door, over
// the roof through the vent duct. Every number the HUD shows comes from
// here: alarm, coins, timer, score and grade are all computed from live
// state.
//
// Rev11 (mechanics): 17 systems, all live in the simulation — advanced
// vision (crouch / lights / dim / flicker / tier shape the cone),
// sound (running and jumping are loud, crouch-walking is silent),
// suspicion, camera (sinus sweep, scan pause, cover-blocked beam,
// disguise-aware lock-on), guard AI (search, noise investigation,
// cutoff at the service door, body reaction), lockpick gadget,
// environmental interaction (wardrobe hide spots, light switches),
// mission phases, alarm tiers, extra loot + heist rank, disguise,
// body & evidence (silent takedowns), pre-heist planning (free gadget
// + entry point), dynamic environment (dimming + flicker), dynamic
// escape (locked door -> roof), and the hacking timing minigame.
// Everything deterministic: seeded via s.rng / mulberry32, no
// Math.random, no Date.now in the simulation.
import {
  ALARM, ALARM_TIERS, CAMERA, COINS, COVER, CUTOFF_X, EXTRA_LOOT, FIELD,
  GUARD, HIDE_SPOTS, INVENTORY_START, LOCKER, LOOT, MINIGAME, PLATFORMS,
  PLAYER, SCORE, SERVICE_DOOR, SHADOW_ZONES, SWITCHES, TERMINAL, TOOLS,
  VITRINES,
} from './config.js';
import { mulberry32 } from './random.js';
import { insideCone, laserHit } from './vision.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_WIN = 'win';
export const SCREEN_LOSE = 'lose';

const GRID_BEAMS = [596, 660, 724];

export function newWorld(seed = 1) {
  const rng = mulberry32(seed);
  return {
    seed,
    rng,
    time: 0,
    screen: SCREEN_TITLE,
    loseReason: '',
    alarm: 0,
    coins: 0,
    detections: 0,
    player: {
      x: 56, y: 620 - PLAYER.height, vx: 0, vy: 0,
      width: PLAYER.width, height: PLAYER.height,
      facing: 1, crouch: false, onGround: true, inVent: false,
      hidden: false,
    },
    guards: [
      {
        id: 0, x: 560, y: 620 - GUARD.height, width: GUARD.width, height: GUARD.height,
        facing: 1, state: 'patrol', suspicion: 0, pauseT: 0, wp: 0,
        coneRange: GUARD.coneRange, coneHalfAngle: GUARD.coneHalfAngle,
        waypoints: [{ x: 520 }, { x: 740 }],
        lastSeenX: 0, lastSeenY: 0, loseT: 0, searchT: 0,
        invX: 0, invKind: null, invBody: null, invArrived: false, cutoff: false,
        bark: 'All quiet on the night shift.', barkT: 4,
      },
      {
        id: 1, x: 280, y: 440 - GUARD.height, width: GUARD.width, height: GUARD.height,
        facing: 1, state: 'patrol', suspicion: 0, pauseT: 0, wp: 0,
        coneRange: GUARD.coneRange, coneHalfAngle: GUARD.coneHalfAngle,
        waypoints: [{ x: 160 }, { x: 560 }],
        levelY: 440,
        lastSeenX: 0, lastSeenY: 0, loseT: 0, searchT: 0,
        invX: 0, invKind: null, invBody: null, invArrived: false, cutoff: false,
        bark: 'Mind the velvet rope, sir.', barkT: 4,
      },
    ],
    camera: { angle: 1.7, dir: 1, offT: 0, lockOnT: 0, hitCooldownT: 0, pauseT: 0, disguiseBeamT: 0 },
    gridOffT: 0,
    gridCooldownT: 0,
    terminalHacked: false,
    // Render still draws its hack progress bar from this field: the
    // minigame drives it (0..2 = 0..3 hits), so the bar survives the
    // hold-to-hack -> minigame change untouched.
    hackProgress: 0,
    glass: { left: 'shut', centre: 'shut', right: 'shut' },
    loot: { idol: false, tiara: false, kancil: false, goldbar: false, vase: false },
    coinTaken: COINS.map(() => false),
    blackoutT: 0,
    flashT: 0,
    decoy: null,
    particles: [],
    floaters: [],
    score: 0,
    grade: '',
    winTime: 0,
    lootPoints: 0,
    stepCount: 0,
    // --- Rev11 state (see the contract in the task brief). ---
    noise: null,
    noiseCooldown: 0,
    disguise: { active: false, t: 0 },
    bodies: [],
    planning: { gadget: null, entry: null },
    planningUsed: { gadget: false },
    minigame: null,
    alarmTier: 0,
    escape: { doorLocked: false, route: 'door', unlockedByLockpick: false, warnT: 0 },
    mission: { phase: 0, sideDone: 0, sideTotal: 4 },
    env: { dimT: 0, nextDimAt: 20 + (seed % 7), flicker: 1 },
    lights: { ground: true, upper: true },
    lockerUsed: false,
    heistRank: 'Novice',
    // --- Rev12 state. ---
    shadow: { inShadow: false },
    heatPeak: 0,
    inventory: { ...INVENTORY_START },
    gadgetsUsed: { emp: 0, decoy: 0, flash: 0, lockpick: 0 },
    lastGadget: null,
    ghostStreak: 0,
    ghostBonus: 0,
    closeCalls: 0,
    closeCallBonus: 0,
  };
}

function playerCentre(s) {
  const p = s.player;
  return { x: p.x + p.width / 2, y: p.y + p.height / 2 };
}

function addFloater(s, x, y, text, color) {
  s.floaters.push({ x, y, text, color, life: 1.4 });
}

function burst(s, x, y, color, n = 10) {
  for (let i = 0; i < n; i += 1) {
    const a = s.rng() * Math.PI * 2;
    const sp = 40 + s.rng() * 140;
    s.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.6 + s.rng() * 0.5, color, size: 2 + s.rng() * 3 });
  }
}

/** Which floor a bottom-y sits on: ground hall, upper floor, or vent. */
function floorOf(bottomY) {
  if (bottomY >= 600) return 'ground';
  if (bottomY <= 200) return 'vent';
  return 'upper';
}

function guardFloor(g) {
  return (g.levelY !== undefined ? g.levelY : 620) === 440 ? 'upper' : 'ground';
}

/** A guard's live cone range: crouch, lights, dimming and alarm tier
 *  all shape it. Set onto g.coneRange before any insideCone call. */
function effectiveConeRange(s, g) {
  let range = GUARD.coneRange;
  if (s.player.crouch) range *= 0.75; // crouched thief: -25% range
  if (s.alarmTier === 2) range *= 1.15; // tier 2: +15% range
  if (!s.lights[guardFloor(g)]) range *= 0.7; // dark floor: -30%
  if (s.env.dimT > 0) range *= 0.75; // dimming event: -25%
  // Rev12 shadow: a still or crouched thief in shadow is hard to see
  // (-15% cone); a SPRINTING thief gets NO concealment at all — he is
  // loud and moving, and the shadow does not hide him. (A flat -15%
  // for runners starved the alert scene's chase: suspicion filled so
  // slowly the guard was already adjacent when it maxed, and the
  // staged catch flipped chase -> search before the freeze.)
  if (s.shadow && s.shadow.inShadow && (s.player.crouch || Math.abs(s.player.vx) < 50)) {
    range *= 0.85;
  }
  return range;
}

/** Suspicion fill multiplier for this guard, right now. */
function suspicionMultiplier(s, g, dist) {
  let m = 1;
  if (s.player.crouch) m *= 0.7; // crouched: -30% suspicion rate
  // Disguise: suspicion fills at 0.35x — unless the guard is close
  // enough to inspect (under 80px), where the disguise fools nobody.
  if (s.disguise.active && dist >= 80) m *= 0.35;
  if (s.alarmTier >= 1) m *= 1.2; // tier 1+: +20% suspicion rate
  if (!s.lights[guardFloor(g)]) m *= 0.7; // dark floor: -30%
  if (s.env.dimT > 0) m *= 0.5; // dimming event: -50%
  if (s.env.flicker < 0.35) m *= 0.5; // chandelier flicker dip: -50%
  // Rev12 shadow: -55% suspicion for a still/crouched thief, NO
  // concealment for a sprinting one (see effectiveConeRange above).
  if (s.shadow && s.shadow.inShadow && (s.player.crouch || Math.abs(s.player.vx) < 50)) {
    m *= 0.45;
  }
  return m;
}

/** Patrol-speed multiplier from the alarm tier (1 / 1.2 / 1.4). */
function patrolMultiplier(s) {
  return s.alarmTier === 0 ? 1 : s.alarmTier === 1 ? 1.2 : 1.4;
}

/** Emit a noise event guards can hear (same floor, within radius). */
function emitNoise(s, x, bottomY, radius, t) {
  s.noise = { x, y: bottomY, t, radius, floor: floorOf(bottomY) };
}

/** The hall's dimming schedule and chandelier flicker: pure functions
 *  of s.time and the seed, so a staged run always dims at the same
 *  moments. First dim at 20 + (seed % 7) seconds, then every 25s for
 *  5s; flicker is a slow sinus, dipping below 0.35 near its trough. */
function updateEnv(s) {
  const firstDim = 20 + (s.seed % 7);
  const period = 25;
  const dimLen = 5;
  if (s.time >= firstDim) {
    const cycle = (s.time - firstDim) % period;
    s.env.dimT = cycle < dimLen ? dimLen - cycle : 0;
    s.env.nextDimAt = firstDim + (Math.floor((s.time - firstDim) / period) + 1) * period;
  } else {
    s.env.dimT = 0;
    s.env.nextDimAt = firstDim;
  }
  s.env.flicker = 0.5 + 0.5 * Math.sin(s.time * 0.9 + s.seed * 1.3);
}

/** Mission phase + side objectives, recomputed live every update. */
function updateMission(s) {
  const side = ['idol', 'tiara', 'goldbar', 'vase'].filter((k) => s.loot[k]).length;
  s.mission.sideDone = side;
  let phase = 0; // 0 Infiltrate
  if (s.loot.kancil) {
    // 2 Steal done -> 3 Escape once the thief is heading for a way out.
    phase = (s.player.x > 1050 || (s.escape.route === 'roof' && s.player.inVent)) ? 3 : 2;
  } else if (s.terminalHacked) {
    phase = 1; // 1 Hack done -> Steal
  }
  s.mission.phase = phase;
  // Rev12 — ghost streak: loot taken while never detected. It freezes
  // the moment a detection happens (the streak is a clean-run record).
  if (s.detections === 0) {
    s.ghostStreak = side + (s.loot.kancil ? 1 : 0);
  }
}

/** Rev12 — is the thief standing in a shadow zone right now? Fixed
 *  seeded rectangles from config; the renderer draws them, the
 *  suspicion/cone math reads this flag. */
function updateShadow(s) {
  const p = s.player;
  const cx = p.x + p.width / 2;
  const cy = p.y + p.height / 2;
  s.shadow.inShadow = SHADOW_ZONES.some(
    (z) => cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h,
  );
}

/** Rev12 — heat level from the run's peak alarm. Heat never cools:
 *  once a tier is reached it stays, even if the alarm itself drops
 *  (hack relief, chase ending). Returns 0-100 and the word. */
export function heatLevel(s) {
  const peak = s.heatPeak || 0;
  return {
    value: Math.floor(peak),
    word: peak >= 70 ? 'HOT' : peak >= 35 ? 'WARM' : 'CALM',
    color: peak >= 70 ? '#ff2e3e' : peak >= 35 ? '#ffb020' : '#2ec4b6',
  };
}

/** Heist rank from total loot taken (side loot + Kancil): 0-1 Novice,
 *  2-3 Shadow, 4-5 Master Thief. Bonus in computeScore: 0 / 250 / 600. */
function updateHeistRank(s) {
  const total = s.mission.sideDone + (s.loot.kancil ? 1 : 0);
  s.heistRank = total >= 4 ? 'Master Thief' : total >= 2 ? 'Shadow' : 'Novice';
}

/** Land the player on one-way platforms and on top of solid cover. */
function collidePlatforms(s, prevBottom) {
  const p = s.player;
  p.onGround = false;
  if (p.vy < 0) return;
  const landOn = (top, x, w) => {
    if (p.x + p.width > x + 2 && p.x < x + w - 2) {
      if (prevBottom <= top + 1 && p.y + p.height >= top && p.y + p.height <= top + 26) {
        p.y = top - p.height;
        p.vy = 0;
        p.onGround = true;
        return true;
      }
    }
    return false;
  };
  for (const pf of PLATFORMS) {
    if (landOn(pf.y, pf.x, pf.w)) return;
  }
  for (const c of COVER) {
    if (!c.solid) continue;
    if (landOn(c.y, c.x, c.w)) return;
  }
}

/** Solid cover blocks the thief sideways (plinths, statues, wall). */
function collideCover(s) {
  const p = s.player;
  for (const c of COVER) {
    if (!c.solid) continue;
    // A thief whose centre is above the block's top is standing on it
    // (or stepping off its edge): pushing them sideways then would
    // teleport a thief who falls off the left edge to the block's right
    // side, and trap them walking on top of the block forever. Only
    // push when the thief is genuinely beside the block.
    if (p.y + p.height / 2 <= c.y + 4) continue;
    if (p.x < c.x + c.w && p.x + p.width > c.x && p.y < c.y + c.h && p.y + p.height > c.y) {
      // Push out on the side the thief came from.
      if (p.vx > 0) p.x = c.x - p.width;
      else if (p.vx < 0) p.x = c.x + c.w;
      else if (p.x + p.width / 2 < c.x + c.w / 2) p.x = c.x - p.width;
      else p.x = c.x + c.w;
      p.vx = 0;
    }
  }
}

function guardEye(g) {
  return { x: g.x + g.width / 2, y: g.y + 14 };
}

function setBark(g, text) {
  g.bark = text;
  g.barkT = 3.2;
}

function updateGuard(s, g, dt) {
  // A guard who has been taken down stays down: no patrol, no cone.
  if (g.state === 'down') {
    if (g.barkT > 0) g.barkT -= dt;
    return;
  }
  const p = s.player;
  const centre = playerCentre(s);
  const blinded = s.flashT > 0;
  const eye = guardEye(g);
  const dist = Math.hypot(centre.x - eye.x, centre.y - eye.y);

  // --- Seeing: only while the thief is inside this guard's cone. ---
  // A hidden thief (wardrobe) cannot be seen at all. The old
  // per-frame rng crouch rule (s.rng() < 0.4 within 90px) is gone:
  // crouch now deterministically shrinks the cone 25% and the
  // suspicion rate 30% (see effectiveConeRange/suspicionMultiplier).
  g.coneRange = effectiveConeRange(s, g);
  let sees = false;
  if (!blinded && !p.hidden && s.screen === SCREEN_PLAY) {
    sees = insideCone(g, centre.x, centre.y);
  }
  // A guard who sees something turns to face it: otherwise a guard that
  // walks up to the thief's last-seen spot can end up facing away from
  // the thief standing right beside them, and never chase.
  if (sees) g.facing = centre.x >= eye.x ? 1 : -1;
  if (sees) {
    const closeness = 1.6 - Math.min(1, dist / g.coneRange);
    g.suspicion = Math.min(100, g.suspicion + GUARD.suspicionRate * closeness * suspicionMultiplier(s, g, dist) * dt);
    // Rev12 — Last Known Position: the guard remembers exactly where
    // the thief was last seen. lastSeenSet stays true while the guard
    // is still hunting that spot (suspect/search); it clears when the
    // guard gives up and returns to patrol.
    g.lastSeenSet = true;
    g.suspicionPeak = Math.max(g.suspicionPeak || 0, g.suspicion);
    // Disguise: no chase can START unless the guard is close enough to
    // inspect (under 80px) — suspicion is capped at 99 beyond that.
    if (s.disguise.active && dist >= 80) g.suspicion = Math.min(g.suspicion, 99);
    // Running inside a guard's cone at close range blows the disguise.
    if (s.disguise.active && dist < 80 && !p.crouch && Math.abs(p.vx) > 0) {
      s.disguise.active = false;
      s.disguise.t = 0;
      addFloater(s, centre.x, centre.y - 46, 'DISGUISE BLOWN!', '#ff2e3e');
    }
    g.lastSeenX = centre.x;
    g.lastSeenY = centre.y;
    g.loseT = 0;
    if (g.suspicion >= 100 && g.state !== 'chase') {
      g.state = 'chase';
      g.cutoff = false;
      s.alarm = Math.min(100, s.alarm + ALARM.chaseTrigger);
      s.detections += 1;
      setBark(g, 'INTRUDER! Stop right there!');
      burst(s, eye.x, eye.y, '#ffb020', 12);
      // Alert propagation: the other guard hears the shout and goes on
      // alert too. The ground-floor backup does NOT converge on the
      // last-seen spot — it runs to the cutoff by the service door
      // (x ~1050) to intercept the escape. The upper-floor guard
      // converges on the last-seen spot as before.
      for (const other of s.guards) {
        if (other === g || other.state === 'down') continue;
        if (other.state === 'patrol' || other.state === 'suspect') {
          other.state = 'suspect';
          other.suspicion = Math.max(other.suspicion, 60);
          other.lastSeenX = g.lastSeenX;
          other.lastSeenY = g.lastSeenY;
          other.cutoff = guardFloor(other) === 'ground';
          setBark(other, 'Backup! Eyes on the thief!');
        }
      }
    } else if (g.suspicion > 45 && g.state === 'patrol') {
      g.state = 'suspect';
      setBark(g, 'Hmm… what was that?');
    }
  } else {
    g.suspicion = Math.max(0, g.suspicion - GUARD.suspicionDecay * dt);
    if (g.state === 'suspect' && g.suspicion < 10) {
      // Rev12 — close call: the guard grew suspicious (suspicion had
      // crossed 45 to enter suspect) and lost the thief without a
      // chase. A real near-miss moment, counted live for the debrief.
      if (g.suspicionPeak > 45) {
        s.closeCalls += 1;
        addFloater(s, g.x + g.width / 2, g.y - 24, 'CLOSE CALL!', '#ffd97a');
      }
      g.suspicionPeak = 0;
      g.lastSeenSet = false;
      g.state = 'patrol';
      g.cutoff = false;
      setBark(g, 'Must have been the wind.');
    }
    if (g.state === 'chase') {
      g.loseT += dt;
      if (g.loseT > 2) {
        g.state = 'search';
        g.searchT = GUARD.searchSeconds;
        s.alarm = Math.max(0, s.alarm - ALARM.chaseEndRelief);
        setBark(g, 'Where did they go? Search the hall!');
      }
    }
  }

  // --- Hearing: a fresh noise pulls patrol/suspect guards on the same
  // floor to the spot (running feet, jumps, landings, takedowns). ---
  if ((g.state === 'patrol' || g.state === 'suspect') && s.noise && guardFloor(g) === s.noise.floor) {
    if (Math.abs(g.x + g.width / 2 - s.noise.x) < s.noise.radius) {
      g.state = 'investigate';
      g.invX = s.noise.x;
      g.invKind = 'noise';
      g.invBody = null;
      g.invArrived = false;
      g.cutoff = false;
      setBark(g, 'Did you hear that?');
    }
  }
  // The decoy clatter pulls any patrolling guard, any distance.
  if (g.state === 'patrol' && s.decoy) {
    g.state = 'investigate';
    g.invX = s.decoy.x;
    g.invKind = 'decoy';
    g.invBody = null;
    g.invArrived = false;
    setBark(g, 'Did you hear that clatter?');
  }

  // --- Moving, by state. ---
  const groundY = g.levelY !== undefined ? g.levelY : 620;
  const patrolMult = patrolMultiplier(s);
  const moveTo = (targetX, speed) => {
    const dx = targetX - (g.x + g.width / 2);
    if (Math.abs(dx) < 4) return true;
    const step = Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
    g.x += step;
    g.facing = dx > 0 ? 1 : -1;
    g.y = groundY - g.height;
    return false;
  };

  if (blinded) {
    g.state = g.state === 'chase' ? 'chase' : g.state;
    setBark(g, 'My eyes! I can\'t see a thing!');
  } else if (g.state === 'patrol') {
    if (g.pauseT > 0) {
      g.pauseT -= dt;
    } else {
      const target = g.waypoints[g.wp];
      if (moveTo(target.x, GUARD.patrolSpeed * patrolMult)) {
        g.wp = (g.wp + 1) % g.waypoints.length;
        g.pauseT = 1.4;
      }
    }
  } else if (g.state === 'suspect') {
    // Cutoff guards run to the service door; the rest walk to lastSeen.
    const tx = g.cutoff ? CUTOFF_X : g.lastSeenX;
    moveTo(tx, GUARD.patrolSpeed * 1.4 * patrolMult);
  } else if (g.state === 'chase') {
    const caught = Math.abs(centre.x - (g.x + g.width / 2)) < 26
      && Math.abs(centre.y - (g.y + g.height / 2)) < 46;
    if (caught && !p.hidden && s.screen === SCREEN_PLAY && !s.staged) {
      loseGame(s, 'caught');
      return;
    }
    if (caught && s.staged) {
      // Staged scenes never end in a catch: the guard loses the trail.
      g.state = 'search';
      g.searchT = GUARD.searchSeconds;
      setBark(g, 'Where did they go? Search the hall!');
    }
    moveTo(centre.x, GUARD.chaseSpeed);
  } else if (g.state === 'investigate') {
    if (g.invArrived) {
      // Arrived: look around a moment, then walk back to the rounds.
      g.pauseT -= dt;
      if (g.pauseT <= 0) {
        g.invArrived = false;
        g.state = 'return';
        setBark(g, 'Nothing here. Back to the rounds.');
      }
    } else if (moveTo(g.invX !== undefined ? g.invX : g.lastSeenX, GUARD.patrolSpeed * 1.6 * patrolMult)) {
      g.invArrived = true;
      g.pauseT = 1.2;
      // Reaching a body raises the alarm again and puts every guard
      // on alert at the body's spot.
      if (g.invKind === 'body' && g.invBody && !g.invBody.found) {
        g.invBody.found = true;
        s.alarm = Math.min(100, s.alarm + ALARM.bodyFound);
        for (const other of s.guards) {
          if (other.state === 'down') continue;
          other.state = 'suspect';
          other.suspicion = Math.max(other.suspicion, 60);
          other.lastSeenX = g.invBody.x;
          other.lastSeenY = g.invBody.y;
          other.cutoff = false;
        }
        setBark(g, 'A body! Sound the alarm!');
        addFloater(s, g.invBody.x, g.invBody.y - 60, 'BODY FOUND  +15%', '#ff2e3e');
      }
    }
  } else if (g.state === 'search') {
    g.searchT -= dt;
    moveTo(g.lastSeenX, GUARD.patrolSpeed * 1.3 * patrolMult);
    if (g.searchT <= 0) {
      g.state = 'return';
      g.lastSeenSet = false;
      setBark(g, 'Nothing here. Back to the rounds.');
    }
  } else if (g.state === 'return') {
    const home = g.waypoints[0];
    if (moveTo(home.x, GUARD.patrolSpeed * patrolMult)) {
      g.state = 'patrol';
      g.wp = 0;
    }
  }
  if (g.barkT > 0) g.barkT -= dt;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function updateCamera(s, dt) {
  const cam = s.camera;
  if (cam.offT > 0) {
    cam.offT -= dt;
    cam.lockOnT = 0;
    cam.disguiseBeamT = 0;
    return;
  }
  // Sweep speed varies deterministically with time (sinus, 0.3-0.6
  // rad/s) and runs faster at higher alarm tiers (x1.5 / x2). At each
  // end of the sweep the camera pauses briefly (scan pause).
  if (cam.pauseT > 0) {
    cam.pauseT -= dt;
  } else {
    const base = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(s.time * 0.7));
    const tierMult = s.alarmTier === 0 ? 1 : s.alarmTier === 1 ? 1.5 : 2;
    cam.angle += cam.dir * base * tierMult * dt;
    if (cam.angle > CAMERA.maxAngle) { cam.angle = CAMERA.maxAngle; cam.dir = -1; cam.pauseT = CAMERA.scanPauseSeconds; }
    if (cam.angle < CAMERA.minAngle) { cam.angle = CAMERA.minAngle; cam.dir = 1; cam.pauseT = CAMERA.scanPauseSeconds; }
  }
  if (cam.hitCooldownT > 0) cam.hitCooldownT -= dt;
  if (cam.lockOnT > 0) cam.lockOnT -= dt;

  // The beam is a thin line: does it cross the thief? Cover blocks it
  // (laserHit): a thief behind a plinth, statue or crate is safe.
  const centre = playerCentre(s);
  const bx = CAMERA.x + Math.cos(cam.angle) * CAMERA.beamLength;
  const by = CAMERA.y + Math.sin(cam.angle) * CAMERA.beamLength;
  const d = distToSegment(centre.x, centre.y, CAMERA.x, CAMERA.y, bx, by);
  const along = ((centre.x - CAMERA.x) * Math.cos(cam.angle) + (centre.y - CAMERA.y) * Math.sin(cam.angle));
  const blockedAt = laserHit(CAMERA.x, CAMERA.y, cam.angle, CAMERA.beamLength);
  const inBeam = d < CAMERA.beamWidth / 2 + 14 && along > 0 && along < CAMERA.beamLength && along < blockedAt;
  // A hidden thief is inside a wardrobe: the beam cannot reach them.
  // A disguised thief is only locked on after 1s of continuous beam.
  if (!inBeam || s.player.hidden) {
    cam.disguiseBeamT = 0;
    return;
  }
  if (s.disguise.active) {
    cam.disguiseBeamT += dt;
    if (cam.disguiseBeamT <= CAMERA.disguiseBeamSeconds) return;
  }
  if (cam.hitCooldownT > 0) return;
  cam.hitCooldownT = CAMERA.hitCooldown;
  cam.lockOnT = 1.2;
  cam.disguiseBeamT = 0;
  s.alarm = Math.min(100, s.alarm + CAMERA.alarmHit);
  s.detections += 1;
  if (s.disguise.active) {
    s.disguise.active = false;
    s.disguise.t = 0;
    addFloater(s, centre.x, centre.y - 46, 'DISGUISE BLOWN!', '#ff2e3e');
  }
  addFloater(s, centre.x, centre.y - 46, 'CAMERA LOCK-ON  +25%', '#ff2e3e');
  burst(s, centre.x, centre.y, '#ff2e3e', 10);
}

function updateGrid(s) {
  if (s.gridOffT > 0 || s.gridCooldownT > 0) return;
  const p = s.player;
  for (const bx of GRID_BEAMS) {
    if (p.x + p.width > bx - 3 && p.x < bx + 3 && p.y + p.height > 500 && p.y < 620) {
      s.gridCooldownT = 2;
      s.alarm = Math.min(100, s.alarm + 10);
      addFloater(s, bx, 510, 'LASER GRID  +10%', '#ff2e3e');
      burst(s, bx, p.y + p.height / 2, '#ff2e3e', 8);
      return;
    }
  }
}

function nearInteractable(s) {
  const p = s.player;
  const cx = p.x + p.width / 2;
  const cy = p.y + p.height / 2;
  const near = (x, y, range = 78) => Math.hypot(cx - x, cy - y) < range;
  // Loot first: the right vitrine stands close to the terminal, and the
  // terminal's wider radius must not swallow a loot grab. Each target
  // also carries an anchor: the top centre of the object it belongs to,
  // so the interaction pill can sit ON its object instead of floating
  // at the top of the screen (rev5).
  if (!s.loot.kancil && near(VITRINES.centre.x + 60, VITRINES.centre.y + 60, 96)) {
    return s.terminalHacked
      ? { kind: 'kancil', label: 'E — TAKE THE KANCIL EMAS', anchor: { x: VITRINES.centre.x + 60, y: VITRINES.centre.y } }
      : { kind: 'kancil', label: 'E — SMASH THE GLASS (+40% ALARM)', anchor: { x: VITRINES.centre.x + 60, y: VITRINES.centre.y } };
  }
  if (!s.loot.idol && near(VITRINES.left.x + 35, VITRINES.left.y + 50, 80)) return { kind: 'idol', label: 'E — TAKE THE JADE IDOL (+3 coins)', anchor: { x: VITRINES.left.x + 35, y: VITRINES.left.y } };
  if (!s.loot.tiara && near(VITRINES.right.x + 35, VITRINES.right.y + 50, 80)) return { kind: 'tiara', label: 'E — TAKE THE PEARL TIARA (+3 coins)', anchor: { x: VITRINES.right.x + 35, y: VITRINES.right.y } };
  if (!s.loot.goldbar && near(EXTRA_LOOT.goldbar.x + 25, EXTRA_LOOT.goldbar.y + 30, 80)) return { kind: 'goldbar', label: 'E — TAKE THE GOLD BAR (+4 coins, +8% ALARM)', anchor: { x: EXTRA_LOOT.goldbar.x + 25, y: EXTRA_LOOT.goldbar.y } };
  if (!s.loot.vase && near(EXTRA_LOOT.vase.x + 22, EXTRA_LOOT.vase.y + 30, 80)) return { kind: 'vase', label: 'E — TAKE THE PORCELAIN VASE (+2 coins, +5% ALARM)', anchor: { x: EXTRA_LOOT.vase.x + 22, y: EXTRA_LOOT.vase.y } };
  if (!s.terminalHacked && near(TERMINAL.x + 28, TERMINAL.y + 40, 72)) return { kind: 'terminal', label: 'E — HACK SECURITY TERMINAL (timing game)', anchor: { x: TERMINAL.x + 28, y: TERMINAL.y } };
  // Guard-uniform locker (disguise): one uniform, then it is empty.
  if (!s.lockerUsed && near(LOCKER.x + 24, LOCKER.y + 50, 80)) return { kind: 'locker', label: 'E — TAKE THE GUARD UNIFORM', anchor: { x: LOCKER.x + 24, y: LOCKER.y } };
  // Wardrobe hide spots (ground hall + upper floor).
  for (const spot of HIDE_SPOTS) {
    if (near(spot.x + spot.w / 2, spot.y + spot.h / 2, 84)) {
      return p.hidden
        ? { kind: 'hide', spot, label: 'E — STEP OUT OF THE WARDROBE', anchor: { x: spot.x + spot.w / 2, y: spot.y } }
        : { kind: 'hide', spot, label: 'E — HIDE IN THE WARDROBE', anchor: { x: spot.x + spot.w / 2, y: spot.y } };
    }
  }
  // Light switches, one per floor.
  for (const sw of SWITCHES) {
    if (near(sw.x, sw.y, 70)) {
      const on = s.lights[sw.floor];
      return {
        kind: 'switch', floor: sw.floor,
        label: on ? `E — LIGHTS OFF (${sw.floor.toUpperCase()} FLOOR)` : `E — LIGHTS ON (${sw.floor.toUpperCase()} FLOOR)`,
        anchor: { x: sw.x, y: sw.y - 20 },
      };
    }
  }
  // A body on the floor can be dragged out of sight.
  for (const body of s.bodies) {
    if (!body.hidden && near(body.x, body.y - 20, 70)) {
      return { kind: 'body', body, label: 'E — HIDE THE BODY', anchor: { x: body.x, y: body.y - 50 } };
    }
  }
  return null;
}

/** Silent takedown: the thief behind a patrolling/suspecting guard,
 *  close (under 45px), guard facing away, suspicion under 50 — and
 *  only when no loot/terminal/wardrobe target is nearer (the takedown
 *  is checked after nearInteractable() comes back empty). */
function tryTakedown(s) {
  const p = s.player;
  if (p.hidden) return false;
  const pc = playerCentre(s);
  for (const g of s.guards) {
    if (g.state !== 'patrol' && g.state !== 'suspect') continue;
    if (g.suspicion >= 50) continue;
    const gc = { x: g.x + g.width / 2, y: g.y + g.height / 2 };
    if (Math.abs(pc.y - gc.y) > 100) continue; // different floor
    const dx = pc.x - gc.x;
    if (Math.abs(dx) > 45) continue;
    if (dx * g.facing >= 0) continue; // must be behind the guard
    g.state = 'down';
    g.suspicion = 0;
    g.cutoff = false;
    s.bodies.push({
      x: gc.x, y: g.y + g.height,
      levelY: g.levelY !== undefined ? g.levelY : 620,
      hidden: false, reported: false, found: false,
    });
    emitNoise(s, pc.x, p.y + p.height, 60, 0.6);
    addFloater(s, gc.x, g.y - 10, 'SILENT TAKEDOWN', '#2ec4b6');
    burst(s, gc.x, gc.y, '#2ec4b6', 10);
    return true;
  }
  return false;
}

function doInteract(s) {
  const target = nearInteractable(s);
  if (!target) {
    tryTakedown(s);
    return;
  }
  if (target.kind === 'terminal') {
    // Hacking is now the timing minigame: E opens it, E stops the needle.
    s.minigame = {
      active: true, needle: 0, dir: 1, hits: 0,
      need: MINIGAME.need, speed: MINIGAME.startSpeed, phase: 0,
    };
    s.hackProgress = 0;
    return;
  }
  if (target.kind === 'kancil') {
    if (s.terminalHacked) {
      s.glass.centre = 'open';
      addFloater(s, VITRINES.centre.x + 60, 470, 'KANCIL EMAS — SILENT!', '#ffd97a');
    } else {
      s.glass.centre = 'smashed';
      s.alarm = Math.min(100, s.alarm + ALARM.smashGlass);
      addFloater(s, VITRINES.centre.x + 60, 470, 'GLASS SMASHED  +40%', '#ff2e3e');
      burst(s, VITRINES.centre.x + 60, 560, '#cfe8ff', 18);
    }
    s.loot.kancil = true;
    burst(s, VITRINES.centre.x + 60, 560, '#ffd97a', 22);
    return;
  }
  if (target.kind === 'idol' || target.kind === 'tiara') {
    s.glass[target.kind === 'idol' ? 'left' : 'right'] = 'open';
    s.loot[target.kind === 'idol' ? 'idol' : 'tiara'] = true;
    s.coins += target.kind === 'idol' ? LOOT.idolValue : LOOT.tiaraValue;
    s.alarm = Math.min(100, s.alarm + ALARM.forceSideVitrine);
    addFloater(s, VITRINES[target.kind === 'idol' ? 'left' : 'right'].x + 35, 490, '+3 COINS  (+5% ALARM)', '#ffd97a');
    return;
  }
  if (target.kind === 'goldbar' || target.kind === 'vase') {
    const key = target.kind;
    const cfg = EXTRA_LOOT[key];
    s.loot[key] = true;
    s.coins += key === 'goldbar' ? LOOT.goldbarValue : LOOT.vaseValue;
    s.alarm = Math.min(100, s.alarm + (key === 'goldbar' ? ALARM.goldbarAlarm : ALARM.vaseAlarm));
    addFloater(s, cfg.x + cfg.w / 2, cfg.y - 10, key === 'goldbar' ? '+4 COINS  (+8% ALARM)' : '+2 COINS  (+5% ALARM)', '#ffd97a');
    burst(s, cfg.x + cfg.w / 2, cfg.y + 30, '#ffd97a', 14);
    return;
  }
  if (target.kind === 'locker') {
    s.disguise = { active: true, t: 25 };
    s.lockerUsed = true;
    addFloater(s, LOCKER.x + 24, LOCKER.y - 10, 'DISGUISE — GUARD UNIFORM (25s)', '#2ec4b6');
    return;
  }
  if (target.kind === 'hide') {
    const p = s.player;
    p.hidden = !p.hidden;
    if (p.hidden) {
      // Step into the wardrobe: centre the thief on it.
      p.x = target.spot.x + target.spot.w / 2 - p.width / 2;
      p.vx = 0;
      addFloater(s, target.spot.x + target.spot.w / 2, target.spot.y - 10, 'HIDDEN', '#2ec4b6');
    }
    return;
  }
  if (target.kind === 'switch') {
    s.lights[target.floor] = !s.lights[target.floor];
    const on = s.lights[target.floor];
    addFloater(s, target.floor === 'ground' ? 120 : 160, target.floor === 'ground' ? 520 : 340,
      on ? `${target.floor.toUpperCase()} LIGHTS ON` : `${target.floor.toUpperCase()} LIGHTS OFF`, '#ffd97a');
    return;
  }
  if (target.kind === 'body') {
    target.body.hidden = true;
    addFloater(s, target.body.x, target.body.y - 60, 'BODY HIDDEN', '#2ec4b6');
  }
}

/** The hacking minigame: a needle sweeps 0..100 and back; press E in
 *  the green zone (40-60) for a hit, 3 hits hack the terminal. A miss
 *  adds +5% alarm and keeps the hits (choice: the pressure is the
 *  alarm, not losing progress). Needle phase advances from stored
 *  state, so it is deterministic for a given input script — and the
 *  render/driver package can read s.minigame.needle live to time its
 *  presses. First green window: ~0.73-1.09s after the game opens
 *  (speed 55/s from 0). Speed rises 25 per hit. */
function updateMinigame(s, input, dt) {
  const mg = s.minigame;
  mg.phase += mg.speed * dt;
  if (mg.phase >= 200) mg.phase -= 200;
  if (mg.phase <= 100) { mg.needle = mg.phase; mg.dir = 1; }
  else { mg.needle = 200 - mg.phase; mg.dir = -1; }
  if (input.interactPressed) {
    if (mg.needle >= MINIGAME.zoneLo && mg.needle <= MINIGAME.zoneHi) {
      mg.hits += 1;
      mg.speed = MINIGAME.startSpeed + mg.hits * MINIGAME.speedPerHit;
      s.hackProgress = (mg.hits / mg.need) * 2; // render's progress bar
      addFloater(s, TERMINAL.x + 28, 500, `HACK ${mg.hits}/${mg.need}`, '#2ec4b6');
      if (mg.hits >= mg.need) {
        s.terminalHacked = true;
        s.alarm = Math.max(0, s.alarm - ALARM.hackRelief);
        s.camera.offT = CAMERA.hackOffSeconds;
        s.gridOffT = CAMERA.hackOffSeconds;
        s.minigame = null;
        addFloater(s, TERMINAL.x + 28, 500, 'TERMINAL HACKED  −20%', '#2ec4b6');
        burst(s, TERMINAL.x + 28, 560, '#2ec4b6', 16);
      }
    } else {
      s.alarm = Math.min(100, s.alarm + ALARM.minigameMiss);
      addFloater(s, TERMINAL.x + 28, 500, 'MISS  +5%', '#ff2e3e');
    }
  }
}

function useTool(s, tool) {
  const p = s.player;
  // Rev12 — Gadget Inventory: every use spends one stock. With no
  // stock left the thief auto-buys one with coins at the TOOLS price
  // (the old pay-per-use economy, unchanged); broke or out of stock
  // and out of coins, the gadget does not fire. The first use of the
  // planning gadget marks the planning grant as used.
  const spend = (cost) => {
    if (s.inventory[tool] > 0) {
      s.inventory[tool] -= 1;
    } else if (s.coins >= cost) {
      s.coins -= cost;
    } else {
      return false;
    }
    s.gadgetsUsed[tool] += 1;
    s.lastGadget = tool;
    if (s.planning.gadget === tool && !s.planningUsed.gadget) s.planningUsed.gadget = true;
    return true;
  };
  if (tool === 'emp' && spend(TOOLS.emp.cost)) {
    s.camera.offT = CAMERA.empOffSeconds;
    s.gridOffT = CAMERA.empOffSeconds;
    s.blackoutT = 3;
    addFloater(s, p.x + 20, p.y - 20, 'EMP! THE BLACKOUT', '#2ec4b6');
    return true;
  }
  if (tool === 'decoy' && spend(TOOLS.decoy.cost)) {
    s.decoy = { x: Math.max(40, Math.min(FIELD.width - 40, p.x + p.facing * 150)), y: 620, t: 4 };
    addFloater(s, s.decoy.x, 580, 'DECOY — CLATTER!', '#ffd97a');
    return true;
  }
  if (tool === 'flash' && spend(TOOLS.flash.cost)) {
    s.flashT = 3;
    for (const g of s.guards) g.suspicion = Math.max(0, g.suspicion - 60);
    addFloater(s, p.x + 20, p.y - 20, 'FLASHBANG!', '#ffffff');
    burst(s, p.x + 20, p.y + 20, '#ffffff', 16);
    return true;
  }
  if (tool === 'lockpick') {
    // Lockpick only fires on a real target — never spends stock or
    // coins on nothing.
    const target = nearInteractable(s);
    const nearDoor = p.x + p.width > SERVICE_DOOR.x - 60 && p.y + p.height > 500;
    if (target && (target.kind === 'idol' || target.kind === 'tiara')) {
      if (!spend(TOOLS.lockpick.cost)) return false;
      s.glass[target.kind === 'idol' ? 'left' : 'right'] = 'open';
      s.loot[target.kind] = true;
      s.coins += target.kind === 'idol' ? LOOT.idolValue : LOOT.tiaraValue;
      // Silent: NO +5% alarm, unlike forcing the vitrine open.
      addFloater(s, VITRINES[target.kind === 'idol' ? 'left' : 'right'].x + 35, 490, 'LOCKPICK — SILENT!', '#2ec4b6');
      return true;
    }
    if (s.escape.doorLocked && nearDoor) {
      if (!spend(TOOLS.lockpick.cost)) return false;
      s.escape.unlockedByLockpick = true;
      addFloater(s, SERVICE_DOOR.x + 32, 470, 'DOOR UNLOCKED', '#2ec4b6');
      return true;
    }
    return false;
  }
  return false;
}

function computeScore(s) {
  const lootPoints = s.coins
    + (s.loot.idol ? 0 : 0) // coins already include idol/tiara values
    + (s.loot.kancil ? LOOT.kancilValue : 0);
  // NOTE: coins counter already counts idol (+3), tiara (+3), gold bar
  // (+4) and vase (+2) values, so lootPoints = coins + kancil value only.
  const timeBonus = Math.round(Math.max(0, SCORE.timeBonusCapSeconds - s.winTime) * SCORE.timeBonusPerSecond);
  const undetected = s.alarm < SCORE.undetectedAlarmMax ? SCORE.undetectedBonus : 0;
  const rankBonus = SCORE.rankBonus[s.heistRank] || 0;
  // Rev12 — ghost bonus (clean-run loot streak) and close-call bonus
  // (near-misses survived). Both are zero on a detected run, so a
  // spotted thief can never out-score a ghost.
  const ghostBonus = s.detections === 0 ? s.ghostStreak * SCORE.ghostBonusPerLoot : 0;
  const closeCallBonus = s.detections === 0 ? s.closeCalls * SCORE.closeCallBonus : 0;
  const score = Math.round(SCORE.base + lootPoints * SCORE.perCoin + timeBonus + undetected + rankBonus + ghostBonus + closeCallBonus);
  // Grade S is the ghost grade: it needs the score AND zero detections.
  // A run that was spotted (a chase or a camera lock-on) caps at A, so
  // the win screen can never print "GRADE S" above "TIMES SPOTTED 1".
  let grade = score >= SCORE.gradeS ? 'S' : score >= SCORE.gradeA ? 'A' : score >= SCORE.gradeB ? 'B' : 'C';
  if (grade === 'S' && s.detections > 0) grade = 'A';
  return { score, grade, lootPoints, timeBonus, undetected, rankBonus, ghostBonus, closeCallBonus };
}

function winGame(s) {
  s.screen = SCREEN_WIN;
  s.winTime = s.time;
  const result = computeScore(s);
  s.score = result.score;
  s.grade = result.grade;
  s.lootPoints = result.lootPoints;
  s.ghostBonus = result.ghostBonus;
  s.closeCallBonus = result.closeCallBonus;
}

function loseGame(s, reason) {
  s.screen = SCREEN_LOSE;
  s.loseReason = reason;
  s.winTime = s.time;
}

export function startGame(s, planning) {
  const fresh = newWorld(s.seed);
  Object.keys(fresh).forEach((k) => { s[k] = fresh[k]; });
  s.screen = SCREEN_PLAY;
  // Pre-heist planning (optional): a free gadget + an entry point.
  // Called with no argument it behaves exactly as before.
  if (planning) {
    const gadget = ['emp', 'decoy', 'flash', 'lockpick'].includes(planning.gadget) ? planning.gadget : null;
    const entry = ['door', 'vent', 'upper'].includes(planning.entry) ? planning.entry : null;
    s.planning = { gadget, entry };
    // Rev12 — the planning gadget is +1 inventory stock (the free
    // gadget), on top of the starting kit.
    if (gadget) s.inventory[gadget] += 1;
    if (entry === 'vent') {
      s.player.x = 700;
      s.player.y = 168 - PLAYER.height;
      s.player.onGround = true;
    } else if (entry === 'upper') {
      s.player.x = 100;
      s.player.y = 440 - PLAYER.height;
      s.player.onGround = true;
    }
    // 'door' (or null) keeps the normal spawn: x=56, ground floor.
  }
}

export function update(s, input, dt) {
  if (s.screen !== SCREEN_PLAY) return;
  s.time += dt;
  s.stepCount += 1;

  // Alarm creeps with time, always.
  s.alarm = Math.min(100, s.alarm + ALARM.creepPerSecond * dt);
  if (s.alarm >= 100) {
    if (s.staged) {
      // Staged scenes cap the alarm so the scene can finish its frame.
      s.alarm = 99;
    } else {
      loseGame(s, 'alarm');
      return;
    }
  }

  // Dynamic environment (dimming schedule + flicker), then the live
  // alarm tier and the escape state it drives.
  updateEnv(s);
  updateShadow(s);
  // Rev12 — heat is the run's peak alarm: it only ever rises, even
  // when the alarm itself drops (hack relief, chase ending).
  s.heatPeak = Math.max(s.heatPeak, s.alarm);
  s.alarmTier = s.alarm < ALARM_TIERS.tier1At ? 0 : s.alarm < ALARM_TIERS.tier2At ? 1 : 2;
  s.escape.doorLocked = s.alarmTier === 2 && !s.escape.unlockedByLockpick;
  s.escape.route = s.escape.doorLocked ? 'roof' : 'door';

  const p = s.player;
  const prevBottom = p.y + p.height;
  const wasAirborne = !p.onGround;

  if (s.minigame && s.minigame.active) {
    // Hacking: the thief stands frozen at the terminal, guards keep
    // moving. E stops the needle; movement input is ignored.
    updateMinigame(s, input, dt);
    p.vx = 0;
  } else {
    // --- Player movement (platformer, one-way platforms). ---
    // Stepping out of a wardrobe: any movement input leaves hiding.
    if (p.hidden && (input.left || input.right || input.jump)) p.hidden = false;
    const speed = p.crouch ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
    p.vx = 0;
    if (input.left) { p.vx = -speed; p.facing = -1; }
    if (input.right) { p.vx = speed; p.facing = 1; }
    p.crouch = Boolean(input.crouch);
    // Keep the player's BOTTOM fixed when the height changes: without
    // this, crouching floats the body 22px and it falls back down —
    // which the landing-noise rule would (wrongly) hear as a loud step.
    const newHeight = p.crouch ? PLAYER.crouchHeight : PLAYER.height;
    if (newHeight !== p.height) {
      p.y += p.height - newHeight;
      p.height = newHeight;
    }
    if (input.jump && p.onGround) {
      p.vy = -PLAYER.jumpSpeed;
      p.onGround = false;
      // Jumping is loud: noise radius 90.
      emitNoise(s, p.x + p.width / 2, prevBottom, 90, 0.6);
    }
    p.vy += PLAYER.gravity * dt;
    if (p.vy > 900) p.vy = 900;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < 8) p.x = 8;
    if (p.x > FIELD.width - p.width - 8) p.x = FIELD.width - p.width - 8;
    if (p.y > 620 - p.height) { p.y = 620 - p.height; p.vy = 0; p.onGround = true; }
    collidePlatforms(s, prevBottom);
    collideCover(s);
    // Vent duct: low ceiling, the thief crawls.
    p.inVent = p.y + p.height <= 200 && p.x > 680;

    // Landing is loud too: noise radius 90.
    if (wasAirborne && p.onGround) {
      emitNoise(s, p.x + p.width / 2, p.y + p.height, 90, 0.6);
    }
    // Running at full speed is loud — a noise every step. Crouching
    // is silent, and a hidden thief makes no noise at all.
    if (p.onGround && !p.crouch && !p.hidden && p.vx !== 0) {
      s.noiseCooldown -= dt;
      if (s.noiseCooldown <= 0) {
        emitNoise(s, p.x + p.width / 2, p.y + p.height, 120, 0.7);
        s.noiseCooldown = 0.45;
      }
    }
  }

  // --- Coins on the floor, upper floor and in the vent. ---
  COINS.forEach((coin, i) => {
    if (s.coinTaken[i]) return;
    if (Math.abs(p.x + p.width / 2 - coin.x) < 30 && Math.abs(p.y + p.height / 2 - coin.y) < 34) {
      s.coinTaken[i] = true;
      s.coins += LOOT.coinValue;
      addFloater(s, coin.x, coin.y - 18, '+1 COIN', '#ffd97a');
      burst(s, coin.x, coin.y, '#ffd97a', 8);
    }
  });

  // --- Interactions. ---
  if (s.minigame && s.minigame.active) {
    s.prompt = 'E — STOP THE NEEDLE IN THE GREEN ZONE';
    s.promptAnchor = { x: TERMINAL.x + 28, y: TERMINAL.y };
  } else {
    if (input.interactPressed) doInteract(s);
    const target = nearInteractable(s);
    s.prompt = target ? target.label : '';
    s.promptAnchor = target ? target.anchor : null;
  }

  // --- Tools. ---
  if (input.useEmp) useTool(s, 'emp');
  if (input.useDecoy) useTool(s, 'decoy');
  if (input.useFlash) useTool(s, 'flash');
  if (input.useLockpick) useTool(s, 'lockpick');

  // --- Timers. ---
  if (s.blackoutT > 0) s.blackoutT -= dt;
  if (s.flashT > 0) s.flashT -= dt;
  if (s.gridOffT > 0) s.gridOffT -= dt;
  if (s.gridCooldownT > 0) s.gridCooldownT -= dt;
  if (s.escape.warnT > 0) s.escape.warnT -= dt;
  if (s.noise) {
    s.noise.t -= dt;
    if (s.noise.t <= 0) s.noise = null;
  }
  if (s.disguise.active) {
    s.disguise.t -= dt;
    if (s.disguise.t <= 0) { s.disguise.active = false; s.disguise.t = 0; }
  }
  if (s.decoy) {
    s.decoy.t -= dt;
    if (s.decoy.t <= 0) {
      s.decoy = null;
      for (const g of s.guards) if (g.state === 'investigate' && g.invKind === 'decoy') { g.state = 'return'; g.invArrived = false; setBark(g, 'Nothing there. False alarm.'); }
    }
  }

  updateCamera(s, dt);
  updateGrid(s);
  for (const g of s.guards) updateGuard(s, g, dt);
  if (s.screen !== SCREEN_PLAY) return;

  // --- Bodies: a guard who sees one raises the alarm (+20% once per
  // body) and investigates it; reaching it is +15% and alerts everyone.
  for (const body of s.bodies) {
    if (body.hidden || body.reported) continue;
    for (const g of s.guards) {
      if (g.state === 'down' || g.state === 'chase') continue;
      if (insideCone(g, body.x, body.y - 24)) {
        body.reported = true;
        s.alarm = Math.min(100, s.alarm + ALARM.bodySpotted);
        g.state = 'investigate';
        g.invX = body.x;
        g.invKind = 'body';
        g.invBody = body;
        g.invArrived = false;
        g.cutoff = false;
        setBark(g, 'A body! Someone is here!');
        addFloater(s, body.x, body.y - 60, 'BODY SPOTTED  +20%', '#ff2e3e');
        break;
      }
    }
  }

  updateMission(s);
  updateHeistRank(s);

  // The alarm may have moved this frame (camera lock-on, body found):
  // refresh the tier + escape state so the win check below is current.
  s.heatPeak = Math.max(s.heatPeak, s.alarm);
  s.alarmTier = s.alarm < ALARM_TIERS.tier1At ? 0 : s.alarm < ALARM_TIERS.tier2At ? 1 : 2;
  s.escape.doorLocked = s.alarmTier === 2 && !s.escape.unlockedByLockpick;
  s.escape.route = s.escape.doorLocked ? 'roof' : 'door';

  // --- Escape: Kancil in hand + reach the service door (unlocked) or
  // the roof end of the vent duct (x >= 1180, y <= 200). ---
  if (s.loot.kancil) {
    if (!s.escape.doorLocked && p.x + p.width > SERVICE_DOOR.x + 6 && p.y + p.height > 500) {
      winGame(s);
      return;
    }
    if (s.escape.doorLocked && p.x + p.width > SERVICE_DOOR.x + 6 && p.y + p.height > 500 && s.escape.warnT <= 0) {
      addFloater(s, SERVICE_DOOR.x + 32, 470, 'DOOR LOCKED — ESCAPE VIA THE ROOF!', '#ff2e3e');
      s.escape.warnT = 3;
    }
    if (p.x >= 1180 && p.y + p.height <= 200) {
      winGame(s);
      return;
    }
  }

  // --- Particles and floaters. ---
  for (const pt of s.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += 300 * dt;
    pt.life -= dt;
  }
  s.particles = s.particles.filter((pt) => pt.life > 0);
  for (const f of s.floaters) {
    f.y -= 26 * dt;
    f.life -= dt;
  }
  s.floaters = s.floaters.filter((f) => f.life > 0);
}

/** The live detection word the HUD shows: computed from guard state. */
export function detectionWord(s) {
  if (s.guards.some((g) => g.state === 'chase')) return 'SEEN — RUN!';
  if (s.guards.some((g) => g.state !== 'down' && (g.suspicion > 45 || g.state === 'suspect' || g.state === 'investigate'))) return 'SPOTTED';
  return 'HIDDEN';
}

/** One-line objective, from the live mission phase. */
export function objectiveLine(s) {
  const phase = s.mission ? s.mission.phase : 0;
  if (phase === 3) {
    return s.escape.route === 'roof'
      ? 'ESCAPE — climb the VENT to the ROOF →'
      : 'ESCAPE — reach the SERVICE DOOR →';
  }
  if (phase === 2) return 'ESCAPE — reach the SERVICE DOOR →';
  if (phase === 1) return 'Camera down — steal the KANCIL EMAS';
  return 'Hack the TERMINAL, then steal the KANCIL EMAS';
}
