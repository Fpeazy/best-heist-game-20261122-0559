// VELVET VAULT — tuning numbers, palette and gallery layout in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it
// to the window, so no rule below depends on the screen size. Side-cutaway
// 2D: one art-deco gallery hall at night, floor / balcony / vent routes.

export const FIELD = { width: 1280, height: 720 };

/** Fixed simulation step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

export const PLAYER = {
  width: 40,
  height: 58,
  crouchHeight: 36,
  walkSpeed: 265,
  crouchSpeed: 130,
  jumpSpeed: 640,
  gravity: 1850,
};

export const GUARD = {
  width: 38,
  height: 56,
  patrolSpeed: 72,
  chaseSpeed: 305,
  /** Vision cone: how far a guard sees, and its half-angle. */
  coneRange: 265,
  coneHalfAngle: 0.5,
  /** Suspicion fills per second while the thief is inside a cone. */
  suspicionRate: 55,
  suspicionDecay: 26,
  /** A guard that loses the thief searches this long, then walks back. */
  searchSeconds: 4,
};

export const CAMERA = {
  x: 1185,
  y: 108,
  beamLength: 720,
  /** Beam sweeps between these angles (radians, 0 = right, PI/2 = down). */
  minAngle: 1.15,
  maxAngle: 2.25,
  sweepSpeed: 0.45,
  beamWidth: 7,
  /** Alarm added the moment the beam touches the thief. */
  alarmHit: 25,
  /** Seconds between repeated beam hits on the same thief. */
  hitCooldown: 2,
  /** Seconds the camera stays dead after an EMP. */
  empOffSeconds: 5,
  /** Seconds the camera stays dead after the terminal is hacked. */
  hackOffSeconds: 25,
};

export const ALARM = {
  /** Passive creep, percent per second, while the heist is live. */
  creepPerSecond: 0.5,
  /** Added when a guard's suspicion maxes out and the chase starts. */
  chaseTrigger: 15,
  /** Added when the vitrine glass is smashed instead of opened. */
  smashGlass: 40,
  /** Added when a side vitrine is forced open. */
  forceSideVitrine: 5,
  /** Removed when the security terminal is hacked. */
  hackRelief: 20,
  /** A guard chase that ends without a catch bleeds this much alarm. */
  chaseEndRelief: 6,
};

export const TOOLS = {
  emp: { key: '1', cost: 3, name: 'EMP', blurb: 'Camera + grid dead 5s. BLACKOUT 3s.' },
  decoy: { key: '2', cost: 2, name: 'DECOY', blurb: 'Guards investigate the clatter.' },
  flash: { key: '3', cost: 2, name: 'FLASH', blurb: 'Blinds guard cones 3s.' },
};

export const LOOT = {
  coinValue: 1,
  idolValue: 3,
  tiaraValue: 3,
  kancilValue: 12,
};

export const SCORE = {
  base: 1000,
  perCoin: 150,
  timeBonusPerSecond: 5,
  timeBonusCapSeconds: 300,
  undetectedBonus: 500,
  undetectedAlarmMax: 40,
  gradeS: 5500,
  gradeA: 4200,
  gradeB: 3000,
};

/** One-way platforms: the thief jumps up through them and lands on top. */
export const PLATFORMS = [
  { x: 0, y: 620, w: 1280, h: 100, kind: 'floor' },
  { x: 70, y: 440, w: 490, h: 18, kind: 'balcony' },
  { x: 60, y: 578, w: 64, h: 14, kind: 'step' },
  { x: 124, y: 542, w: 64, h: 14, kind: 'step' },
  { x: 188, y: 506, w: 64, h: 14, kind: 'step' },
  { x: 252, y: 472, w: 64, h: 14, kind: 'step' },
  // The vent duct along the ceiling: crawl it to drop behind the vitrine.
  { x: 690, y: 168, w: 540, h: 16, kind: 'vent' },
  { x: 560, y: 250, w: 60, h: 14, kind: 'step' },
  { x: 620, y: 210, w: 70, h: 14, kind: 'step' },
];

/** Solid blocks: stop the thief and block guard sight (occluders).
 *  Floor crates are low (44px): a crouched thief behind one is hidden
 *  from a guard's eye line, and the thief jumps over them. The tall
 *  statue and balcony plinths are the big sight-blockers. Guard patrols
 *  run in the clear lanes between them, so no guard ever clips a block. */
export const COVER = [
  { x: 430, y: 576, w: 62, h: 44, kind: 'crate', solid: true },
  { x: 760, y: 576, w: 62, h: 44, kind: 'crate', solid: true },
  { x: 900, y: 540, w: 74, h: 80, kind: 'statue', solid: true },
  { x: 180, y: 372, w: 56, h: 68, kind: 'plinth', solid: true },
  { x: 400, y: 372, w: 56, h: 68, kind: 'plinth', solid: true },
  // Velvet curtain on the balcony: blocks sight, the thief slips behind it.
  { x: 300, y: 340, w: 34, h: 100, kind: 'curtain', solid: false },
  { x: 1140, y: 520, w: 34, h: 100, kind: 'curtain', solid: false },
];

export const VITRINES = {
  left: { x: 330, y: 520, w: 70, h: 100, loot: 'idol', label: 'JADE IDOL' },
  centre: { x: 600, y: 500, w: 120, h: 120, loot: 'kancil', label: 'KANCIL EMAS' },
  right: { x: 990, y: 520, w: 70, h: 100, loot: 'tiara', label: 'PEARL TIARA' },
};

export const TERMINAL = { x: 1075, y: 540, w: 56, h: 80 };
export const SERVICE_DOOR = { x: 1196, y: 500, w: 64, h: 120 };

export const COINS = [
  { x: 240, y: 596, taken: false },
  { x: 500, y: 596, taken: false },
  { x: 860, y: 596, taken: false },
  { x: 1160, y: 596, taken: false },
  { x: 150, y: 416, taken: false },
  { x: 340, y: 416, taken: false },
  { x: 800, y: 144, taken: false },
  { x: 1120, y: 144, taken: false },
];

export const PALETTE = {
  wall: '#171d33',
  wallDark: '#10142a',
  floor: '#2a1f16',
  floorTop: '#4a3421',
  carpet: '#7a1f2e',
  gold: '#e8b64c',
  goldBright: '#ffd97a',
  goldDim: '#9a7a2e',
  teal: '#2ec4b6',
  tealDim: '#1d7a70',
  navy: '#0d1120',
  amber: '#ffb020',
  amberDim: '#b97a10',
  red: '#ff2e3e',
  redDim: '#8f1420',
  thief: '#f4f1e8',
  thiefOutline: '#14141c',
  guard: '#3a4a6b',
  guardOutline: '#10182e',
  text: '#f2ead8',
  muted: '#9aa3b8',
  panel: '#1c2340',
  panelEdge: '#3a4470',
};

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
export const FONT_DISPLAY = 'Georgia, "Times New Roman", serif';
