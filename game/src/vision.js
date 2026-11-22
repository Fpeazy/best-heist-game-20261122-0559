// Sight lines: does a segment from (x1,y1) to (x2,y2) cross any cover
// block? Guards see through curtains only when the thief is not behind
// one; plinths and statues block sight outright. The camera's laser is
// blocked the same way, so a plinth is real cover from both systems.
import { COVER } from './config.js';

/** True when the segment p1->p2 crosses rectangle r. */
function segmentHitsRect(x1, y1, x2, y2, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;
  // Slab test, axis by axis.
  if (dx === 0) {
    if (x1 < r.x || x1 > r.x + r.w) return false;
  } else {
    let t1 = (r.x - x1) / dx;
    let t2 = (r.x + r.w - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  if (dy === 0) {
    if (y1 < r.y || y1 > r.y + r.h) return false;
  } else {
    let t1 = (r.y - y1) / dy;
    let t2 = (r.y + r.h - y1) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

/** True when nothing blocks the view from (x1,y1) to (x2,y2). */
export function hasLineOfSight(x1, y1, x2, y2) {
  for (const block of COVER) {
    if (segmentHitsRect(x1, y1, x2, y2, block)) return false;
  }
  return true;
}

/**
 * Is the point (px,py) inside the guard's vision cone, with sight?
 * The guard's eye is at its head; the cone is a wedge in the direction
 * it faces, cut short by whatever cover stands between eye and thief.
 */
export function insideCone(guard, px, py) {
  const eyeX = guard.x + guard.width / 2;
  const eyeY = guard.y + 14;
  const dx = px - eyeX;
  const dy = py - eyeY;
  const dist = Math.hypot(dx, dy);
  if (dist > guard.coneRange) return false;
  if (dist < 30) return true;
  const facing = guard.facing; // -1 left, +1 right
  const angle = Math.atan2(dy, dx);
  const facingAngle = facing === 1 ? 0 : Math.PI;
  let diff = Math.abs(angle - facingAngle);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  if (diff > guard.coneHalfAngle) return false;
  return hasLineOfSight(eyeX, eyeY, px, py);
}

/** Where a cone ray of `length` at `angle` from the eye first hits cover. */
export function coneRayHit(eyeX, eyeY, angle, length) {
  const x2 = eyeX + Math.cos(angle) * length;
  const y2 = eyeY + Math.sin(angle) * length;
  let best = length;
  for (const block of COVER) {
    // March along the ray in 12px steps; cheap and exact enough to draw.
    for (let d = 12; d < best; d += 12) {
      const x = eyeX + Math.cos(angle) * d;
      const y = eyeY + Math.sin(angle) * d;
      if (x >= block.x && x <= block.x + block.w && y >= block.y && y <= block.y + block.h) {
        best = d;
        break;
      }
    }
  }
  void x2;
  void y2;
  return best;
}

/** Where the camera's laser first hits cover (or its full length). */
export function laserHit(x1, y1, angle, length) {
  let best = length;
  for (const block of COVER) {
    for (let d = 12; d < best; d += 12) {
      const x = x1 + Math.cos(angle) * d;
      const y = y1 + Math.sin(angle) * d;
      if (x >= block.x && x <= block.x + block.w && y >= block.y && y <= block.y + block.h) {
        best = d;
        break;
      }
    }
  }
  return best;
}
