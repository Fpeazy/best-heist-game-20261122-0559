// Keyboard + mouse input, kept apart from the simulation: this file only
// turns key events into the plain input object world.update() reads.
export function createInput() {
  return {
    left: false,
    right: false,
    jump: false,
    crouch: false,
    interact: false,
    interactPressed: false,
    useEmp: false,
    useDecoy: false,
    useFlash: false,
    useLockpick: false,
    clearGadget: false,
    pausePressed: false,
    restartPressed: false,
    confirmPressed: false,
  };
}

const KEYMAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'crouch',
  KeyC: 'crouch',
  KeyS: 'crouch',
  KeyE: 'interact',
  Digit0: 'clearGadget',
  Digit1: 'useEmp',
  Digit2: 'useDecoy',
  Digit3: 'useFlash',
  Digit4: 'useLockpick',
};

export function attachInput(input, target) {
  const down = (event) => {
    if (event.code === 'KeyP') { input.pausePressed = true; event.preventDefault(); return; }
    if (event.code === 'KeyR') { input.restartPressed = true; event.preventDefault(); return; }
    if (event.code === 'Enter') { input.confirmPressed = true; event.preventDefault(); return; }
    const field = KEYMAP[event.code];
    if (!field) return;
    if (field === 'interact' && !input.interact) input.interactPressed = true;
    input[field] = true;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
  };
  const up = (event) => {
    const field = KEYMAP[event.code];
    // Tool keys (1/2/3) are edge-triggered: the frame loop consumes them
    // via clearEdgeFlags, so a quick tap must not be erased by keyup.
    if (field && !field.startsWith('use')) input[field] = false;
  };
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  return () => {
    target.removeEventListener('keydown', down);
    target.removeEventListener('keyup', up);
  };
}

/** Clear the one-shot flags after each simulation step. */
export function clearEdgeFlags(input) {
  input.interactPressed = false;
  input.useEmp = false;
  input.useDecoy = false;
  input.useFlash = false;
  input.useLockpick = false;
  input.pausePressed = false;
  input.restartPressed = false;
  input.confirmPressed = false;
}
