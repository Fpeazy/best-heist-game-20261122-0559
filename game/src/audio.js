// Tiny synthesized sound: no audio files, no network. A coin blip, a
// camera sting, a smash, and a short win arpeggio, all from one oscillator.
let context = null;
let muted = false;

function ensureContext() {
  if (!context) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    context = new AC();
  }
  if (context.state === 'suspended') context.resume();
  return context;
}

function tone(freq, seconds, type = 'sine', gainValue = 0.08, when = 0) {
  if (muted) return;
  const ctx = ensureContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(gainValue, ctx.currentTime + when);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + seconds);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + when);
  osc.stop(ctx.currentTime + when + seconds);
}

export const sfx = {
  coin() { tone(880, 0.12, 'sine', 0.06); tone(1320, 0.1, 'sine', 0.05, 0.06); },
  alarm() { tone(220, 0.25, 'square', 0.05); tone(180, 0.25, 'square', 0.05, 0.18); },
  smash() { tone(140, 0.3, 'sawtooth', 0.07); tone(90, 0.35, 'sawtooth', 0.06, 0.05); },
  hack() { tone(520, 0.1, 'triangle', 0.06); tone(780, 0.1, 'triangle', 0.06, 0.1); tone(1040, 0.16, 'triangle', 0.06, 0.2); },
  caught() { tone(160, 0.4, 'sawtooth', 0.08); tone(110, 0.5, 'sawtooth', 0.08, 0.2); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.07, i * 0.12)); },
  toggleMute() { muted = !muted; return muted; },
};
