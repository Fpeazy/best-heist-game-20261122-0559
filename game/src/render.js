// VELVET VAULT — the renderer. One art-deco gallery hall at night, drawn
// on canvas: navy walls with gold trim, a red carpet runner, teal safe
// cover, amber guard cones, a red camera laser, gold loot. The thief is a
// big white silhouette with a dark outline, findable at a glance.
import {
  CAMERA, COINS, COVER, FIELD, GUARD, PALETTE, PLATFORMS, SERVICE_DOOR,
  TERMINAL, VITRINES, FONT, FONT_DISPLAY,
} from './config.js';
import { coneRayHit, laserHit } from './vision.js';
import {
  SCREEN_LOSE, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
  detectionWord, objectiveLine,
} from './world.js';

const GRID_BEAMS = [596, 660, 724];

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
  const grad = ctx.createRadialGradient(eyeX, eyeY, 10, eyeX, eyeY, range);
  grad.addColorStop(0, hot ? 'rgba(255,60,50,0.5)' : 'rgba(255,176,32,0.42)');
  grad.addColorStop(1, 'rgba(255,176,32,0.05)');
  ctx.fillStyle = grad;
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
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,46,62,0.25)';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(CAMERA.x, CAMERA.y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = cam.lockOnT > 0 ? '#ff5a68' : '#ff2e3e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(CAMERA.x, CAMERA.y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.fillStyle = '#ff2e3e';
  ctx.beginPath();
  ctx.arc(x2, y2, 4, 0, Math.PI * 2);
  ctx.fill();
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
  // Dark outline first, then the white silhouette — readable on any wall.
  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.thiefOutline;
  ctx.fillStyle = PALETTE.thief;
  // Coat: a long bell shape.
  ctx.beginPath();
  ctx.moveTo(x + w * 0.5, y + 6);
  ctx.lineTo(x + w * 0.86, y + h * 0.42);
  ctx.lineTo(x + w * 0.78, y + h);
  ctx.lineTo(x + w * 0.22, y + h);
  ctx.lineTo(x + w * 0.14, y + h * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Head + fedora.
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + 10, 9, 0, Math.PI * 2);
  ctx.fill();
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
  // State label, live from the guard's own state.
  const label = { patrol: 'PATROL', suspect: 'SUSPICIOUS', investigate: 'INVESTIGATING', chase: 'CHASE!', search: 'SEARCHING', return: 'RETURNING' }[g.state] || 'PATROL';
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
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
    const by = Math.max(60, y - 46);
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
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(v.x + 12, v.y + v.h - 8);
    ctx.lineTo(v.x + v.w * 0.45, v.y + 10);
    ctx.stroke();
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
  if (key === 'centre' && glass !== 'shut') {
    ctx.fillStyle = PALETTE.goldBright;
    for (const [gx, gy, gr] of [[v.x + 18, v.y + v.h + 8, 6], [v.x + 52, v.y + v.h + 12, 5], [v.x + 88, v.y + v.h + 7, 6], [v.x + 104, v.y + v.h + 13, 4]]) {
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.goldDim;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
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
  // Paintings between the windows.
  const paintings = [
    { x: 250, w: 90, hue: '#7a4a2e', label: 'The Duchess' },
    { x: 830, w: 90, hue: '#2e5a4a', label: 'The Hunt' },
  ];
  for (const pg of paintings) {
    ctx.fillStyle = PALETTE.goldDim;
    ctx.fillRect(pg.x - 4, 76, pg.w + 8, 108);
    ctx.fillStyle = pg.hue;
    ctx.fillRect(pg.x, 80, pg.w, 100);
    ctx.fillStyle = 'rgba(242,234,216,0.8)';
    ctx.font = `italic 11px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText(pg.label, pg.x + pg.w / 2, 196);
  }
  // Chandelier over the centre vitrine.
  ctx.strokeStyle = PALETTE.goldDim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(660, 46);
  ctx.lineTo(660, 78);
  ctx.stroke();
  ctx.fillStyle = PALETTE.gold;
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.arc(660 + i * 26, 84, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,217,122,0.14)';
  ctx.beginPath();
  ctx.moveTo(620, 92);
  ctx.lineTo(700, 92);
  ctx.lineTo(760, 620);
  ctx.lineTo(560, 620);
  ctx.closePath();
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
  ctx.fillText('VENT — CRAWL ROUTE', 700, 158);

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
      ctx.beginPath();
      ctx.arc(c.x + c.w / 2, c.y - 6, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#8f9bb5';
      ctx.fill();
      ctx.stroke();
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
  ctx.fillStyle = s.loot.kancil ? '#1f7a4a' : '#3a4a3a';
  roundRect(ctx, SERVICE_DOOR.x + 10, SERVICE_DOOR.y - 26, 44, 20, 3);
  ctx.fill();
  ctx.fillStyle = '#eafff0';
  ctx.font = `bold 11px ${FONT}`;
  ctx.fillText('EXIT', SERVICE_DOOR.x + 32, SERVICE_DOOR.y - 12);
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold 10px ${FONT}`;
  ctx.fillText('SERVICE DOOR', SERVICE_DOOR.x + 32, SERVICE_DOOR.y + SERVICE_DOOR.h + 16);
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
    ctx.fillStyle = PALETTE.goldDim;
    ctx.font = 'bold 10px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('$', coin.x, coin.y + 3.5);
  });
}

