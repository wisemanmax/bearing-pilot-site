/* ------------------------------------------------------------------ *
 * What we are running on.
 *
 * Everything here is asked once, at module load, because none of it can
 * change without a reload -- except the viewport, which has its own module.
 *
 * The one thing this deliberately does *not* try to do is identify the
 * device.  iOS has reported "Apple GPU" from `WEBGL_debug_renderer_info`
 * since iOS 15 and the user agent has said "iPhone" on every iPhone ever
 * made, so there is no way to tell an iPhone 11 from an iPhone 17 Pro from
 * in here.  The starting tier below is therefore a guess that is meant to
 * be wrong, and `quality.js` measures the frame and corrects it -- which is
 * the only method that works on a platform that will not identify itself.
 * ------------------------------------------------------------------ */

const ua = navigator.userAgent || '';
const platform = navigator.platform || '';

/** iPadOS 13+ reports itself as a Mac, and is told apart by the touch count. */
export const isIOS =
  /iPad|iPhone|iPod/.test(ua) ||
  (platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);

export const isIPad =
  /iPad/.test(ua) || (platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);

/** Running from the home screen (PWA) or inside the Capacitor shell. */
export const isStandalone =
  window.navigator.standalone === true ||
  window.matchMedia?.('(display-mode: standalone)').matches === true ||
  window.matchMedia?.('(display-mode: fullscreen)').matches === true;

/** Inside the native wrapper rather than Safari. */
export const isNativeShell = !!(window.Capacitor?.isNativePlatform?.());

export const hasTouch =
  (navigator.maxTouchPoints || 0) > 0 || window.matchMedia?.('(pointer: coarse)').matches === true;

/**
 * Pointer lock is the desktop control scheme, and its absence is what
 * actually decides the input layer -- not the user agent.  iOS Safari has no
 * pointer lock at all; iPadOS 16.4+ has it but a touch device should not be
 * asking for it, so a coarse pointer vetoes it.
 */
export const hasPointerLock = !hasTouch && 'requestPointerLock' in document.documentElement;

/** Touch controls, a touch HUD, and no pointer lock. */
export const isTouchDevice = hasTouch && !hasPointerLock;

/**
 * A starting guess at how much GPU there is, refined at runtime.
 *
 * Phones start one tier below tablets because the same chip drives roughly
 * the same pixel count through a much smaller thermal envelope: a phone that
 * holds 60 fps for ninety seconds and then throttles is worse than one that
 * started lower and stayed there.
 */
export function guessTier() {
  if (!isTouchDevice) return 'desktop';
  const cores = navigator.hardwareConcurrency || 2;
  const mem = navigator.deviceMemory || 0;       // undefined on Safari
  const px = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1);

  if (cores <= 2 || (mem && mem <= 2)) return 'low';
  if (isIPad) return 'high';
  // A phone with a very tall, very dense panel is a recent one, but it is
  // also the one being asked to push the most pixels.  Middle either way.
  return px >= 2200 ? 'mid' : 'low';
}

/**
 * Landscape is the intended orientation; portrait gets a nudge, not a block.
 *
 * The media query rather than comparing `innerWidth` to `innerHeight`,
 * because the two disagree exactly when it matters: on iOS the inner
 * dimensions are mid-animation for a few hundred milliseconds either side of
 * a rotation, and a keyboard or a retracting URL bar can make a landscape
 * window taller than it is wide without the device having moved at all.
 */
export const portraitQuery = window.matchMedia?.('(orientation: portrait)') ?? null;

export function isPortrait() {
  return portraitQuery ? portraitQuery.matches : window.innerHeight > window.innerWidth;
}
