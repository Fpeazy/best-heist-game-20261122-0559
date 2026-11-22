// VELVET VAULT — the simulation. One gallery hall, side view.
// The thief crosses the room, reads two guard cones and one red camera
// laser, works the security terminal, steals the Kancil Emas and leaves
// through the service door. Every number the HUD shows comes from here:
// alarm, coins, timer, score and grade are all computed from live state.
import {
  ALARM, CAMERA, COINS, COVER, FIELD, GUARD, LOOT, PLATFORMS, PLAYER,
  SCORE, SERVICE_DOOR, TERMINAL, TOOLS, VITRINES,
} from './config.js';
import { mulberry32 } from './random.js';
import { insideCone } from './vision.js';

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
    },
    guards: [
      {
        id: 0, x: 560, y: 620 - GUARD.height, width: GUARD.width, height: GUARD.height,
        facing: 1, state: 'patrol', suspicion: 0, pauseT: 0, wp: 0,
        coneRange: GUARD.coneRange, coneHalfAngle: GUARD.coneHalfAngle,
        waypoints: [{ x: 520 }, { x: 740 }],
        lastSeenX: 0, lastSeenY: 0, loseT: 0, searchT: 0,
        bark: 'All quiet on the night shift.', barkT: 4,
      },
      {
        id: 1, x: 280, y: 440 - GUARD.height, width: GUARD.width, height: GUARD.height,
        facing: 1, state: 'patrol', suspicion: 0, pauseT: 0, wp: 0,
        coneRange: GUARD.coneRange, coneHalfAngle: GUARD.coneHalfAngle,
        waypoints: [{ x: 260 }, { x: 380 }],
        levelY: 440,
        lastSeenX: 0, lastSeenY: 0, loseT: 0, searchT: 0,
        bark: 'Mind the velvet rope, sir.', barkT: 4,
      },
    ],
    camera: { angle: 1.7, dir: 1, offT: 0, lockOnT: 0, hitCooldownT: 0 },
    gridOffT: 0,
    gridCooldownT: 0,
    terminalHacked: false,
    hackProgress: 0,
    glass: { left: 'shut', centre: 'shut', right: 'shut' },
    loot: { idol: false, tiara: false, kancil: false },
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