function drawCameraUnit(ctx, s) {
  const cam = s.camera;
  ctx.save();
  ctx.fillStyle = cam.offT > 0 ? '#2a3040' : '#3d3a55';
  roundRect(ctx, CAMERA.x - 16, CAMERA.y - 12, 32, 24, 4);
  ctx.fill();
  ctx.strokeStyle = cam.offT > 0 ? '#555' : PALETTE.red;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = cam.offT > 0 ? '#666' : '#ff2e3e';
  ctx.beginPath();
  ctx.arc(CAMERA.x + 8, CAMERA.y, 5, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.fillStyle = word.startsWith('SEEN') ? '#ff5a68' : word === 'SPOTTED' ? '#ffb020' : '#2ec4b6';
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillText(word, 1252, 20);
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

  // Interaction prompt, live from the nearest interactable.
  if (s.screen === SCREEN_PLAY && s.prompt) {
    ctx.font = `bold 15px ${FONT}`;
    const tw = ctx.measureText(s.prompt).width + 24;
    ctx.fillStyle = 'rgba(13,17,32,0.92)';
    roundRect(ctx, FIELD.width / 2 - tw / 2, 66, tw, 28, 8);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = PALETTE.goldBright;
    ctx.textAlign = 'center';
    ctx.fillText(s.prompt, FIELD.width / 2, 85);
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
  ctx.fillStyle = 'rgba(10,13,26,0.72)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.goldBright;
  ctx.font = `bold 58px ${FONT_DISPLAY}`;
  ctx.fillText('CLEAN GETAWAY!', FIELD.width / 2, 210);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `22px ${FONT}`;
  ctx.fillText(
    s.detections === 0
      ? 'The Kancil Emas is yours. The gallery never saw a thing.'
      : 'The Kancil Emas is yours — spotted, but never caught.',
    FIELD.width / 2, 252,
  );
  // Grade, big.
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold 110px ${FONT_DISPLAY}`;
  ctx.fillText(`GRADE ${s.grade}`, FIELD.width / 2, 380);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `17px ${FONT}`;
  const rows = [
    `TIME  ${formatTime(s.winTime)}`,
    `LOOT  ${s.lootPoints} points  ·  COINS ${s.coins}  ·  ALARM ${Math.floor(s.alarm)}%`,
    `TIMES SPOTTED  ${s.detections}`,
    `SCORE  ${s.score}`,
  ];
  rows.forEach((row, i) => ctx.fillText(row, FIELD.width / 2, 430 + i * 30));
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `14px ${FONT}`;
  ctx.fillText('Press R to run it again — faster, quieter, richer.', FIELD.width / 2, 580);
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
  drawCoins(ctx, s);
  drawCameraUnit(ctx, s);
  for (const g of s.guards) drawCone(ctx, g);
  drawLaser(ctx, s);
  for (const g of s.guards) drawGuard(ctx, s, g);
  if (s.decoy) drawDecoy(ctx, s);
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
