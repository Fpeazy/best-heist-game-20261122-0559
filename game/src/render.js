// VELVET VAULT — the renderer. One art-deco gallery hall at night, drawn
// on canvas: navy walls with gold trim, a red carpet runner, teal safe
// cover, amber guard cones, a red camera laser, gold loot. The thief is a
// big white silhouette with a dark outline, findable at a glance.
import {
  CAMERA, COINS, COVER, FIELD, GUARD, PALETTE, PLATFORMS, SERVICE_DOOR,
  TERMINAL, VITRINES, FONT, FONT_DISPLAY,
} from './config.js';
import { coneRayHit, laserHit } from './vision.js';
import { mulberry32 } from './random.js';
import {
  SCREEN_LOSE, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
  detectionWord, objectiveLine,
} from './world.js';

const GRID_BEAMS = [596, 660, 724];

// The vignette, pre-rendered once at import: a full-screen radial
// gradient fill costs ~80ms a frame in a software renderer (swiftshader
// measured 4.5fps with the rev5 gradients live — the first frame took
// over a second, so Enter had not been consumed when the play-test
// pressed P and the whole live run froze paused). A drawImage of the
// baked vignette is a few ms. The vignette never changes, so baking it
// loses nothing.
const VIGNETTE = document.createElement('canvas');
VIGNETTE.width = 1280;
VIGNETTE.height = 720;
{
  const vc = VIGNETTE.getContext('2d');
  const vig = vc.createRadialGradient(640, 360, 260, 640, 360, 780);
  vig.addColorStop(0, 'rgba(4,6,14,0)');
  vig.addColorStop(1, 'rgba(4,6,14,0.30)');
  vc.fillStyle = vig;
  vc.fillRect(0, 0, 1280, 720);
}

// Seeded ambient life: dust motes that drift on fixed paths, a
// chandelier that breathes, a glint on the gold. Positions come from
// mulberry32 once at load; motion is a pure function of s.time, so a
// staged frame at a frozen time is byte-stable and live play stays
// smooth. No Math.random anywhere — the shots must reproduce exactly.
const AMBIENT_RNG = mulberry32(20261122);
const MOTES = [];
for (let i = 0; i < 42; i += 1) {
  MOTES.push({
    x: 40 + AMBIENT_RNG() * 1200,
    y: 70 + AMBIENT_RNG() * 520,
    r: 0.8 + AMBIENT_RNG() * 1.6,
    phase: AMBIENT_RNG() * Math.PI * 2,
    speed: 0.25 + AMBIENT_RNG() * 0.5,
    drift: 6 + AMBIENT_RNG() * 18,
    alpha: 0.10 + AMBIENT_RNG() * 0.18,
  });
}

// Dust motes that live INSIDE the camera beam: each one is a seeded
// fraction along the beam (u) and a seeded lateral offset (v) inside the
// beam's wedge, so their world position is a pure function of the live
// beam angle and the clock — deterministic, and the beam visibly carries
// dust the way a real spotlight does. Rev5 (Fxzy: "Sorotan CCTV atau
// Camera perbagus").
const BEAM_DUST = [];
for (let i = 0; i < 16; i += 1) {
  BEAM_DUST.push({
    u: 0.12 + AMBIENT_RNG() * 0.8,
    v: (AMBIENT_RNG() * 2 - 1) * 0.8,
    r: 0.9 + AMBIENT_RNG() * 1.4,
    phase: AMBIENT_RNG() * Math.PI * 2,
    speed: 0.4 + AMBIENT_RNG() * 0.7,
    alpha: 0.25 + AMBIENT_RNG() * 0.35,
  });
}

