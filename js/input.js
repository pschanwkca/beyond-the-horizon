// Beyond the Horizon · input: keyboard, mouse drag, touch joystick + buttons
export const input = {
  move: { x: 0, y: 0 },      // -1..1, y = forward
  look: { dx: 0, dy: 0 },    // accumulated pixels since last frame
  held: new Set(),           // action names currently held
  edges: new Set(),          // action names pressed this frame
  touch: matchMedia('(pointer: coarse)').matches,
  enabled: true,
};
const KEYMAP = {
  KeyJ: 'attack', KeyK: 'dodge', ShiftLeft: 'dodge', ShiftRight: 'dodge', Space: 'jump', KeyE: 'interact', KeyF: 'interact',
  KeyT: 'scope', KeyR: 'sprint', Period: 'warpUp', Comma: 'warpDown', KeyZ: 'throttleMax', KeyX: 'throttleCut',
  KeyQ: 'block', Escape: 'pause', KeyC: 'sink', ControlLeft: 'sink', ControlRight: 'sink',
  Tab: 'lock', KeyG: 'heal', KeyV: 'fly', KeyX: 'heavy', KeyU: 'heavy', KeyL: 'lock',
};
const MOVEKEYS = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
const down = new Set();

export function press(a) { if (!input.held.has(a)) input.edges.add(a); input.held.add(a); }
export function release(a) { input.held.delete(a); }
export function consume(a) { const had = input.edges.has(a); input.edges.delete(a); return had; }
export function endFrame() { input.edges.clear(); input.look.dx = 0; input.look.dy = 0; }

function keyMove() {
  if (joy.active) return;
  let x = 0, y = 0;
  for (const k of down) { const m = MOVEKEYS[k]; if (m) { x += m[0]; y += m[1]; } }
  const l = Math.hypot(x, y) || 1;
  input.move.x = x / l * (x || y ? 1 : 0); input.move.y = y / l * (x || y ? 1 : 0);
}
addEventListener('keydown', (e) => {
  if (!input.enabled || e.repeat) { if (MOVEKEYS[e.code] || KEYMAP[e.code]) e.preventDefault(); return; }
  down.add(e.code);
  if (KEYMAP[e.code]) { press(KEYMAP[e.code]); e.preventDefault(); }
  if (MOVEKEYS[e.code]) { keyMove(); e.preventDefault(); }
});
addEventListener('keyup', (e) => {
  down.delete(e.code);
  if (KEYMAP[e.code]) release(KEYMAP[e.code]);
  if (MOVEKEYS[e.code]) keyMove();
});
addEventListener('blur', () => { down.clear(); input.held.clear(); keyMove(); });

// ---- pointer: drag anywhere on the play surface to look; left click = attack on desktop ----
const joy = { active: false, id: -1, cx: 0, cy: 0, el: null, knob: null, base: null };
let lookId = -1, lx = 0, ly = 0, downT = 0, moved = 0;
export function bindSurface(el, { joyBase, joyKnob }) {
  joy.base = joyBase; joy.knob = joyKnob;
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    if (!input.enabled) return;
    if (!input.touch && e.button === 2) { press('block'); return; }                 // right button: hold to block
    if (!input.touch && e.button === 1) { press('lock'); setTimeout(() => release('lock'), 60); e.preventDefault(); return; }
    if (input.touch && e.clientX < innerWidth * 0.42 && joy.id < 0) {
      joy.id = e.pointerId; joy.active = true; joy.cx = e.clientX; joy.cy = e.clientY;
      joy.base.style.transform = `translate(${e.clientX - 62}px, ${e.clientY - 62}px)`; joy.base.classList.add('on');
      joy.knob.style.transform = 'translate(0px,0px)';
      el.setPointerCapture(e.pointerId); return;
    }
    if (lookId < 0) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; downT = performance.now(); moved = 0; el.setPointerCapture(e.pointerId); }
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId === joy.id) {
      let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy; const l = Math.hypot(dx, dy), m = 52;
      if (l > m) { dx *= m / l; dy *= m / l; }
      joy.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      input.move.x = dx / m; input.move.y = -dy / m; return;
    }
    if (e.pointerId === lookId) { input.look.dx += e.clientX - lx; input.look.dy += e.clientY - ly; moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly); lx = e.clientX; ly = e.clientY; }
  });
  const up = (e) => {
    if (!input.touch && e.button === 2) release('block');
    if (e.pointerId === joy.id) { joy.id = -1; joy.active = false; input.move.x = input.move.y = 0; joy.base.classList.remove('on'); keyMove(); }
    if (e.pointerId === lookId) {
      lookId = -1;
      if (!input.touch && e.button === 0 && moved < 6 && performance.now() - downT < 250) { press('attack'); setTimeout(() => release('attack'), 60); }
    }
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
// on-screen buttons: <button data-act="attack">
export function bindButtons(root) {
  root.querySelectorAll('[data-act]').forEach((b) => {
    const a = b.dataset.act;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); press(a); b.classList.add('press'); });
    const off = (e) => { release(a); b.classList.remove('press'); };
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  });
}