/** Solid cover blocks the thief sideways (plinths, statues). */
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
  const p = s.player;
  const centre = playerCentre(s);
  const blinded = s.flashT > 0;
  const eye = guardEye(g);
  const dist = Math.hypot(centre.x - eye.x, centre.y - eye.y);

  // --- Seeing: only while the thief is inside this guard's cone. ---
  let sees = false;
  if (!blinded && s.screen === SCREEN_PLAY) {
    sees = insideCone(g, centre.x, centre.y);
    // A crouched thief behind a low plinth is harder to spot up close.
    if (sees && p.crouch && dist < 90) sees = s.rng() < 0.4;
  }
  // A guard who sees something turns to face it: otherwise a guard that
  // walks up to the thief's last-seen spot can end up facing away from
  // the thief standing right beside them, and never chase.
  if (sees) g.facing = centre.x >= eye.x ? 1 : -1;
  if (sees) {
    const closeness = 1.6 - Math.min(1, dist / g.coneRange);
    g.suspicion = Math.min(100, g.suspicion + GUARD.suspicionRate * closeness * dt);
    g.lastSeenX = centre.x;
    g.lastSeenY = centre.y;
    g.loseT = 0;
    if (g.suspicion >= 100 && g.state !== 'chase') {
      g.state = 'chase';
      s.alarm = Math.min(100, s.alarm + ALARM.chaseTrigger);
      s.detections += 1;
      setBark(g, 'INTRUDER! Stop right there!');
      burst(s, eye.x, eye.y, '#ffb020', 12);
      // Alert propagation: the other guard hears the shout and goes on
      // alert too — suspect, not a full chase (they have not seen the
      // thief themselves), converging on the last-seen spot.
      for (const other of s.guards) {
        if (other === g) continue;
        if (other.state === 'patrol' || other.state === 'suspect') {
          other.state = 'suspect';
          other.suspicion = Math.max(other.suspicion, 60);
          other.lastSeenX = g.lastSeenX;
          other.lastSeenY = g.lastSeenY;
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
      g.state = 'patrol';
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

  // --- Moving, by state. ---
  const groundY = g.levelY !== undefined ? g.levelY : 620;
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
      if (moveTo(target.x, GUARD.patrolSpeed)) {
        g.wp = (g.wp + 1) % g.waypoints.length;
        g.pauseT = 1.4;
      }
    }
    if (s.decoy) {
      g.state = 'investigate';
      setBark(g, 'Did you hear that clatter?');
    }
  } else if (g.state === 'suspect') {
    moveTo(g.lastSeenX, GUARD.patrolSpeed * 1.4);
  } else if (g.state === 'chase') {
    const caught = Math.abs(centre.x - (g.x + g.width / 2)) < 26
      && Math.abs(centre.y - (g.y + g.height / 2)) < 46;
    if (caught && s.screen === SCREEN_PLAY && !s.staged) {
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
  } else if (g.state === 'investigate' && s.decoy) {
    if (moveTo(s.decoy.x, GUARD.patrolSpeed * 1.6)) {
      g.state = 'patrol';
      g.pauseT = 1.2;
    }
  } else if (g.state === 'search') {
    g.searchT -= dt;
    moveTo(g.lastSeenX, GUARD.patrolSpeed * 1.3);
    if (g.searchT <= 0) {
      g.state = 'return';
      setBark(g, 'Nothing here. Back to the rounds.');
    }
  } else if (g.state === 'return') {
    const home = g.waypoints[0];
    if (moveTo(home.x, GUARD.patrolSpeed)) {
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
    return;
  }
  cam.angle += cam.dir * CAMERA.sweepSpeed * dt;
  if (cam.angle > CAMERA.maxAngle) { cam.angle = CAMERA.maxAngle; cam.dir = -1; }
  if (cam.angle < CAMERA.minAngle) { cam.angle = CAMERA.minAngle; cam.dir = 1; }
  if (cam.hitCooldownT > 0) cam.hitCooldownT -= dt;
  if (cam.lockOnT > 0) cam.lockOnT -= dt;

  // The beam is a thin line: does it cross the thief?
  const centre = playerCentre(s);
  const bx = CAMERA.x + Math.cos(cam.angle) * CAMERA.beamLength;
  const by = CAMERA.y + Math.sin(cam.angle) * CAMERA.beamLength;
  const d = distToSegment(centre.x, centre.y, CAMERA.x, CAMERA.y, bx, by);
  const along = ((centre.x - CAMERA.x) * Math.cos(cam.angle) + (centre.y - CAMERA.y) * Math.sin(cam.angle));
  if (d < CAMERA.beamWidth / 2 + 14 && along > 0 && along < CAMERA.beamLength && cam.hitCooldownT <= 0) {
    cam.hitCooldownT = CAMERA.hitCooldown;
    cam.lockOnT = 1.2;
    s.alarm = Math.min(100, s.alarm + CAMERA.alarmHit);
    s.detections += 1;
    addFloater(s, centre.x, centre.y - 46, 'CAMERA LOCK-ON  +25%', '#ff2e3e');
    burst(s, centre.x, centre.y, '#ff2e3e', 10);
  }
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
  // terminal's wider radius must not swallow a loot grab.
  if (!s.loot.kancil && near(VITRINES.centre.x + 60, VITRINES.centre.y + 60, 96)) {
    return s.terminalHacked
      ? { kind: 'kancil', label: 'E — TAKE THE KANCIL EMAS' }
      : { kind: 'kancil', label: 'E — SMASH THE GLASS (+40% ALARM)' };
  }
  if (!s.loot.idol && near(VITRINES.left.x + 35, VITRINES.left.y + 50, 80)) return { kind: 'idol', label: 'E — TAKE THE JADE IDOL (+3 coins)' };
  if (!s.loot.tiara && near(VITRINES.right.x + 35, VITRINES.right.y + 50, 80)) return { kind: 'tiara', label: 'E — TAKE THE PEARL TIARA (+3 coins)' };
  if (!s.terminalHacked && near(TERMINAL.x + 28, TERMINAL.y + 40, 72)) return { kind: 'terminal', label: 'E — HACK SECURITY TERMINAL (hold)' };
  return null;
}

function doInteract(s) {
  const target = nearInteractable(s);
  if (!target) return;
  if (target.kind === 'terminal') {
    // Hacking is a hold: progress accumulates while E is held (see update).
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
  }
}

function useTool(s, tool) {
  const p = s.player;
  if (tool === 'emp' && s.coins >= TOOLS.emp.cost) {
    s.coins -= TOOLS.emp.cost;
    s.camera.offT = CAMERA.empOffSeconds;
    s.gridOffT = CAMERA.empOffSeconds;
    s.blackoutT = 3;
    addFloater(s, p.x + 20, p.y - 20, 'EMP! THE BLACKOUT', '#2ec4b6');
    return true;
  }
  if (tool === 'decoy' && s.coins >= TOOLS.decoy.cost) {
    s.coins -= TOOLS.decoy.cost;
    s.decoy = { x: Math.max(40, Math.min(FIELD.width - 40, p.x + p.facing * 150)), y: 620, t: 4 };
    addFloater(s, s.decoy.x, 580, 'DECOY — CLATTER!', '#ffd97a');
    return true;
  }
  if (tool === 'flash' && s.coins >= TOOLS.flash.cost) {
    s.coins -= TOOLS.flash.cost;
    s.flashT = 3;
    for (const g of s.guards) g.suspicion = Math.max(0, g.suspicion - 60);
    addFloater(s, p.x + 20, p.y - 20, 'FLASHBANG!', '#ffffff');
    burst(s, p.x + 20, p.y + 20, '#ffffff', 16);
    return true;
  }
  return false;
}

function computeScore(s) {
  const lootPoints = s.coins
    + (s.loot.idol ? 0 : 0) // coins already include idol/tiara values
    + (s.loot.kancil ? LOOT.kancilValue : 0);
  // NOTE: coins counter already counts idol (+3) and tiara (+3) values,
  // so lootPoints = coins + kancil value only.
  const timeBonus = Math.round(Math.max(0, SCORE.timeBonusCapSeconds - s.winTime) * SCORE.timeBonusPerSecond);
  const undetected = s.alarm < SCORE.undetectedAlarmMax ? SCORE.undetectedBonus : 0;
  const score = Math.round(SCORE.base + lootPoints * SCORE.perCoin + timeBonus + undetected);
  // Grade S is the ghost grade: it needs the score AND zero detections.
  // A run that was spotted (a chase or a camera lock-on) caps at A, so
  // the win screen can never print "GRADE S" above "TIMES SPOTTED 1".
  let grade = score >= SCORE.gradeS ? 'S' : score >= SCORE.gradeA ? 'A' : score >= SCORE.gradeB ? 'B' : 'C';
  if (grade === 'S' && s.detections > 0) grade = 'A';
  return { score, grade, lootPoints, timeBonus, undetected };
}

function winGame(s) {
  s.screen = SCREEN_WIN;
  s.winTime = s.time;
  const result = computeScore(s);
  s.score = result.score;
  s.grade = result.grade;
  s.lootPoints = result.lootPoints;
}

function loseGame(s, reason) {
  s.screen = SCREEN_LOSE;
  s.loseReason = reason;
  s.winTime = s.time;
}

export function startGame(s) {
  const fresh = newWorld(s.seed);
  Object.keys(fresh).forEach((k) => { s[k] = fresh[k]; });
  s.screen = SCREEN_PLAY;
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

  const p = s.player;
  const prevBottom = p.y + p.height;

  // --- Player movement (platformer, one-way platforms). ---
  const speed = p.crouch ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
  p.vx = 0;
  if (input.left) { p.vx = -speed; p.facing = -1; }
  if (input.right) { p.vx = speed; p.facing = 1; }
  p.crouch = Boolean(input.crouch);
  p.height = p.crouch ? PLAYER.crouchHeight : PLAYER.height;
  if (input.jump && p.onGround) {
    p.vy = -PLAYER.jumpSpeed;
    p.onGround = false;
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

  // --- Coins on the floor, balcony and in the vent. ---
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
  if (input.interactPressed) doInteract(s);
  const target = nearInteractable(s);
  if (target && target.kind === 'terminal' && input.interact) {
    s.hackProgress += dt;
    if (s.hackProgress >= 2) {
      s.terminalHacked = true;
      s.alarm = Math.max(0, s.alarm - ALARM.hackRelief);
      s.camera.offT = CAMERA.hackOffSeconds;
      s.gridOffT = CAMERA.hackOffSeconds;
      addFloater(s, TERMINAL.x + 28, 500, 'TERMINAL HACKED  −20%', '#2ec4b6');
      burst(s, TERMINAL.x + 28, 560, '#2ec4b6', 16);
    }
  } else if (!input.interact) {
    s.hackProgress = Math.max(0, s.hackProgress - dt * 2);
  }
  s.prompt = target ? target.label : '';

  // --- Tools. ---
  if (input.useEmp) useTool(s, 'emp');
  if (input.useDecoy) useTool(s, 'decoy');
  if (input.useFlash) useTool(s, 'flash');

  // --- Timers. ---
  if (s.blackoutT > 0) s.blackoutT -= dt;
  if (s.flashT > 0) s.flashT -= dt;
  if (s.gridOffT > 0) s.gridOffT -= dt;
  if (s.gridCooldownT > 0) s.gridCooldownT -= dt;
  if (s.decoy) {
    s.decoy.t -= dt;
    if (s.decoy.t <= 0) {
      s.decoy = null;
      for (const g of s.guards) if (g.state === 'investigate') { g.state = 'return'; setBark(g, 'Nothing there. False alarm.'); }
    }
  }

  updateCamera(s, dt);
  updateGrid(s);
  for (const g of s.guards) updateGuard(s, g, dt);
  if (s.screen !== SCREEN_PLAY) return;

  // --- Escape: Kancil in hand + reach the service door. ---
  if (s.loot.kancil && p.x + p.width > SERVICE_DOOR.x + 6 && p.y + p.height > 500) {
    winGame(s);
    return;
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
  if (s.guards.some((g) => g.suspicion > 45 || g.state === 'suspect' || g.state === 'investigate')) return 'SPOTTED';
  return 'HIDDEN';
}

/** One-line objective, from live state. */
export function objectiveLine(s) {
  if (s.loot.kancil) return 'ESCAPE — reach the SERVICE DOOR →';
  if (s.terminalHacked) return 'Camera down — steal the KANCIL EMAS';
  return 'Hack the TERMINAL, then steal the KANCIL EMAS';
}
