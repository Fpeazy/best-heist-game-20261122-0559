# VELVET VAULT — a one-room heist

[![make.fun](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/Fpeazy/best-heist-game-20261122-0559/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/Fpeazy/best-heist-game-20261122-0559/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559)

A side-cutaway heist game set in one art-deco gallery at night. Hack the
security terminal, steal the **Kancil Emas** from the centre vitrine, and
slip out through the service door — past two patrolling guards with amber
vision cones and a wall camera sweeping a thin **red laser** across the
hall. Everything the brief asks for is in one frame: the room the thief
crosses, guard cones, the camera, the loot target and a live alarm meter.

## How a heist plays

- **Two-step objective:** neutralise the camera first (hack the terminal,
  or spend coins on an EMP), then take the Kancil Emas and reach the
  service door. Smashing the glass instead of hacking it costs +40% alarm.
- **Two different danger systems:** guards see in **amber cones** (blocked
  by crates, statues and curtains; suspicion → investigate → chase) while
  the camera fires a **narrow red laser** that sweeps slowly, reaches far,
  ignores noise and decoys, and jumps the alarm +25% on a touch.
- **Live alarm meter 0–100%:** cones +15% when a chase starts, camera
  +25%, smashed glass +40%, the laser grid in front of the vitrine +10%,
  time +0.5%/s, a hack −20%. At 100% the gallery seals and the run ends.
- **Tools cost coins** (coins come from small loot along the way): EMP
  (3c — camera and grid dead 5s, and **THE BLACKOUT**: the hall goes dark
  for 3s, only cones and the laser still burning), Decoy (2c — lures a
  guard to investigate), Flashbang (2c — blinds the cones for 3s).
- **Three routes through one room:** the main floor, the balcony, and the
  vent duct along the ceiling. Teal marks safe cover, amber and red mark
  danger, gold marks loot.
- **Scoring:** loot points, a time bonus, a +500 undetected bonus, and
  grades S / A / B / C on the win screen. The timer, alarm, score and
  grade are all computed from the run itself — nothing is typed in.

## Controls

- **WASD / arrows** — move (a big white silhouette, 58px tall, dark
  outline — findable at a glance, even at 768×480)
- **Space** — jump (over crates and the statue)
- **C** — crouch (slower, quieter, hidden behind low crates)
- **E** — interact (hold to hack the terminal, press to take loot)
- **1 / 2 / 3** — EMP / Decoy / Flashbang
- **P** — pause, **R** — restart

## The engine

A custom vanilla JavaScript + Canvas engine, no libraries, no network:
fixed-step simulation, platformer physics, guard AI (patrol → suspect →
investigate → chase → search → return, with last-seen memory), raycast
vision cones cut short by cover, a sweeping camera laser, a laser grid,
particles, floating score text, guard barks, and synthesized Web Audio.
One deep room, three routes, four staged scenes.

## Screenshots

Four deterministic staged scenes (`?shot=title|stealth|alert|win`,
seed 1): the title over the live hall, the core stealth moment (thief
crouched behind a crate as a cone sweeps past, cut short by the crate),
the alert (a guard in chase, the camera locked on, the alarm meter past
two-thirds and red), and the win (vitrine open, Grade S, the real timer
from the staged run). The same seed always gives the same frame.

## Play it

```sh
node serve.ts   # serves game/ on http://localhost:8080
```

## Hand-in

`main.ts` (Node 22) copies `game/` and `screenshots/` to `/output` and
writes `/output/dossier.json` with the vendored make.fun library.
