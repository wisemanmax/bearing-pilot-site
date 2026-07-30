/* ------------------------------------------------------------------ *
 * Touch controls.
 *
 * The desktop scheme is pointer lock: an infinite mouse surface for look
 * and a keyboard for movement, two inputs that never contend.  A phone has
 * one surface for both, so the screen is split -- left thumb walks, right
 * thumb looks -- and the two are tracked by `pointerId` so that neither
 * thumb can steal the other's gesture.  This is the only scheme that works
 * one-handed *and* two-handed, which matters because the same build is
 * played in both.
 *
 * Three decisions worth stating:
 *
 * The stick has no fixed home.  It appears wherever the left thumb lands,
 * because a thumb cannot see the screen it is covering and a fixed stick
 * means constantly re-finding it.  Only the drag from that point is read.
 *
 * Run is the outer ring of the stick rather than a button.  There is no
 * Shift to hold, and a toggle is a mode -- pushing the stick further to go
 * faster is the one mapping nobody has to be told.
 *
 * A tap in the look zone interacts with whatever was tapped, not with
 * whatever is under the crosshair.  On a mouse the crosshair *is* the
 * pointer; on a touchscreen the finger is, and asking someone to aim a
 * crosshair by dragging and then press a separate button is two gestures
 * for what should be one.  The button stays for the crosshair case, because
 * some things are easier to walk up to than to hit.
 * ------------------------------------------------------------------ */

const STICK_R = 54;        // px of drag for full deflection
const DEAD = 0.16;         // fraction of the radius that reads as centre
const RUN_AT = 0.82;       // deflection past which the walk becomes a run
const TAP_MS = 280;        // held longer than this and it was a drag
const TAP_SLOP = 14;       // moved further than this and it was a drag

const SENS_KEY = 'sakura-crossing-look-sensitivity';

