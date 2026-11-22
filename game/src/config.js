// VELVET VAULT — tuning numbers, palette and gallery layout in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it
// to the window, so no rule below depends on the screen size. Side-cutaway
// 2D: a TWO-STOREY art-deco gallery hall at night — ground hall, upper
// floor, two staircases, and a vent duct along the ceiling to the roof.

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
  /** Base sweep speed; the live speed is a sinus around this (0.3-0.6). */
  sweepSpeed: 0.45,
  /** Seconds the camera pauses at each end of its sweep. */
  scanPauseSeconds: 0.8,
  beamWidth: 7,
  /** Alarm added the moment the beam touches the thief. */
  alarmHit: 25,
  /** Seconds between repeated beam hits on the same thief. */
  hitCooldown: 2,
  /** Seconds the beam must stay on a disguised thief before lock-on. */
  disguiseBeamSeconds: 1,
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
  /** Added when another guard spots a body on the floor. */
  bodySpotted: 20,
  /** Added when a guard reaches a body and raises the alarm. */
  bodyFound: 15,
  /** Added when the thief misses the hacking minigame's green zone. */
  minigameMiss: 5,
  /** Added when the Gold Bar is taken (risk vs reward). */
  goldbarAlarm: 8,
  /** Added when the Porcelain Vase is taken. */
  vaseAlarm: 5,
};

export const TOOLS = {
  emp: { key: '1', cost: 3, name: 'EMP', blurb: 'Camera + grid dead 5s. BLACKOUT 3s.' },
  decoy: { key: '2', cost: 2, name: 'DECOY', blurb: 'Guards investigate the clatter.' },
  flash: { key: '3', cost: 2, name: 'FLASH', blurb: 'Blinds guard cones 3s.' },
  lockpick: { key: '4', cost: 2, name: 'LOCKPICK', blurb: 'Silent vitrine / locked door.' },
};

export const LOOT = {
  coinValue: 1,
  idolValue: 3,
  tiaraValue: 3,
  kancilValue: 12,
  goldbarValue: 4,
  vaseValue: 2,
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
  /** Bonus for the run's heist rank (see world.js computeScore). */
  rankBonus: { Novice: 0, Shadow: 250, 'Master Thief': 600 },
  /** Rev12 — Ghost streak: per loot item taken while never detected. */
  ghostBonusPerLoot: 150,
  /** Rev12 — Close call: a guard grew suspicious and lost you. */
  closeCallBonus: 100,
};

/** Rev12 — starting gadget stock. Using a gadget spends one stock;
 *  with no stock left the thief auto-buys one with coins at the
 *  TOOLS price (the old pay-per-use economy, unchanged). Pre-heist
 *  planning adds +1 stock of the chosen gadget. */
export const INVENTORY_START = { emp: 1, decoy: 1, flash: 2, lockpick: 1 };

/** Alarm tiers: 0 below 35%, 1 at 35-69%, 2 at 70% and up. */
export const ALARM_TIERS = { tier1At: 35, tier2At: 70 };

/** The hacking minigame: 3 green-zone hits, needle 0-100, zone 40-60. */
export const MINIGAME = {
  need: 3,
  startSpeed: 55,
  speedPerHit: 25,
  zoneLo: 40,
  zoneHi: 60,
};

/** Where the second guard runs to cut the thief off at the service door. */
export const CUTOFF_X = 1050;

/** One-way platforms: the thief jumps up through them and lands on top. */
export const PLATFORMS = [
  { x: 0, y: 620, w: 1280, h: 100, kind: 'floor' },
  // The upper floor: a real second storey, nearly the full width of the
  // hall (70-1220). Its own room: idol left, gold + vase + tiara right,
  // locker at the far right end, wardrobe mid-floor.
  { x: 70, y: 440, w: 1150, h: 18, kind: 'upper' },
  // Left staircase (ground floor -> upper floor).
  { x: 60, y: 578, w: 64, h: 14, kind: 'step' },
  { x: 124, y: 542, w: 64, h: 14, kind: 'step' },
  { x: 188, y: 506, w: 64, h: 14, kind: 'step' },
  { x: 252, y: 472, w: 64, h: 14, kind: 'step' },
  // Right staircase (ground floor -> upper floor). Steps rise rightward
  // and land on the upper floor's right end, beside the locker.
  { x: 958, y: 578, w: 64, h: 14, kind: 'step' },
  { x: 1022, y: 542, w: 64, h: 14, kind: 'step' },
  { x: 1086, y: 506, w: 64, h: 14, kind: 'step' },
  { x: 1150, y: 472, w: 64, h: 14, kind: 'step' },
  // The vent duct along the ceiling: crawl it to the roof escape
  // (x >= 1180) or drop behind the vitrine. Reached from the upper
  // floor by the vent stairs (372, 316, 250, 210).
  { x: 690, y: 168, w: 540, h: 16, kind: 'vent' },
  { x: 540, y: 372, w: 64, h: 14, kind: 'step' },
  { x: 600, y: 316, w: 64, h: 14, kind: 'step' },
  { x: 560, y: 250, w: 60, h: 14, kind: 'step' },
  { x: 620, y: 210, w: 70, h: 14, kind: 'step' },
];

