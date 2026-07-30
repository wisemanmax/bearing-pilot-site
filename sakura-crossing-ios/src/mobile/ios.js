/* ------------------------------------------------------------------ *
 * iOS platform plumbing.
 *
 * None of this is about the game.  It is the list of things Safari on a
 * phone does that a browser on a desktop does not, each of which breaks a
 * full-screen WebGL canvas in its own way:
 *
 *   - `window.innerHeight` lies while the URL bar is retracting, so the
 *     canvas is sized from `visualViewport` instead and re-sized when the
 *     bar settles.
 *   - Two fingers anywhere pinch-zooms the page, including the canvas.
 *   - A double tap zooms, which is what a quick interact tap looks like.
 *   - Dragging past the top of the page rubber-bands the whole document.
 *   - Backgrounding the app drops the WebGL context, and the page comes
 *     back to a blank canvas with no error unless it is listening.
 *   - The screen sleeps after 30 seconds of no touches, which in a game
 *     with a virtual stick means "while holding still and looking".
 *
 * `install()` handles all of it and reports the two things the game needs
 * to know about: the viewport changed, or the app went away and came back.
 * ------------------------------------------------------------------ */

export function installIOS({ canvas, onResize, onPause, onResume, onContextLost, onContextRestored }) {
  /* ------------------------------- viewport ------------------------------- */
  const vv = window.visualViewport;

  function viewport() {
    // visualViewport excludes the browser chrome that is actually overlapping
    // the page, which `innerHeight` does not while it is animating
    const w = Math.round(vv?.width ?? window.innerWidth);
    const h = Math.round(vv?.height ?? window.innerHeight);
    document.documentElement.style.setProperty('--vh', `${h}px`);
    document.documentElement.style.setProperty('--vw', `${w}px`);
    return { w, h };
  }

  let resizeTimer = 0;
  function scheduleResize() {
    viewport();
    onResize?.(viewport());
    /* The URL bar animates for about a quarter of a second and fires resize
     * throughout.  Re-sizing render targets on every one of those is a stall
     * per frame, so the intermediate sizes are taken and one settled resize
     * is done at the end. */
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => onResize?.(viewport()), 320);
  }

  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', () => setTimeout(scheduleResize, 120));
  vv?.addEventListener('resize', scheduleResize);
  vv?.addEventListener('scroll', () => { window.scrollTo(0, 0); });
  viewport();

  /* --------------------------- gestures we refuse --------------------------- */
  // pinch zoom: Safari-only events, and preventing them is the only way
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  // double-tap zoom, which is what an eager interact tap looks like
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    if (now - lastTouch < 320) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
  // rubber-band and any second finger the controls did not claim
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1 || e.target === document.body) e.preventDefault();
  }, { passive: false });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => e.preventDefault());

  /* ----------------------------- WebGL context ----------------------------- */
  let contextLost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    // without preventDefault the context is never restorable
    e.preventDefault();
    contextLost = true;
    onContextLost?.();
  }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    onContextRestored?.();
  }, false);

  /* ------------------------------- wake lock ------------------------------- */
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch { /* denied or unsupported: the screen dims, and that is all */ }
  }
  function releaseWakeLock() {
    try { wakeLock?.release(); } catch { /* already gone */ }
    wakeLock = null;
  }

  /* ------------------------------- app cycle ------------------------------- */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      releaseWakeLock();
      onPause?.();
    } else {
      requestWakeLock();
      onResume?.();
      // the URL bar is often a different height on the way back in
      scheduleResize();
    }
  });
  window.addEventListener('pagehide', () => { releaseWakeLock(); onPause?.(); });

  return {
    viewport,
    scheduleResize,
    get contextLost() { return contextLost; },
    /** Called from the first real user gesture, where iOS allows it. */
    unlock() { requestWakeLock(); },
    release: releaseWakeLock,
  };
}