export function createTouchControls() {
  const el = (tag, cls, parent, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    (parent || document.body).appendChild(n);
    return n;
  };

  const root = el('div', 'touch');
  const moveZone = el('div', 'touch-zone touch-move', root);
  const lookZone = el('div', 'touch-zone touch-look', root);

  const stick = el('div', 'stick', root);
  stick.innerHTML = '<i class="stick-base"></i><i class="stick-top"></i>';
  const stickTop = stick.querySelector('.stick-top');

  const pad = el('div', 'touch-pad', root);
  const btnInteract = el('button', 'tbtn tbtn-main', pad,
    '<span class="tbtn-glyph">◎</span><span class="tbtn-label">見る</span>');
  const row = el('div', 'tbtn-row', pad);
  const btnBike = el('button', 'tbtn', row, '<span class="tbtn-glyph">🛵</span>');
  const btnPlanet = el('button', 'tbtn', row, '<span class="tbtn-glyph">◐</span>');
  const btnMusic = el('button', 'tbtn', row, '<span class="tbtn-glyph">♪</span>');
  const btnMenu = el('button', 'tbtn tbtn-menu', root, '<span class="tbtn-glyph">‖</span>');

  btnInteract.setAttribute('aria-label', 'Interact');
  btnBike.setAttribute('aria-label', 'E-bike');
  btnPlanet.setAttribute('aria-label', 'Orbit view');
  btnMusic.setAttribute('aria-label', 'Music');
  btnMenu.setAttribute('aria-label', 'Pause');

  let sensitivity = 0.0060;
  try {
    const saved = Number(localStorage.getItem(SENS_KEY));
    if (Number.isFinite(saved) && saved > 0) sensitivity = Math.max(0.002, Math.min(0.014, saved));
  } catch { /* storage is optional */ }

  const state = {
    fwd: 0, side: 0, run: false,
    lookX: 0, lookY: 0,
    movePointer: null, lookPointer: null,
    origin: { x: 0, y: 0 },
    tap: { t: 0, x: 0, y: 0, moved: 0 },
    last: { x: 0, y: 0 },
    active: false,
    riding: false,
    prompt: '見る',
    ready: false,
  };

  const api = {
    el: root,
    onTap: null,
    onButton: null,
    get fwd() { return state.fwd; },
    get side() { return state.side; },
    get run() { return state.run; },
    get sensitivity() { return sensitivity; },
    set sensitivity(v) {
      sensitivity = Math.max(0.002, Math.min(0.014, v));
      try { localStorage.setItem(SENS_KEY, String(sensitivity)); } catch { /* optional */ }
    },
    /** Look accumulates between frames and is drained by the player. */
    takeLook() {
      const out = { dx: state.lookX, dy: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return out;
    },
    setVisible(on) {
      state.active = on;
      root.classList.toggle('on', on);
      if (!on) release();
    },
    /**
     * The interact button mirrors the crosshair prompt.
     *
     * Called every frame, so it compares before it writes: setting
     * `textContent` unconditionally would dirty the layout sixty times a
     * second to store the string that is already there.
     */
    setPrompt(label) {
      const next = state.riding
        ? '降りる'
        : (label ? label.replace(/^.*?(?:\s+·\s+|\s+E\s+)/, '').slice(0, 12) : '見る');
      const ready = state.riding || !!label;
      if (next !== state.prompt) {
        state.prompt = next;
        btnInteract.querySelector('.tbtn-label').textContent = next;
      }
      if (ready !== state.ready) {
        state.ready = ready;
        btnInteract.classList.toggle('ready', ready);
      }
    },
    setRiding(on) {
      state.riding = on;
      btnBike.classList.toggle('active', on);
      // re-derive the button's caption under the new state
      api.setPrompt('');
    },
    setMuted(on) { btnMusic.classList.toggle('off', on); },
    setPlanetView(on) { btnPlanet.classList.toggle('active', on); },
  };

  function release() {
    state.movePointer = null;
    state.lookPointer = null;
    state.fwd = 0;
    state.side = 0;
    state.run = false;
    stick.classList.remove('on');
  }

  /* ------------------------------- the stick ------------------------------- */
  function stickTo(x, y) {
    let dx = x - state.origin.x;
    let dy = y - state.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) {
      dx *= STICK_R / len;
      dy *= STICK_R / len;
    }
    stickTop.style.transform = `translate(${dx}px, ${dy}px)`;

    const mag = Math.min(len, STICK_R) / STICK_R;
    if (mag < DEAD) {
      state.fwd = 0;
      state.side = 0;
      state.run = false;
      stick.classList.remove('running');
      return;
    }
    // rescale past the deadzone so the first millimetre of travel is not lost
    const k = ((mag - DEAD) / (1 - DEAD)) / Math.max(mag, 1e-4);
    state.fwd = (-dy / STICK_R) * k;
    state.side = (dx / STICK_R) * k;
    state.run = mag > RUN_AT;
    stick.classList.toggle('running', state.run);
  }

  moveZone.addEventListener('pointerdown', (e) => {
    if (!state.active || state.movePointer !== null) return;
    e.preventDefault();
    state.movePointer = e.pointerId;
    state.origin.x = e.clientX;
    state.origin.y = e.clientY;
    stick.style.left = `${e.clientX}px`;
    stick.style.top = `${e.clientY}px`;
    stick.classList.add('on');
    stickTop.style.transform = 'translate(0px, 0px)';
    moveZone.setPointerCapture(e.pointerId);
  });

  moveZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== state.movePointer) return;
    e.preventDefault();
    stickTo(e.clientX, e.clientY);
  });

  const endMove = (e) => {
    if (e.pointerId !== state.movePointer) return;
    state.movePointer = null;
    state.fwd = 0;
    state.side = 0;
    state.run = false;
    stick.classList.remove('on', 'running');
  };
  moveZone.addEventListener('pointerup', endMove);
  moveZone.addEventListener('pointercancel', endMove);

  /* -------------------------------- the look -------------------------------- */
  lookZone.addEventListener('pointerdown', (e) => {
    if (!state.active || state.lookPointer !== null) return;
    e.preventDefault();
    state.lookPointer = e.pointerId;
    state.tap.t = performance.now();
    state.tap.x = e.clientX;
    state.tap.y = e.clientY;
    state.tap.moved = 0;
    state.last.x = e.clientX;
    state.last.y = e.clientY;
    lookZone.setPointerCapture(e.pointerId);
  });

  lookZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== state.lookPointer) return;
    e.preventDefault();
    /* `movementX` is unreliable on iOS Safari, so the delta is differenced
     * from the last position this pointer reported instead. */
    const lx = e.clientX - state.last.x;
    const ly = e.clientY - state.last.y;
    state.last.x = e.clientX;
    state.last.y = e.clientY;
    state.lookX += lx;
    state.lookY += ly;
    state.tap.moved += Math.abs(lx) + Math.abs(ly);
  });

  const endLook = (e) => {
    if (e.pointerId !== state.lookPointer) return;
    const held = performance.now() - state.tap.t;
    const wasTap = held < TAP_MS && state.tap.moved < TAP_SLOP;
    state.lookPointer = null;
    if (wasTap) api.onTap?.(e.clientX, e.clientY);
  };
  lookZone.addEventListener('pointerup', endLook);
  lookZone.addEventListener('pointercancel', (e) => {
    if (e.pointerId === state.lookPointer) state.lookPointer = null;
  });

  /* -------------------------------- buttons -------------------------------- */
  const wire = (node, name) => {
    // pointerup rather than click: a click on iOS waits out the double-tap
    // window, and a 300 ms interact button feels broken
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      node.classList.add('down');
    });
    const fire = (e) => {
      e.preventDefault();
      e.stopPropagation();
      node.classList.remove('down');
      api.onButton?.(name);
    };
    node.addEventListener('pointerup', fire);
    node.addEventListener('pointercancel', () => node.classList.remove('down'));
  };
  wire(btnInteract, 'interact');
  wire(btnBike, 'bike');
  wire(btnPlanet, 'planet');
  wire(btnMusic, 'music');
  wire(btnMenu, 'menu');

  window.addEventListener('blur', release);

  return api;
}

/** Screen point -> normalised device coordinates, for the tap ray. */
export function toNDC(clientX, clientY, out) {
  out.x = (clientX / window.innerWidth) * 2 - 1;
  out.y = -(clientY / window.innerHeight) * 2 + 1;
  return out;
}