/** Solid blocks: stop the thief and block guard sight (occluders).
 *  Floor crates are low (44px): a crouched thief behind one is hidden
 *  from a guard's eye line, and the thief jumps over them. The tall
 *  statue and balcony plinths are the big sight-blockers. Guard patrols
 *  run in the clear lanes between them, so no guard ever clips a block.
 *  The partition wall (700,360,20,80) splits the upper floor into two
 *  rooms; it is 80px tall so the thief jumps over it (jump ~110px),
 *  and guard 1's patrol (160-560) never reaches it. */
export const COVER = [
  { x: 430, y: 576, w: 62, h: 44, kind: 'crate', solid: true },
  { x: 760, y: 576, w: 62, h: 44, kind: 'crate', solid: true },
  { x: 900, y: 540, w: 74, h: 80, kind: 'statue', solid: true },
  { x: 230, y: 372, w: 56, h: 68, kind: 'plinth', solid: true },
  { x: 400, y: 372, w: 56, h: 68, kind: 'plinth', solid: true },
  // Velvet curtain on the upper floor: blocks sight, the thief slips behind it.
  { x: 300, y: 340, w: 34, h: 100, kind: 'curtain', solid: false },
  { x: 1140, y: 520, w: 34, h: 100, kind: 'curtain', solid: false },
  // Partition wall, upper floor: two rooms, one jumpable wall.
  { x: 700, y: 360, w: 20, h: 80, kind: 'wall', solid: true },
];

/** Hide spots (wardrobes): press E nearby to hide inside; E or any
 *  movement steps back out. A hidden thief cannot be seen or caught.
 *  These are interaction points, NOT solid cover — the thief walks
 *  through the wardrobe's spot when not hiding. */
export const HIDE_SPOTS = [
  { x: 320, y: 520, w: 60, h: 100, kind: 'wardrobe', floor: 'ground' },
  { x: 760, y: 340, w: 60, h: 100, kind: 'wardrobe', floor: 'upper' },
];

/** The guard-uniform locker (disguise), upper floor far right end.
 *  One uniform only: after it is taken the locker is empty. */
export const LOCKER = { x: 1172, y: 340, w: 48, h: 100 };

/** Light switches, one per floor (point + floor). E toggles that
 *  floor's lights; a dark floor shrinks guard cones 30% and suspicion
 *  rate 30% on that floor. */
export const SWITCHES = [
  { x: 64, y: 556, floor: 'ground' },
  { x: 100, y: 376, floor: 'upper' },
];

/** Extra loot on pedestals (upper floor): risk vs reward — taking one
 *  adds alarm, unlike the coins. */
export const EXTRA_LOOT = {
  goldbar: { x: 860, y: 380, w: 50, h: 60, label: 'GOLD BAR' },
  vase: { x: 980, y: 380, w: 44, h: 60, label: 'PORCELAIN VASE' },
};

export const VITRINES = {
  // Jade Idol moved upstairs, left room of the upper floor.
  left: { x: 130, y: 340, w: 70, h: 100, loot: 'idol', label: 'JADE IDOL' },
  // Kancil Emas stays in the ground hall, centre.
  centre: { x: 600, y: 500, w: 120, h: 120, loot: 'kancil', label: 'KANCIL EMAS' },
  // Pearl Tiara moved upstairs, right room of the upper floor.
  right: { x: 1080, y: 340, w: 70, h: 100, loot: 'tiara', label: 'PEARL TIARA' },
};

export const TERMINAL = { x: 1075, y: 540, w: 56, h: 80 };
export const SERVICE_DOOR = { x: 1196, y: 500, w: 64, h: 120 };

export const COINS = [
  { x: 240, y: 596, taken: false },
  // 540, not 500: the thief jumps the crate (430-492) and is still
  // falling off it when passing 500, 36px above the coin's pickup
  // radius (34). At 540 the thief is back on the floor and walks it.
  { x: 540, y: 596, taken: false },
  // 580, not 990: the staged driver chain-jumps crate (760) -> statue
  // (900) without touching the floor, so a coin at 990 sits under the
  // jump arc and is never collected. At 580 the thief walks it on the
  // floor, between the crate and the centre vitrine.
  { x: 580, y: 596, taken: false },
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
