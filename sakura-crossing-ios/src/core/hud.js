/* ------------------------------------------------------------------ *
 * Minimal HUD: a start card, a small crosshair, an interaction prompt
 * and a hint line that fades itself out.  Nothing else -- the frame is
 * the point.
 * ------------------------------------------------------------------ */

export function createHud({ volume = 0.34, touch = false } = {}) {
  const el = (tag, cls, parent, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    (parent || document.body).appendChild(n);
    return n;
  };

  const root = el('div', 'hud');
  if (touch) root.classList.add('hud-touch');

  const crosshair = el('div', 'crosshair', root);
  const prompt = el('div', 'prompt', root, '');
  const toast = el('div', 'toast', root, '');
  /* The touch hint is one line and stays one line.  It sits over the frame
   * the whole project is about, and three wrapped lines of instructions
   * across the bottom of it is a worse first impression than a player who
   * has to discover the e-bike button for themselves. */
  const hint = el('div', 'hint', root, touch
    ? `<b>Left</b> walk &nbsp;·&nbsp; <b>push further</b> run
       &nbsp;·&nbsp; <b>Right</b> look &nbsp;·&nbsp; <b>Tap</b> to interact`
    : `<b>WASD</b> walk &nbsp;·&nbsp; <b>Shift</b> run &nbsp;·&nbsp; <b>Mouse</b> look
     &nbsp;·&nbsp; <b>E</b> interact &nbsp;·&nbsp; <b>V</b> e-bike
     &nbsp;·&nbsp; <b>P</b> see the planet &nbsp;·&nbsp; <b>M</b> music
     &nbsp;·&nbsp; <b>C</b> coordinates &nbsp;·&nbsp; <b>R</b> opening view
     &nbsp;·&nbsp; <b>Esc</b> release`);

  /* Coordinate readout, off by default and toggled with C.
   *
   * It reports the *flat authoring* position, not the position on the sphere,
   * because that is the only coordinate system any of the builders, colliders
   * or camera calls use -- the planet projection is applied after everything is
   * placed.  The third line is a ready-made `__shot` argument, so a spot can be
   * quoted straight into a camera call or a bug report. */
  const coords = el('div', 'coords', root, '');
  let lastLine = '';

  const overlay = el('div', 'overlay', root);
  overlay.dataset.mode = 'start';
  overlay.innerHTML = `
    <section class="menu-panel" role="dialog" aria-labelledby="menu-title">
      <div class="menu-art" aria-hidden="true">
        <div class="art-index">Nihonmachi · 05:42 PM</div>
        <div class="art-kanji">春の日本街</div>
        <div class="crossing-mark">
          <i class="bar"></i><i class="bar"></i>
          <span class="signal"><i></i><i></i></span>
        </div>
        <div class="art-caption">
          <span>Walk slowly</span>
          <strong>桜の季節</strong>
        </div>
      </div>
      <div class="menu-copy">
        <div class="menu-kicker">
          <span class="start-only">A quiet spring walk</span>
          <span class="pause-only">Intermission · Paused</span>
        </div>
        <h1 id="menu-title">Sakura <span>Crossing</span></h1>
        <div class="menu-jp">桜踏切 <small>SAKURA CROSSING</small></div>
        <p class="menu-description start-only">
          沿着樱花盛开的日本街慢慢散步。穿过铁道、商店街与河岸，
          看一座三渲二小镇在黄昏里醒来。
        </p>
        <p class="menu-description pause-only">
          The scene is waiting where you left it. Adjust the music volume,
          then continue your walk when you're ready.
        </p>
        <div class="control-strip">
          ${touch ? `
          <span><b>左</b> Move</span>
          <span><b>右</b> Look</span>
          <span><b>Tap</b> Interact</span>
          <span><b>◎</b> Button</span>
          <span><b>🛵</b> E-Bike</span>
          <span><b>◐</b> Planet</span>
          <span><b>桜</b> Stamps</span>` : `
          <span><b>WASD</b> Move</span>
          <span><b>Mouse</b> Look</span>
          <span><b>E</b> Interact</span>
          <span><b>Shift</b> Run</span>
          <span><b>V</b> E-Bike</span>
          <span><b>M</b> Music</span>
          <span><b>C</b> Coordinates</span>`}
        </div>
        <label class="audio-control pause-only pause-stack">
          <span class="audio-head">
            <span>Background Music</span>
            <output for="music-volume">34%</output>
          </span>
          <input id="music-volume" class="volume-slider" type="range"
            min="0" max="100" step="1" value="34" aria-label="Background music volume" />
        </label>
        ${touch ? `
        <label class="audio-control look-control pause-only pause-stack">
          <span class="audio-head">
            <span>Look Sensitivity</span>
            <output for="look-sens">60%</output>
          </span>
          <input id="look-sens" class="volume-slider" type="range"
            min="20" max="140" step="1" value="60" aria-label="Look sensitivity" />
        </label>` : ''}
        <button class="menu-action" type="button">
          <span class="start-only">进入日本街</span>
          <span class="pause-only">Resume Walk</span>
          <i aria-hidden="true">→</i>
        </button>
        <div class="menu-foot">
          <span>3D scene · 2D animation spirit</span>
          <span class="start-only">${touch ? 'TAP TO BEGIN' : 'CLICK TO BEGIN'}</span>
          <span class="pause-only">${touch ? '‖ TO PAUSE' : 'ESC TO PAUSE'}</span>
        </div>
      </div>
    </section>`;

  const actionButton = overlay.querySelector('.menu-action');
  const audioControl = overlay.querySelector('.audio-control');
  const volumeSlider = audioControl.querySelector('.volume-slider');
  const volumeOutput = audioControl.querySelector('output');
  const lookControl = overlay.querySelector('.look-control');
  const lookSlider = lookControl?.querySelector('.volume-slider');
  const lookOutput = lookControl?.querySelector('output');
  const setVolumeReadout = (value) => {
    const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
    volumeSlider.value = String(percent);
    volumeSlider.style.setProperty('--volume', `${percent}%`);
    volumeOutput.value = `${percent}%`;
    volumeOutput.textContent = `${percent}%`;
    volumeSlider.setAttribute('aria-valuetext', `${percent}%`);
  };
  setVolumeReadout(volume);

  let lastPrompt = '';
  let hintTimer = 0;
  let hintVisible = true;
  let toastTimer = null;
  let coordsOn = false;
  let coordsAcc = 0;
  let startedOnce = false;

  /* The slider is in hundredths of a milliradian per pixel, which reads as a
   * percentage and lands on the same 0.0060 the touch layer defaults to. */
  const setLookReadout = (value) => {
    if (!lookSlider) return;
    const pct = Math.round(value * 10000);
    lookSlider.value = String(pct);
    lookSlider.style.setProperty('--volume', `${((pct - 20) / 1.2).toFixed(1)}%`);
    lookOutput.value = `${pct}%`;
    lookOutput.textContent = `${pct}%`;
  };

  const api = {
    root,
    overlay,
    onStart: null,
    onVolumeChange: null,
    onLookSensitivityChange: null,
    setLookSensitivity: setLookReadout,
    /** Brief centre-screen note that fades itself out. */
    flash(text, ms = 1400) {
      toast.textContent = text;
      toast.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('on'), ms);
    },
    /* Called once a frame, so it compares before it writes -- assigning the
     * string that is already there still dirties the layout. */
    setPrompt(text) {
      if (text) {
        if (text !== lastPrompt) {
          lastPrompt = text;
          prompt.textContent = text;
        }
        prompt.classList.add('on');
      } else {
        prompt.classList.remove('on');
      }
    },
    setPlanetView(on) {
      crosshair.classList.toggle('hidden', on);
    },
    setLocked(locked) {
      if (locked) startedOnce = true;
      overlay.dataset.mode = startedOnce ? 'paused' : 'start';
      overlay.classList.toggle('hidden', locked);
      overlay.setAttribute('aria-hidden', locked ? 'true' : 'false');
      crosshair.classList.toggle('on', locked);
      if (locked) {
        hintTimer = 0;
        hintVisible = true;
        hint.classList.remove('faded');
      } else if (!touch) {
        // a focus ring on a touch device is noise: there is no tab order to
        // be in the middle of, and the panel is the only thing on screen
        requestAnimationFrame(() => actionButton.focus({ preventScroll: true }));
      }
    },
    setVolume(value) {
      setVolumeReadout(value);
    },
    setMuted(muted) {
      audioControl.classList.toggle('muted', muted);
    },
    toggleHint() {
      hintVisible = !hintVisible;
      hint.classList.toggle('faded', !hintVisible);
      hintTimer = hintVisible ? 0 : 1e9;
    },
    toggleCoords() {
      coordsOn = !coordsOn;
      coords.classList.toggle('on', coordsOn);
      coordsAcc = 1e9;
      return coordsOn;
    },
    get coordsVisible() { return coordsOn; },
    /**
     * @param p  the player's flat position (x, y = ground/feet height, z)
     * @param yaw,pitch  the look direction, in the same units `__shot` takes
     */
    setCoords(p, yaw, pitch, dt = 0) {
      if (!coordsOn) return;
      // ten updates a second: at frame rate the digits are unreadable
      coordsAcc += dt;
      if (coordsAcc < 0.1) return;
      coordsAcc = 0;
      const n = (v, d = 2) => v.toFixed(d);
      // fold the yaw into (-PI, PI] so it matches what the camera calls use
      let y = yaw % (Math.PI * 2);
      if (y > Math.PI) y -= Math.PI * 2;
      if (y <= -Math.PI) y += Math.PI * 2;
      /* Which way that yaw is actually looking.
       *
       * `forward = (-sin yaw, 0, -cos yaw)`, so yaw 0 faces -z and yaw grows
       * *clockwise* through -x: the index has to count down the table, not up.
       * Counting up gets every direction except north and south exactly
       * mirrored, which is worse than having no compass at all. */
      const DIRS = ['north +z', 'north-west', 'west -x', 'south-west',
        'south -z', 'south-east', 'east +x', 'north-east'];
      const compass = DIRS[(((4 - Math.round((y / (Math.PI * 2)) * 8)) % 8) + 8) % 8];
      lastLine = `{ pos: [${n(p.x, 1)}, 0, ${n(p.z, 1)}], yaw: ${n(y)}, pitch: ${n(pitch)} }`;
      coords.innerHTML =
        `<span class="k">x</span>${n(p.x)} <span class="k">z</span>${n(p.z)} `
        + `<span class="k">y</span>${n(p.y)}<br>`
        + `<span class="k">yaw</span>${n(y)} <span class="k">pitch</span>${n(pitch)}`
        + ` <span class="d">${compass}</span><br>`
        + `<span class="s">${lastLine}</span>`
        + `<br><span class="d">click or Shift+C to copy</span>`;
    },
    /**
     * Copy the current position to the clipboard.
     *
     * Two routes because neither is reliable on its own: `navigator.clipboard`
     * needs a secure context and a user gesture, and a pointer-locked canvas
     * swallows the click.  The textarea fallback works in both cases.
     */
    copyCoords() {
      if (!lastLine) return false;
      const done = () => { api.flash('copied  ·  ' + lastLine, 2200); return true; };
      try {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(lastLine).then(done, () => api.copyFallback(lastLine));
          return true;
        }
      } catch { /* fall through to the textarea */ }
      return api.copyFallback(lastLine) ? done() : false;
    },
    copyFallback(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    },
    update(dt, locked) {
      if (!locked || !hintVisible) return;
      hintTimer += dt;
      if (hintTimer > 11) {
        hint.classList.add('faded');
        hintVisible = false;
      }
    },
  };

  actionButton.addEventListener('click', (e) => {
    e.stopPropagation();
    api.onStart?.();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target.closest('.audio-control')) return;
    api.onStart?.();
  });
  for (const control of overlay.querySelectorAll('.audio-control')) {
    for (const event of ['click', 'pointerdown', 'pointerup']) {
      control.addEventListener(event, (e) => e.stopPropagation());
    }
  }
  volumeSlider.addEventListener('input', () => {
    const next = Number(volumeSlider.value) / 100;
    setVolumeReadout(next);
    api.onVolumeChange?.(next);
  });
  lookSlider?.addEventListener('input', () => {
    const next = Number(lookSlider.value) / 10000;
    setLookReadout(next);
    api.onLookSensitivityChange?.(next);
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH') api.toggleHint();
    if (e.code === 'KeyC') {
      // Shift+C copies the position; plain C toggles the readout
      if (e.shiftKey) {
        if (coordsOn) api.copyCoords();
      } else {
        api.flash(api.toggleCoords() ? 'coordinates on' : 'coordinates off', 900);
      }
    }
  });

  // the readout is clickable too, for when the pointer is not locked
  coords.style.pointerEvents = 'auto';
  coords.style.cursor = 'copy';
  coords.addEventListener('click', (e) => {
    e.stopPropagation();
    api.copyCoords();
  });

  return api;
}