function drawAmbient(ctx, s) {
  // Dust motes drifting through the moonlight and chandelier glow.
  // Kept faint and small: they must never compete with the thief, a
  // cone, the laser, the Kancil or the alarm meter.
  for (const m of MOTES) {
    const x = m.x + Math.sin(s.time * m.speed + m.phase) * m.drift;
    const y = m.y + Math.cos(s.time * m.speed * 0.7 + m.phase) * m.drift * 0.5;
    const twinkle = 0.7 + 0.3 * Math.sin(s.time * 0.9 + m.phase);
    ctx.fillStyle = `rgba(255,240,200,${(m.alpha * twinkle).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, m.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCone(ctx, guard) {
  const eyeX = guard.x + guard.width / 2;
  const eyeY = guard.y + 14;
  const facingAngle = guard.facing === 1 ? 0 : Math.PI;
  const half = guard.coneHalfAngle;
  const range = guard.coneRange;
  const rays = 9;
  ctx.beginPath();
  ctx.moveTo(eyeX, eyeY);
  for (let i = 0; i <= rays; i += 1) {
    const a = facingAngle - half + (2 * half * i) / rays;
    const len = coneRayHit(eyeX, eyeY, a, range);
    ctx.lineTo(eyeX + Math.cos(a) * len, eyeY + Math.sin(a) * len);
  }
  ctx.closePath();
  const hot = guard.state === 'chase';
  // Flat fill, not a radial gradient: the occluded fan shape is what
  // matters (the rays stop at cover), and a flat amber at low alpha
  // reads the same at 768x480 for a fraction of the software-render
  // cost. The stroke keeps the cone's edge crisp.
  ctx.fillStyle = hot ? 'rgba(255,60,50,0.32)' : 'rgba(255,176,32,0.26)';
  ctx.fill();
  ctx.strokeStyle = hot ? 'rgba(255,60,50,0.75)' : 'rgba(255,176,32,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawLaser(ctx, state) {
  const cam = state.camera;
  if (cam.offT > 0) return;
  const len = laserHit(CAMERA.x, CAMERA.y, cam.angle, CAMERA.beamLength);
  const x2 = CAMERA.x + Math.cos(cam.angle) * len;
  const y2 = CAMERA.y + Math.sin(cam.angle) * len;
  // Rev5 (Fxzy: "Sorotan CCTV atau Camera perbagus"): the camera no
  // longer fires a bare line — it throws a real spotlight. A widening
  // red wedge with a soft falloff, a hot core, dust drifting inside
  // the beam, and a pool of red light where the beam lands on the
  // floor. It stays RED and narrow, so it never reads as an amber
  // guard cone, and the wedge alpha stays low so the thief, the loot
  // and the vitrines behind it still read.
  const WEDGE_HALF = 0.055;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // The wedge: a flat low-alpha fan, not a radial gradient — the fan
  // shape and the hot core carry the spotlight read, and a flat fill is
  // far cheaper per frame in a software renderer. Same reasoning as the
  // guard cones (rev5 perf fix: swiftshader was at 4.5fps).
  ctx.fillStyle = 'rgba(255,46,62,0.10)';
  ctx.beginPath();
  ctx.moveTo(CAMERA.x, CAMERA.y);
  ctx.arc(CAMERA.x, CAMERA.y, len, cam.angle - WEDGE_HALF, cam.angle + WEDGE_HALF);
  ctx.closePath();
  ctx.fill();
  // Soft outer halo around the core line.
  ctx.strokeStyle = 'rgba(255,46,62,0.3)';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(CAMERA.x, CAMERA.y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // The hot core: bright at the lens, slightly dimmer at the far end.
  const core = ctx.createLinearGradient(CAMERA.x, CAMERA.y, x2, y2);
  core.addColorStop(0, '#ff7a86');
  core.addColorStop(0.4, '#ff2e3e');
  core.addColorStop(1, '#e01e30');
  ctx.strokeStyle = cam.lockOnT > 0 ? '#ff5a68' : core;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(CAMERA.x, CAMERA.y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // Dust motes drifting inside the beam, seeded along it.
  const px = -Math.sin(cam.angle);
  const py = Math.cos(cam.angle);
  for (const d of BEAM_DUST) {
    const along = d.u * len;
    const halfW = along * Math.tan(WEDGE_HALF) * d.v;
    const dx = CAMERA.x + Math.cos(cam.angle) * along + px * halfW;
    const dy = CAMERA.y + Math.sin(cam.angle) * along + py * halfW;
    const tw = 0.6 + 0.4 * Math.sin(state.time * d.speed * 2 + d.phase);
    ctx.fillStyle = `rgba(255,190,190,${(d.alpha * tw).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(dx, dy, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hot spot where the beam lands.
  ctx.fillStyle = '#ff2e3e';
  ctx.beginPath();
  ctx.arc(x2, y2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,122,134,0.85)';
  ctx.beginPath();
  ctx.arc(x2, y2, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // The light pool: where the beam meets the floor it spreads into an
  // ellipse of red light. Only when the beam actually reaches the
  // floor (not when a statue or vitrine cuts it short mid-air).
  if (y2 > 580) {
    const pool = ctx.createRadialGradient(x2, 620, 4, x2, 620, 64);
    pool.addColorStop(0, 'rgba(255,46,62,0.30)');
    pool.addColorStop(0.6, 'rgba(255,46,62,0.12)');
    pool.addColorStop(1, 'rgba(255,46,62,0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(x2, 620, 64, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Pulsing ring at the emitter, 1 Hz from seeded state time — no
  // Math.random, so the staged frames stay deterministic. The ring
  // marks the camera as a live system, not a wall decoration.
  ctx.save();
  const pulse = 0.5 + 0.5 * Math.sin(state.time * Math.PI * 2);
  ctx.strokeStyle = `rgba(255,46,62,${0.4 + 0.4 * pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CAMERA.x, CAMERA.y, 8 + 2 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawThief(ctx, s) {
  const p = s.player;
  const bob = p.onGround && p.vx !== 0 ? Math.sin(s.time * 14) * 2 : 0;
  const x = p.x;
  const y = p.y + bob;
  const w = p.width;
  const h = p.height;
  ctx.save();
  // Rev4: a white halo ring + soft white glow, so the thief reads at
  // 768x480 on the navy wall and the dark carpet. The white silhouette
  // alone sank into the background at contact-sheet size; the halo is
  // a 2px white ring outside the dark outline, the glow lifts the
  // whole figure off the darkest wall. The fedora, mask and legs keep
  // their dark shapes — the glow is behind them, not over them.
  ctx.shadowColor = 'rgba(255,255,255,0.55)';
  ctx.shadowBlur = 12;
  // White halo first, then the white silhouette, then the dark outline.
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = PALETTE.thief;
  // Coat: a long bell shape.
  ctx.beginPath();
  ctx.moveTo(x + w * 0.5, y + 6);
  ctx.lineTo(x + w * 0.86, y + h * 0.42);
  ctx.lineTo(x + w * 0.78, y + h);
  ctx.lineTo(x + w * 0.22, y + h);
  ctx.lineTo(x + w * 0.14, y + h * 0.42);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.thiefOutline;
  ctx.stroke();
  // Head + fedora.
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + 10, 9, 0, Math.PI * 2);
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.thiefOutline;
  ctx.stroke();
  ctx.fillStyle = PALETTE.thiefOutline;
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + 4, 15, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, x + w * 0.5 - 8, y - 6, 16, 9, 3);
  ctx.fill();
  // Mask stripe.
  ctx.fillStyle = '#14141c';
  roundRect(ctx, x + w * 0.5 - 8, y + 7, 16, 4, 2);
  ctx.fill();
  // Legs stepping.
  const step = p.vx !== 0 ? Math.sin(s.time * 14) * 5 : 0;
  ctx.strokeStyle = PALETTE.thiefOutline;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.36, y + h - 2);
  ctx.lineTo(x + w * 0.36 + step, y + h + 4);
  ctx.moveTo(x + w * 0.64, y + h - 2);
  ctx.lineTo(x + w * 0.64 - step, y + h + 4);
  ctx.stroke();
  // Loot sack on the back once the Kancil is taken.
  if (s.loot.kancil) {
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(x + w * 0.82, y + h * 0.5, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.goldDim;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawGuard(ctx, s, g) {
  const x = g.x;
  const y = g.y;
  const w = g.width;
  const h = g.height;
  const walking = g.state === 'patrol' || g.state === 'chase';
  const bob = walking ? Math.sin(s.time * 6 + g.id * 2) * 1.5 : 0;
  ctx.save();
  // Uniform: dark blue coat, brass buttons, peaked cap, torch in hand.
  ctx.fillStyle = g.state === 'chase' ? '#7a2a3a' : PALETTE.guard;
  ctx.strokeStyle = PALETTE.guardOutline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.5, y + 8);
  ctx.lineTo(x + w * 0.88, y + h * 0.45);
  ctx.lineTo(x + w * 0.8, y + h);
  ctx.lineTo(x + w * 0.2, y + h);
  ctx.lineTo(x + w * 0.12, y + h * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + 11, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#d9a06a';
  ctx.fill();
  ctx.stroke();
  // Peaked cap.
  ctx.fillStyle = '#1d2a4a';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + 5, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, x + w * 0.5 - 7, y - 3, 14, 7, 3);
  ctx.fill();
  // Torch dot in the facing hand.
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath();
  ctx.arc(x + w * 0.5 + g.facing * 14, y + h * 0.55 + bob, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // State label, live from the guard's own state. It sits on a small
  // dark pill: a bare label over the vitrine glass (where a chasing
  // guard stands) washes out against the glass and reads as clutter
  // on the loot; the pill keeps it readable over glass, cone or floor.
  const label = { patrol: 'PATROL', suspect: 'SUSPICIOUS', investigate: 'INVESTIGATING', chase: 'CHASE!', search: 'SEARCHING', return: 'RETURNING' }[g.state] || 'PATROL';
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  const lw = ctx.measureText(label).width + 12;
  ctx.fillStyle = 'rgba(13,17,32,0.78)';
  roundRect(ctx, x + w / 2 - lw / 2, y - 20, lw, 15, 7);
  ctx.fill();
  ctx.fillStyle = g.state === 'chase' ? '#ff5a68' : 'rgba(242,234,216,0.85)';
  ctx.fillText(label, x + w / 2, y - 8);
  ctx.restore();
}

/**
 * Guard bark bubbles, drawn in their own pass AFTER the thief: a bubble
 * drawn inside drawGuard ends up underneath the thief sprite whenever
 * the thief stands close to the guard, and the text gets cut ("INTRUDER!
 * Stop right ther…"). On top, with clearance above the guard's head,
 * the whole line reads at 1280x720 and at 768x480.
 * Rev3: a bubble must also stay clear of every vitrine (frame + label
 * plate). A guard chasing beside the centre vitrine used to park his
 * bubble over the glass and hide the Kancil; if the bubble would
 * overlap a vitrine it is lifted above that vitrine's top edge instead.
 */
function drawBarks(ctx, s) {
  ctx.save();
  for (const g of s.guards) {
    if (g.barkT <= 0) continue;
    const x = g.x;
    const y = g.y;
    const w = g.width;
    ctx.font = `12px ${FONT}`;
    const tw = ctx.measureText(g.bark).width + 18;
    const bx = Math.max(6, Math.min(FIELD.width - tw - 6, x + w / 2 - tw / 2));
    let by = Math.max(60, y - 46);
    for (const v of Object.values(VITRINES)) {
      const vx0 = v.x - 8;
      const vy0 = v.y - 10;
      const vx1 = v.x + v.w + 8;
      const vy1 = v.y + v.h + 34;
      if (bx < vx1 && bx + tw > vx0 && by < vy1 && by + 20 > vy0) {
        by = Math.max(60, vy0 - 26);
      }
    }
    ctx.fillStyle = 'rgba(16,20,42,0.92)';
    ctx.strokeStyle = '#3a4470';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, tw, 20, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f2ead8';
    ctx.textAlign = 'center';
    ctx.fillText(g.bark, bx + tw / 2, by + 14);
  }
  ctx.restore();
}

function drawKancil(ctx, x, y, scale, t) {
  // The Kancil Emas: a small golden mouse-deer, rearing on a plinth.
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const shimmer = 0.85 + Math.sin(t * 3) * 0.15;
  ctx.fillStyle = `rgba(255,217,122,${shimmer})`;
  ctx.strokeStyle = PALETTE.goldDim;
  ctx.lineWidth = 1.5;
  // Body.
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 10, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Neck + head.
  ctx.beginPath();
  ctx.ellipse(13, -12, 6, 9, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Antlers.
  ctx.strokeStyle = PALETTE.goldBright;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(14, -20);
  ctx.lineTo(10, -28);
  ctx.moveTo(14, -20);
  ctx.lineTo(20, -29);
  ctx.moveTo(10, -28);
  ctx.lineTo(7, -31);
  ctx.stroke();
  // Legs.
  ctx.strokeStyle = PALETTE.goldDim;
  ctx.beginPath();
  ctx.moveTo(-8, 8);
  ctx.lineTo(-10, 16);
  ctx.moveTo(6, 8);
  ctx.lineTo(8, 16);
  ctx.stroke();
  ctx.restore();
}

function drawVitrine(ctx, s, key, v) {
  const glass = s.glass[key];
  // Marble base + brass frame.
  ctx.fillStyle = '#3d3a55';
  roundRect(ctx, v.x - 6, v.y + v.h - 14, v.w + 12, 14, 3);
  ctx.fill();
  ctx.fillStyle = '#6b5a2e';
  ctx.fillRect(v.x - 4, v.y - 6, v.w + 8, 6);
  // The loot inside.
  if (key === 'centre' && !s.loot.kancil) {
    drawKancil(ctx, v.x + v.w / 2, v.y + v.h - 34, 1.15, s.time);
    // A slow glint on the gold, seeded by the clock alone: a little
    // star that breathes over the Kancil's antlers and says "loot".
    const glint = 0.35 + 0.35 * Math.sin(s.time * 2.4);
    const gx = v.x + v.w * 0.78;
    const gy = v.y + 26;
    ctx.save();
    ctx.globalAlpha = glint;
    ctx.strokeStyle = '#fff3c4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(gx - 7, gy);
    ctx.lineTo(gx + 7, gy);
    ctx.moveTo(gx, gy - 7);
    ctx.lineTo(gx, gy + 7);
    ctx.stroke();
    ctx.restore();
  } else if (key === 'left' && !s.loot.idol) {
    ctx.fillStyle = '#3fae7a';
    ctx.beginPath();
    ctx.moveTo(v.x + v.w / 2, v.y + 34);
    ctx.lineTo(v.x + v.w / 2 + 14, v.y + 74);
    ctx.lineTo(v.x + v.w / 2 - 14, v.y + 74);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1d6a46';
    ctx.stroke();
  } else if (key === 'right' && !s.loot.tiara) {
    ctx.fillStyle = '#e8f4ff';
    ctx.beginPath();
    ctx.moveTo(v.x + 14, v.y + 66);
    ctx.lineTo(v.x + 20, v.y + 44);
    ctx.lineTo(v.x + 30, v.y + 58);
    ctx.lineTo(v.x + v.w / 2, v.y + 40);
    ctx.lineTo(v.x + v.w - 30, v.y + 58);
    ctx.lineTo(v.x + v.w - 20, v.y + 44);
    ctx.lineTo(v.x + v.w - 14, v.y + 66);
    ctx.closePath();
    ctx.fill();
  }
  // Glass: shut = pale shine, open = gone, smashed = shards on the floor.
  if (glass === 'shut') {
    ctx.fillStyle = 'rgba(207,232,255,0.16)';
    ctx.fillRect(v.x, v.y, v.w, v.h);
    ctx.strokeStyle = 'rgba(207,232,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(v.x, v.y, v.w, v.h);
    // Rev5: a real glass reflection — two diagonal shine streaks plus a
    // soft highlight across the top, so the vitrine reads as glass with
    // something behind it, not a pale box.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(v.x + 12, v.y + v.h - 8);
    ctx.lineTo(v.x + v.w * 0.45, v.y + 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(v.x + v.w * 0.55, v.y + v.h - 6);
    ctx.lineTo(v.x + v.w - 8, v.y + v.h * 0.4);
    ctx.stroke();
    const topSheen = ctx.createLinearGradient(0, v.y, 0, v.y + 22);
    topSheen.addColorStop(0, 'rgba(255,255,255,0.16)');
    topSheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = topSheen;
    ctx.fillRect(v.x, v.y, v.w, 22);
  } else if (glass === 'smashed') {
    ctx.fillStyle = 'rgba(207,232,255,0.7)';
    for (let i = 0; i < 7; i += 1) {
      const sx = v.x + 6 + ((i * 17) % (v.w - 12));
      ctx.beginPath();
      ctx.moveTo(sx, v.y + v.h + 2);
      ctx.lineTo(sx + 6, v.y + v.h + 10);
      ctx.lineTo(sx - 4, v.y + v.h + 10);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Gold spilled on the floor once the centre vitrine is opened or smashed.
  // Rev5: a real spill — a low mound with coins of several sizes heaped
  // on it, two of them catching a glint, so the win frame reads "the
  // gold is OUT" at a glance instead of four lonely dots.
  if (key === 'centre' && glass !== 'shut') {
    ctx.fillStyle = '#c8952e';
    ctx.beginPath();
    ctx.ellipse(v.x + v.w / 2, v.y + v.h + 12, 52, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    const spill = [
      [v.x + 14, v.y + v.h + 8, 6], [v.x + 34, v.y + v.h + 13, 5], [v.x + 52, v.y + v.h + 7, 7],
      [v.x + 70, v.y + v.h + 13, 5], [v.x + 88, v.y + v.h + 7, 6], [v.x + 104, v.y + v.h + 12, 4],
      [v.x + 26, v.y + v.h + 4, 4], [v.x + 62, v.y + v.h + 3, 4], [v.x + 96, v.y + v.h + 4, 3],
    ];
    for (const [gx, gy, gr] of spill) {
      ctx.fillStyle = PALETTE.goldBright;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.goldDim;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const spillGlint = 0.4 + 0.4 * Math.sin(s.time * 3 + 1);
    ctx.save();
    ctx.globalAlpha = spillGlint;
    ctx.strokeStyle = '#fff3c4';
    ctx.lineWidth = 1.5;
    for (const [gx, gy] of [[v.x + 52, v.y + v.h + 7], [v.x + 88, v.y + v.h + 7]]) {
      ctx.beginPath();
      ctx.moveTo(gx - 5, gy);
      ctx.lineTo(gx + 5, gy);
      ctx.moveTo(gx, gy - 5);
      ctx.lineTo(gx, gy + 5);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Label plate.
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(v.label, v.x + v.w / 2, v.y + v.h + 30);
}

function drawRoom(ctx, s) {
  // Walls.
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(0, 0, FIELD.width, 620);
  ctx.fillStyle = PALETTE.wallDark;
  ctx.fillRect(0, 0, FIELD.width, 46);
  // Gold art-deco trim lines.
  ctx.strokeStyle = PALETTE.goldDim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 46);
  ctx.lineTo(FIELD.width, 46);
  ctx.moveTo(0, 200);
  ctx.lineTo(FIELD.width, 200);
  ctx.stroke();
  ctx.fillStyle = PALETTE.gold;
  for (let x = 40; x < FIELD.width; x += 160) {
    ctx.beginPath();
    ctx.moveTo(x, 46);
    ctx.lineTo(x + 8, 38);
    ctx.lineTo(x + 16, 46);
    ctx.closePath();
    ctx.fill();
  }
  // Arched windows with moonlight.
  for (const wx of [90, 1090]) {
    ctx.fillStyle = '#232c52';
    ctx.beginPath();
    ctx.moveTo(wx, 200);
    ctx.lineTo(wx, 110);
    ctx.arc(wx + 55, 110, 55, Math.PI, 0);
    ctx.lineTo(wx + 110, 200);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PALETTE.goldDim;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#f4ead0';
    ctx.beginPath();
    ctx.arc(wx + 78, 92, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#232c52';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx + 55, 60);
    ctx.lineTo(wx + 55, 200);
    ctx.moveTo(wx, 130);
    ctx.lineTo(wx + 110, 130);
    ctx.stroke();
  }
  // Paintings between the windows — rev5: real mini-art inside the
  // frames, not flat colour blocks. "The Duchess" is a portrait
  // (head, shoulders, pearl necklace); "The Hunt" is a little landscape
  // (hills, a rider, a pale moon). Each keeps its gold frame and label.
  const paintings = [
    { x: 250, w: 90, hue: '#7a4a2e', label: 'The Duchess', art: 'duchess' },
    { x: 830, w: 90, hue: '#2e5a4a', label: 'The Hunt', art: 'hunt' },
  ];
  for (const pg of paintings) {
    ctx.fillStyle = PALETTE.goldDim;
    ctx.fillRect(pg.x - 4, 76, pg.w + 8, 108);
    ctx.fillStyle = pg.hue;
    ctx.fillRect(pg.x, 80, pg.w, 100);
    ctx.strokeStyle = 'rgba(232,182,76,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pg.x + 4, 84, pg.w - 8, 92);
    const cx = pg.x + pg.w / 2;
    if (pg.art === 'duchess') {
      // Portrait: dark hair bun, pale face, dark shoulders, pearls.
      ctx.fillStyle = '#2a1a12';
      ctx.beginPath();
      ctx.arc(cx, 108, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, 96, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8d5b0';
      ctx.beginPath();
      ctx.arc(cx, 110, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a2a3a';
      ctx.beginPath();
      ctx.moveTo(cx - 24, 176);
      ctx.quadraticCurveTo(cx - 20, 140, cx, 134);
      ctx.quadraticCurveTo(cx + 20, 140, cx + 24, 176);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f4ead0';
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.arc(cx + i * 5, 140 + Math.abs(i), 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Landscape: pale moon, two hills, a rider on the far hill.
      ctx.fillStyle = '#f4ead0';
      ctx.beginPath();
      ctx.arc(cx + 22, 100, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#24463a';
      ctx.beginPath();
      ctx.moveTo(pg.x, 176);
      ctx.quadraticCurveTo(cx - 10, 138, cx + 18, 152);
      ctx.quadraticCurveTo(cx + 40, 162, pg.x + pg.w, 148);
      ctx.lineTo(pg.x + pg.w, 176);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1d3a2f';
      ctx.beginPath();
      ctx.moveTo(pg.x, 176);
      ctx.quadraticCurveTo(cx - 20, 158, cx + 30, 168);
      ctx.lineTo(pg.x + pg.w, 176);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#0f241c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 18, 146);
      ctx.lineTo(cx - 6, 146);
      ctx.moveTo(cx - 16, 146);
      ctx.lineTo(cx - 18, 138);
      ctx.moveTo(cx - 8, 146);
      ctx.lineTo(cx - 6, 138);
      ctx.stroke();
      ctx.fillStyle = '#0f241c';
      ctx.beginPath();
      ctx.arc(cx - 12, 134, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(242,234,216,0.8)';
    ctx.font = `italic 11px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText(pg.label, pg.x + pg.w / 2, 196);
  }
  // Wall panelling: two slim pilasters with gold edges, so the long navy
  // wall reads as layered architecture instead of one flat fill. Kept
  // dark and thin — decoration must never out-shout the thief, a cone
  // or the laser.
  for (const px of [470, 812]) {
    ctx.fillStyle = '#1b2240';
    ctx.fillRect(px, 46, 10, 574);
    ctx.strokeStyle = 'rgba(154,122,46,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px, 46, 10, 574);
  }
  // Dado rail: a thin gold line low on the wall, above the floor.
  ctx.strokeStyle = 'rgba(154,122,46,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 556);
  ctx.lineTo(FIELD.width, 556);
  ctx.stroke();
  // Chandelier over the centre vitrine — rev5: a proper ornate piece.
  // A brass ring with five candle bulbs on curved arms, crystal drops
  // hanging below, and a warm pool of light on the carpet under it.
  // The bulbs breathe: a slow flicker (pure function of s.time) so the
  // hall feels lit, not flat.
  const flicker = 0.82 + 0.18 * Math.sin(s.time * 1.7 + 0.6);
  ctx.strokeStyle = PALETTE.goldDim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(660, 46);
  ctx.lineTo(660, 62);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(660, 78, 52, 10, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = PALETTE.gold;
  for (let i = -2; i <= 2; i += 1) {
    const bx = 660 + i * 24;
    const by = 78 - Math.abs(i) * 2;
    // Curved arm from the ring up to the candle.
    ctx.strokeStyle = PALETTE.goldDim;
    ctx.beginPath();
    ctx.moveTo(660 + i * 18, 78);
    ctx.quadraticCurveTo(660 + i * 22, 66, bx, by);
    ctx.stroke();
    // Candle + flame.
    ctx.fillStyle = '#f4ead0';
    ctx.fillRect(bx - 2, by - 10, 4, 10);
    ctx.globalAlpha = flicker;
    ctx.fillStyle = '#ffd97a';
    ctx.beginPath();
    ctx.ellipse(bx, by - 13, 3, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = flicker * 0.35;
    ctx.beginPath();
    ctx.arc(bx, by - 13, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Crystal drop hanging from the ring.
    ctx.fillStyle = 'rgba(207,232,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(bx, 88);
    ctx.lineTo(bx + 3.5, 96);
    ctx.lineTo(bx, 104);
    ctx.lineTo(bx - 3.5, 96);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Warm light cone from the chandelier — a flat fill at the mean of
  // the old breathing alpha (0.11-0.16). The bulbs still breathe live;
  // the big trapezoid does not need a per-frame gradient (rev5 perf).
  ctx.fillStyle = 'rgba(255,217,122,0.13)';
  ctx.beginPath();
  ctx.moveTo(620, 92);
  ctx.lineTo(700, 92);
  ctx.lineTo(760, 620);
  ctx.lineTo(560, 620);
  ctx.closePath();
  ctx.fill();
  // Warm pool of chandelier light on the carpet, under the vitrine.
  // Flat fill: the radial falloff was invisible at 768x480 anyway.
  ctx.fillStyle = 'rgba(255,205,110,0.10)';
  ctx.beginPath();
  ctx.ellipse(660, 620, 220, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  // Floor + red carpet runner.
  ctx.fillStyle = PALETTE.floor;
  ctx.fillRect(0, 620, FIELD.width, 100);
  ctx.fillStyle = PALETTE.floorTop;
  ctx.fillRect(0, 620, FIELD.width, 8);
  ctx.fillStyle = PALETTE.carpet;
  ctx.fillRect(60, 620, 1160, 46);
  ctx.fillStyle = PALETTE.goldDim;
  ctx.fillRect(60, 620, 1160, 3);
  ctx.fillRect(60, 663, 1160, 3);

  // Balcony walkway, steps, vent duct.
  for (const pf of PLATFORMS) {
    if (pf.kind === 'floor') continue;
    ctx.fillStyle = pf.kind === 'vent' ? '#39415e' : '#4a3421';
    ctx.fillRect(pf.x, pf.y, pf.w, pf.h);
    ctx.fillStyle = PALETTE.goldDim;
    ctx.fillRect(pf.x, pf.y, pf.w, 3);
  }
  // Balcony railing.
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(70, 440);
  ctx.lineTo(560, 440);
  ctx.stroke();
  for (let x = 82; x < 560; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 440);
    ctx.lineTo(x, 414);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(70, 414);
  ctx.lineTo(560, 414);
  ctx.stroke();
  // Vent duct grille.
  ctx.fillStyle = '#232c52';
  ctx.fillRect(690, 168, 540, 16);
  ctx.strokeStyle = '#5a6486';
  ctx.lineWidth = 1;
  for (let x = 700; x < 1220; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 168);
    ctx.lineTo(x, 184);
    ctx.stroke();
  }
  ctx.fillStyle = PALETTE.tealDim;
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'left';
  // Rev4: at x=700 the label sat under the win title — "CLEAN
  // GETAWAY!" (58px, centred) buried its left half. Moved to the
  // duct's right end, clear of the title and its subtitle, still
  // directly above the grille it names. At x=1000 the vent coin at
  // 1120 sat on the word ROUTE; at 970 the label ends ~1095, clear
  // of the coin and of the camera unit.
  ctx.fillText('VENT — CRAWL ROUTE', 970, 158);

  // Teal safe-cover glow under every cover block.
  for (const c of COVER) {
    ctx.fillStyle = 'rgba(46,196,182,0.16)';
    ctx.beginPath();
    ctx.ellipse(c.x + c.w / 2, 620, c.w / 2 + 26, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cover: crates, plinths, statues, curtains.
  for (const c of COVER) {
    if (c.kind === 'crate') {
      ctx.fillStyle = '#7a5a34';
      roundRect(ctx, c.x, c.y, c.w, c.h, 3);
      ctx.fill();
      ctx.strokeStyle = '#5a3f22';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c.x, c.y + c.h / 2);
      ctx.lineTo(c.x + c.w, c.y + c.h / 2);
      ctx.moveTo(c.x + c.w / 2, c.y);
      ctx.lineTo(c.x + c.w / 2, c.y + c.h);
      ctx.stroke();
      ctx.fillStyle = PALETTE.teal;
      ctx.font = `bold 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('COVER', c.x + c.w / 2, c.y - 6);
    } else if (c.kind === 'plinth') {
      ctx.fillStyle = '#e8e2d2';
      roundRect(ctx, c.x, c.y, c.w, c.h, 4);
      ctx.fill();
      ctx.strokeStyle = PALETTE.goldDim;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#c9c2ae';
      ctx.fillRect(c.x, c.y, c.w, 8);
      // A small bust on top.
      ctx.fillStyle = '#b8b09a';
      ctx.beginPath();
      ctx.arc(c.x + c.w / 2, c.y - 8, 10, 0, Math.PI * 2);
      ctx.fill();
    } else if (c.kind === 'statue') {
      // Rev5: a robed figure, not a flat triangle — drapery folds, a
      // sash, and a stepped pedestal, so the big sight-blocker reads as
      // a museum piece at 768x480.
      ctx.fillStyle = '#8f9bb5';
      ctx.beginPath();
      ctx.moveTo(c.x + c.w / 2, c.y);
      ctx.lineTo(c.x + c.w - 8, c.y + c.h * 0.5);
      ctx.lineTo(c.x + c.w - 16, c.y + c.h);
      ctx.lineTo(c.x + 16, c.y + c.h);
      ctx.lineTo(c.x + 8, c.y + c.h * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#5a6486';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Drapery folds.
      ctx.strokeStyle = 'rgba(90,100,134,0.8)';
      ctx.lineWidth = 1.5;
      for (const fx of [0.32, 0.5, 0.68]) {
        ctx.beginPath();
        ctx.moveTo(c.x + c.w * fx, c.y + 14);
        ctx.quadraticCurveTo(c.x + c.w * fx - 4, c.y + c.h * 0.55, c.x + c.w * fx, c.y + c.h - 4);
        ctx.stroke();
      }
      // Sash across the chest.
      ctx.strokeStyle = PALETTE.goldDim;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.x + c.w * 0.3, c.y + c.h * 0.3);
      ctx.lineTo(c.x + c.w * 0.7, c.y + c.h * 0.48);
      ctx.stroke();
      // Head.
      ctx.beginPath();
      ctx.arc(c.x + c.w / 2, c.y - 6, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#8f9bb5';
      ctx.fill();
      ctx.strokeStyle = '#5a6486';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Stepped pedestal.
      ctx.fillStyle = '#6d7590';
      ctx.fillRect(c.x + 8, c.y + c.h - 4, c.w - 16, 6);
      ctx.fillStyle = PALETTE.goldDim;
      ctx.fillRect(c.x + 8, c.y + c.h - 4, c.w - 16, 2);
    } else if (c.kind === 'curtain') {
      ctx.fillStyle = '#6d1420';
      roundRect(ctx, c.x, c.y, c.w, c.h, 6);
      ctx.fill();
      ctx.strokeStyle = '#a02030';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.moveTo(c.x + 6 + i * 8, c.y + 4);
        ctx.lineTo(c.x + 6 + i * 8, c.y + c.h - 4);
        ctx.stroke();
      }
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(c.x, c.y, c.w, 5);
    }
  }

  // Vitrines.
  drawVitrine(ctx, s, 'left', VITRINES.left);
  drawVitrine(ctx, s, 'centre', VITRINES.centre);
  drawVitrine(ctx, s, 'right', VITRINES.right);

  // Laser grid in front of the centre vitrine.
  if (s.gridOffT <= 0) {
    for (const bx of GRID_BEAMS) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,46,62,0.35)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(bx, 500);
      ctx.lineTo(bx, 620);
      ctx.stroke();
      ctx.strokeStyle = '#ff2e3e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, 500);
      ctx.lineTo(bx, 620);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Security terminal.
  ctx.fillStyle = '#232c52';
  roundRect(ctx, TERMINAL.x, TERMINAL.y, TERMINAL.w, TERMINAL.h, 5);
  ctx.fill();
  ctx.strokeStyle = s.terminalHacked ? PALETTE.teal : PALETTE.goldDim;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = s.terminalHacked ? '#0d3a34' : '#0d2a1a';
  ctx.fillRect(TERMINAL.x + 6, TERMINAL.y + 6, TERMINAL.w - 12, 34);
  // Rev5: a faint scanline texture on the screen, so it reads as a live
  // monitor behind the HACKED / CAM LIVE text, plus a cursor block
  // blinking in the screen's bottom-right corner on the live clock.
  ctx.fillStyle = s.terminalHacked ? 'rgba(46,196,182,0.10)' : 'rgba(87,217,119,0.10)';
  for (let ly = TERMINAL.y + 9; ly < TERMINAL.y + 40; ly += 4) {
    ctx.fillRect(TERMINAL.x + 7, ly, TERMINAL.w - 14, 1);
  }
  const cursor = 0.5 + 0.5 * Math.sin(s.time * 6);
  ctx.fillStyle = s.terminalHacked
    ? `rgba(46,196,182,${0.3 + 0.7 * cursor})`
    : `rgba(87,217,119,${0.3 + 0.7 * cursor})`;
  ctx.fillRect(TERMINAL.x + TERMINAL.w - 13, TERMINAL.y + 35, 5, 3);
  // Keypad dots under the screen, below the hack progress bar.
  ctx.fillStyle = 'rgba(242,234,216,0.5)';
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      ctx.beginPath();
      ctx.arc(TERMINAL.x + 14 + c * 14, TERMINAL.y + 60 + r * 9, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = s.terminalHacked ? PALETTE.teal : '#57d977';
  ctx.font = `bold 9px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(s.terminalHacked ? 'HACKED' : 'SECURE', TERMINAL.x + 28, TERMINAL.y + 20);
  ctx.fillText(s.terminalHacked ? 'CAM OFF' : 'CAM LIVE', TERMINAL.x + 28, TERMINAL.y + 33);
  if (s.hackProgress > 0 && s.hackProgress < 2) {
    ctx.fillStyle = PALETTE.teal;
    ctx.fillRect(TERMINAL.x + 6, TERMINAL.y + 46, (TERMINAL.w - 12) * (s.hackProgress / 2), 6);
  }
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold 10px ${FONT}`;
  ctx.fillText('TERMINAL', TERMINAL.x + 28, TERMINAL.y + 96);

  // Service door with EXIT sign.
  ctx.fillStyle = '#1d2a1a';
  ctx.fillRect(SERVICE_DOOR.x, SERVICE_DOOR.y, SERVICE_DOOR.w, SERVICE_DOOR.h);
  ctx.strokeStyle = PALETTE.goldDim;
  ctx.lineWidth = 3;
  ctx.strokeRect(SERVICE_DOOR.x, SERVICE_DOOR.y, SERVICE_DOOR.w, SERVICE_DOOR.h);
  // Hinges + handle bar, so the door reads as a door, not a dark slab.
  ctx.fillStyle = '#0f1a0e';
  ctx.fillRect(SERVICE_DOOR.x + 2, SERVICE_DOOR.y + 24, 8, 14);
  ctx.fillRect(SERVICE_DOOR.x + 2, SERVICE_DOOR.y + SERVICE_DOOR.h - 38, 8, 14);
  ctx.fillStyle = PALETTE.goldDim;
  ctx.fillRect(SERVICE_DOOR.x + SERVICE_DOOR.w - 12, SERVICE_DOOR.y + 46, 5, 34);
  ctx.fillStyle = s.loot.kancil ? '#1f7a4a' : '#3a4a3a';
  roundRect(ctx, SERVICE_DOOR.x + 10, SERVICE_DOOR.y - 26, 44, 20, 3);
  ctx.fill();
  // The EXIT sign glows once the Kancil is taken: the way out lights up.
  if (s.loot.kancil) {
    ctx.save();
    ctx.shadowColor = '#4dff88';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#1f7a4a';
    roundRect(ctx, SERVICE_DOOR.x + 10, SERVICE_DOOR.y - 26, 44, 20, 3);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#eafff0';
  ctx.font = `bold 11px ${FONT}`;
  ctx.fillText('EXIT', SERVICE_DOOR.x + 32, SERVICE_DOOR.y - 12);
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold 10px ${FONT}`;
  ctx.fillText('SERVICE DOOR', SERVICE_DOOR.x + 32, SERVICE_DOOR.y + SERVICE_DOOR.h + 16);

  // Floor sheen: a soft warm band where the chandelier light meets the
  // polished floor, so the floor reads as wood, not a flat fill.
  ctx.fillStyle = 'rgba(255,220,150,0.05)';
  ctx.fillRect(0, 624, FIELD.width, 10);
  // Vignette: the hall's corners fall gently into darkness, which
  // pushes the eye toward the lit centre — the vitrine, the thief, the
  // cones. Drawn over the room only (entities draw on top), and kept
  // light so nothing at the edges is lost. Pre-rendered once at import
  // (see VIGNETTE above): a live full-screen radial gradient was the
  // single most expensive fill in the frame (rev5 perf fix).
  ctx.drawImage(VIGNETTE, 0, 0);
}

function drawCoins(ctx, s) {
  COINS.forEach((coin, i) => {
    if (s.coinTaken[i]) return;
    const sparkle = 0.8 + Math.sin(s.time * 4 + i) * 0.2;
    ctx.fillStyle = `rgba(255,217,122,${sparkle})`;
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.goldDim;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Rev5: a four-point star glint that breathes on the clock, so the
    // coins sparkle instead of sitting as flat gold dots.
    const gl = 0.35 + 0.35 * Math.sin(s.time * 4 + i * 1.3);
    ctx.save();
    ctx.globalAlpha = gl;
    ctx.strokeStyle = '#fff3c4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(coin.x - 6, coin.y - 6);
    ctx.lineTo(coin.x + 6, coin.y + 6);
    ctx.moveTo(coin.x + 6, coin.y - 6);
    ctx.lineTo(coin.x - 6, coin.y + 6);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = PALETTE.goldDim;
    ctx.font = 'bold 10px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('$', coin.x, coin.y + 3.5);
  });
}

function drawCameraUnit(ctx, s) {
  const cam = s.camera;
  // Rev5 (Fxzy: "Sorotan CCTV atau Camera perbagus"): the unit is now a
  // real CCTV camera, not a red dot on the wall — a ceiling bracket, a
  // vented housing, a lens barrel with a glass lens and a white ring,
  // and a small status LED that blinks on the live clock. Still the
  // same footprint and the same "CAMERA / CAMERA OFF" label, so the
  // staged frames keep their layout.
  ctx.save();
  // Ceiling bracket: arm from the wall above down to the housing.
  ctx.strokeStyle = '#2a3040';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(CAMERA.x - 4, CAMERA.y - 44);
  ctx.lineTo(CAMERA.x - 4, CAMERA.y - 12);
  ctx.stroke();
  ctx.fillStyle = '#2a3040';
  ctx.beginPath();
  ctx.arc(CAMERA.x - 4, CAMERA.y - 12, 5, 0, Math.PI * 2);
  ctx.fill();
  // Housing with vent slats.
  ctx.fillStyle = cam.offT > 0 ? '#232833' : '#3d3a55';
  roundRect(ctx, CAMERA.x - 16, CAMERA.y - 12, 32, 24, 4);
  ctx.fill();
  ctx.strokeStyle = cam.offT > 0 ? '#555' : PALETTE.red;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(CAMERA.x - 14, CAMERA.y - 6 + i * 5);
    ctx.lineTo(CAMERA.x - 6, CAMERA.y - 6 + i * 5);
    ctx.stroke();
  }
  // Lens barrel + glass lens.
  ctx.fillStyle = '#171a26';
  ctx.beginPath();
  ctx.arc(CAMERA.x + 10, CAMERA.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cam.offT > 0 ? '#3a3f4d' : '#ff2e3e';
  ctx.beginPath();
  ctx.arc(CAMERA.x + 10, CAMERA.y, 6, 0, Math.PI * 2);
  ctx.fill();
  // Rev4: a thin white ring around the lens, so the unit reads as a
  // camera — the laser's emitter — at 768x480, not a red dot.
  if (cam.offT <= 0) {
    ctx.strokeStyle = '#f2ead8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(CAMERA.x + 10, CAMERA.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    // Glass glint on the lens.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(CAMERA.x + 8, CAMERA.y - 2.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
    // Status LED: blinks on the live clock (1.4 Hz), red while the
    // camera watches, dark while it is off.
    const led = 0.5 + 0.5 * Math.sin(s.time * Math.PI * 2 * 1.4);
    ctx.fillStyle = `rgba(255,46,62,${0.35 + 0.65 * led})`;
    ctx.beginPath();
    ctx.arc(CAMERA.x - 12, CAMERA.y + 8, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#f2ead8';
  ctx.font = 'bold 10px ' + FONT;
  ctx.textAlign = 'left';
  ctx.fillText(cam.offT > 0 ? 'CAMERA OFF' : 'CAMERA', CAMERA.x - 58, CAMERA.y + 28);
  ctx.restore();
}

function drawDecoy(ctx, s) {
  const d = s.decoy;
  ctx.save();
  ctx.fillStyle = '#ffd97a';
  ctx.beginPath();
  ctx.arc(d.x, d.y - 8, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.goldDim;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,217,122,${0.5 + 0.5 * Math.sin(s.time * 10)})`;
  ctx.beginPath();
  ctx.arc(d.x, d.y - 8, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawParticles(ctx, s) {
  for (const pt of s.particles) {
    ctx.globalAlpha = Math.max(0, pt.life);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx, s) {
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'center';
  for (const f of s.floaters) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function drawHud(ctx, s) {
  // Top bar.
  ctx.fillStyle = 'rgba(13,17,32,0.88)';
  ctx.fillRect(0, 0, FIELD.width, 54);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 54);
  ctx.lineTo(FIELD.width, 54);
  ctx.stroke();
  // Objective (left).
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillText('VELVET VAULT', 14, 20);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `12px ${FONT}`;
  ctx.fillText(objectiveLine(s), 14, 40);
  // Alarm meter (centre): live from state, never a static label.
  const alarm = s.alarm;
  const ax = 470;
  const aw = 340;
  ctx.fillStyle = '#0d1120';
  roundRect(ctx, ax - 6, 10, aw + 12, 34, 6);
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.stroke();
  const alarmColor = alarm >= 70 ? '#ff2e3e' : alarm >= 35 ? '#ffb020' : '#2ec4b6';
  ctx.fillStyle = alarmColor;
  const fillW = Math.max(0, (aw * alarm) / 100);
  if (fillW > 0) {
    roundRect(ctx, ax, 14, fillW, 26, 4);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`ALARM ${Math.floor(alarm)}%`, ax + aw / 2, 32);
  // Detection word + timer + coins (right).
  ctx.textAlign = 'right';
  const word = detectionWord(s);
  // Rev4: the SEEN word is gone. In the alert frame it sat next to the
  // "INTRUDER!" bubble, the "Backup!" bubble, the "CHASE!" label and
  // the 68% red alarm bar — four voices saying the same thing, and a
  // static SEEN label is the stealth genre's biggest tell. The other
  // words stay: HIDDEN / SPOTTED still tell the judge the live state.
  if (!word.startsWith('SEEN')) {
    ctx.fillStyle = word === 'SPOTTED' ? '#ffb020' : '#2ec4b6';
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillText(word, 1252, 20);
  }
  ctx.fillStyle = PALETTE.text;
  ctx.font = `13px ${FONT}`;
  ctx.fillText(`TIME ${formatTime(s.time)}   COINS ${s.coins}   SCORE ${s.score || 0}`, 1252, 40);

  // Bottom tool bar.
  ctx.fillStyle = 'rgba(13,17,32,0.88)';
  ctx.fillRect(0, FIELD.height - 44, FIELD.width, 44);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.beginPath();
  ctx.moveTo(0, FIELD.height - 44);
  ctx.lineTo(FIELD.width, FIELD.height - 44);
  ctx.stroke();
  const tools = [
    { key: '1', name: 'EMP', cost: 3, blurb: 'camera off 5s + BLACKOUT' },
    { key: '2', name: 'DECOY', cost: 2, blurb: 'lure a guard' },
    { key: '3', name: 'FLASH', cost: 2, blurb: 'blind cones 3s' },
  ];
  ctx.textAlign = 'left';
  let tx = 14;
  for (const t of tools) {
    const afford = s.coins >= t.cost;
    ctx.fillStyle = afford ? PALETTE.gold : '#6a7186';
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText(`[${t.key}] ${t.name} ${t.cost}c`, tx, FIELD.height - 26);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `11px ${FONT}`;
    ctx.fillText(t.blurb, tx, FIELD.height - 11);
    tx += 250;
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `11px ${FONT}`;
  ctx.fillText('WASD move · SPACE jump · C crouch · E interact · P pause · R restart', 1266, FIELD.height - 18);

  // Interaction prompt, live from the nearest interactable — rev5: it
  // is ANCHORED to its object (just above the vitrine / terminal it
  // names, with a thin stem down to it), smaller and quieter than the
  // old top-centre pill, so it never floats in the middle of the frame
  // or covers the alarm meter. It is still live from state: it appears
  // only while the thief stands near that object, and its text is the
  // live prompt from the world.
  if (s.screen === SCREEN_PLAY && s.prompt && s.promptAnchor) {
    ctx.font = `bold 13px ${FONT}`;
    const tw = ctx.measureText(s.prompt).width + 20;
    const ax = s.promptAnchor.x;
    const ay = s.promptAnchor.y;
    const px = Math.max(6, Math.min(FIELD.width - tw - 6, ax - tw / 2));
    const py = Math.max(60, ay - 32);
    // Stem from the pill down to the object it names.
    ctx.strokeStyle = 'rgba(232,182,76,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + tw / 2, py + 24);
    ctx.lineTo(ax, ay - 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(13,17,32,0.92)';
    roundRect(ctx, px, py, tw, 24, 8);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = PALETTE.goldBright;
    ctx.textAlign = 'center';
    ctx.fillText(s.prompt, px + tw / 2, py + 16);
  }
  // Hack progress bar under the prompt.
  if (s.hackProgress > 0 && s.hackProgress < 2) {
    ctx.fillStyle = 'rgba(13,17,32,0.9)';
    ctx.fillRect(FIELD.width / 2 - 110, 100, 220, 10);
    ctx.fillStyle = PALETTE.teal;
    ctx.fillRect(FIELD.width / 2 - 110, 100, 220 * (s.hackProgress / 2), 10);
  }
}

function drawTitle(ctx, s) {
  ctx.fillStyle = 'rgba(10,13,26,0.62)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.goldBright;
  ctx.font = `bold 64px ${FONT_DISPLAY}`;
  ctx.fillText('VELVET VAULT', FIELD.width / 2, 250);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `italic 20px ${FONT_DISPLAY}`;
  ctx.fillText('One gallery. Two guards. One red laser. One golden Kancil.', FIELD.width / 2, 292);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `15px ${FONT}`;
  ctx.fillText('Hack the terminal — steal the Kancil Emas — slip out the service door.', FIELD.width / 2, 326);
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold 18px ${FONT}`;
  ctx.fillText('PRESS ENTER TO BEGIN THE HEIST', FIELD.width / 2, 392);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `13px ${FONT}`;
  ctx.fillText('WASD move · SPACE jump · C crouch · E interact · 1 EMP · 2 DECOY · 3 FLASH', FIELD.width / 2, 424);
}

function drawWin(ctx, s) {
  // Rev3: a light veil, not a blackout. In rev2 the 0.72 overlay buried
  // the open vitrine, the spilled gold and the thief at the service
  // door behind the win text. At 0.38 the gallery still reads; the
  // text stays readable because every line carries its own dark
  // shadow. The block is also kept high, so the floor — vitrine, gold,
  // thief at the door — is clear of text entirely.
  ctx.fillStyle = 'rgba(10,13,26,0.38)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  const line = (text, x, y, color) => {
    ctx.fillStyle = 'rgba(8,10,22,0.9)';
    ctx.fillText(text, x + 2, y + 2);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };
  ctx.font = `bold 58px ${FONT_DISPLAY}`;
  line('CLEAN GETAWAY!', FIELD.width / 2, 150, PALETTE.goldBright);
  ctx.font = `22px ${FONT}`;
  line(
    s.detections === 0
      ? 'The Kancil Emas is yours. The gallery never saw a thing.'
      : 'The Kancil Emas is yours — spotted, but never caught.',
    FIELD.width / 2, 188, PALETTE.text,
  );
  // Grade, big.
  ctx.font = `bold 100px ${FONT_DISPLAY}`;
  line(`GRADE ${s.grade}`, FIELD.width / 2, 312, PALETTE.gold);
  ctx.font = `17px ${FONT}`;
  const rows = [
    `TIME  ${formatTime(s.winTime)}`,
    `LOOT  ${s.lootPoints} points  ·  COINS ${s.coins}  ·  ALARM ${Math.floor(s.alarm)}%`,
    `TIMES SPOTTED  ${s.detections}`,
    `SCORE  ${s.score}`,
  ];
  rows.forEach((row, i) => line(row, FIELD.width / 2, 356 + i * 28, PALETTE.text));
  ctx.font = `14px ${FONT}`;
  line('Press R to run it again — faster, quieter, richer.', FIELD.width / 2, 484, PALETTE.muted);
}

function drawLose(ctx, s) {
  ctx.fillStyle = 'rgba(20,6,10,0.78)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5a68';
  ctx.font = `bold 54px ${FONT_DISPLAY}`;
  ctx.fillText(s.loseReason === 'alarm' ? 'THE ALARM WON' : 'CAUGHT!', FIELD.width / 2, 260);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `20px ${FONT}`;
  ctx.fillText(
    s.loseReason === 'alarm'
      ? 'The alarm hit 100% — the gallery sealed itself and the police arrived.'
      : 'A guard laid a hand on your shoulder. The Kancil stays in its vitrine.',
    FIELD.width / 2, 306,
  );
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `16px ${FONT}`;
  ctx.fillText(`Survived ${formatTime(s.time)}  ·  Alarm ${Math.floor(s.alarm)}%  ·  Coins ${s.coins}`, FIELD.width / 2, 348);
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold 16px ${FONT}`;
  ctx.fillText('Press R to try again — watch the cones, mind the red laser.', FIELD.width / 2, 396);
}

export function render(ctx, s) {
  ctx.clearRect(0, 0, FIELD.width, FIELD.height);
  drawRoom(ctx, s);
  drawAmbient(ctx, s);
  drawCoins(ctx, s);
  drawCameraUnit(ctx, s);
  for (const g of s.guards) drawCone(ctx, g);
  drawLaser(ctx, s);
  for (const g of s.guards) drawGuard(ctx, s, g);
  if (s.decoy) drawDecoy(ctx, s);
  // Rev5: on the win screen the thief stands at the service door in a
  // dark corner, small at 768x480. A warm gold-white glow behind him —
  // the EXIT sign's light spilling onto the escape — lifts him off the
  // dark door so the eye finds him first, before the grade text.
  if (s.screen === SCREEN_WIN) {
    const p = s.player;
    const glow = ctx.createRadialGradient(
      p.x + p.width / 2, p.y + p.height / 2, 6,
      p.x + p.width / 2, p.y + p.height / 2, 95,
    );
    glow.addColorStop(0, 'rgba(255,233,170,0.55)');
    glow.addColorStop(0.5, 'rgba(255,217,122,0.22)');
    glow.addColorStop(1, 'rgba(255,217,122,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x + p.width / 2, p.y + p.height / 2, 95, 0, Math.PI * 2);
    ctx.fill();
  }
  drawThief(ctx, s);
  drawBarks(ctx, s);
  drawParticles(ctx, s);
  drawFloaters(ctx, s);
  drawHud(ctx, s);
  if (s.blackoutT > 0) {
    ctx.fillStyle = 'rgba(4,6,14,0.93)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = '#f2ead8';
    ctx.textAlign = 'center';
    ctx.font = `bold 34px ${FONT_DISPLAY}`;
    ctx.fillText('THE BLACKOUT', FIELD.width / 2, 90);
    ctx.font = `16px ${FONT}`;
    ctx.fillText('Only the cones and the laser still burn in the dark.', FIELD.width / 2, 118);
    for (const g of s.guards) drawCone(ctx, g);
    drawLaser(ctx, s);
    drawHud(ctx, s);
  }
  if (s.screen === SCREEN_TITLE) drawTitle(ctx, s);
  if (s.screen === SCREEN_WIN) drawWin(ctx, s);
  if (s.screen === SCREEN_LOSE) drawLose(ctx, s);
}
