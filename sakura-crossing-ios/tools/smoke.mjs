/* ------------------------------------------------------------------ *
 * Headless smoke test.
 *
 * Drives a build in a touch-emulated mobile context and checks the things
 * a port can silently get wrong: that the scene renders at all, that the
 * chunker did not eat the world, that the stick moves the player, that a
 * tap interacts, and that the frame is not full of console errors.
 *
 *   node tools/smoke.mjs [url]
 * ------------------------------------------------------------------ */

import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = process.argv[2] || 'http://127.0.0.1:5179/';
const SHOTS = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.shots');
mkdirSync(SHOTS, { recursive: true });

const fail = [];
const check = (ok, what, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${detail ? `  -- ${detail}` : ''}`);
  if (!ok) fail.push(what);
};

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

// an iPhone-shaped, touch-first context: the port's whole point
const context = await browser.newContext({
  ...devices['iPhone 13 landscape'],
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
/* Software rasteriser: a screenshot has to wait for a frame, and a frame of
 * 1.7 million triangles without a GPU is not a 30-second proposition. */
page.setDefaultTimeout(120000);

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

console.log(`\nloading ${URL}`);
await page.goto(URL, { waitUntil: 'load', timeout: 120000 });

// the world build is synchronous and long; wait for the scene handle
await page.waitForFunction(() => !!window.__scene, null, { timeout: 180000 });
const size = page.viewportSize();
console.log(`viewport ${size.width}x${size.height}`);

/* ------------------------------ the basics ------------------------------ */
const info = await page.evaluate(() => {
  const s = window.__scene;
  return {
    touch: s.touch,
    tier: s.tier,
    stats: s.chunks.stats,
    interactables: s.world.interactables.length,
    stampTotal: s.stamps?.total ?? 0,
    fused: s.pipeline.fused,
    renderScale: s.pipeline.scale,
    canvas: [s.renderer.domElement.width, s.renderer.domElement.height],
    hasControls: !!s.controls,
  };
});
console.log(JSON.stringify(info, null, 2));

check(info.touch === true, 'touch path selected on a mobile context');
check(info.hasControls, 'touch controls constructed');
check(info.fused === true, 'ink+grade pass fused');
check(info.stats.chunked > 1000, 'world chunked', `${info.stats.chunked} objects in ${info.stats.cells} cells`);
check(info.interactables > 5, 'interactables present', `${info.interactables}`);
check(info.stampTotal > 5, 'stamp book populated', `${info.stampTotal} entries`);
check(info.canvas[0] < size.width * 2, 'canvas backing store scaled down', `${info.canvas.join('x')}`);

/* --------------------------- start and render --------------------------- */
await page.locator('.menu-action').click();
await page.waitForTimeout(1200);
await page.screenshot({ timeout: 120000, path: resolve(SHOTS, 'ios-01-start.png') });

const locked = await page.evaluate(() => window.__scene.player.locked);
check(locked === true, 'player active after tapping through the title card');

const controlsVisible = await page.locator('.touch').evaluate((n) => getComputedStyle(n).visibility);
check(controlsVisible === 'visible', 'touch controls shown once playing');

/* Is anything actually being drawn?
 *
 * Not via `drawImage` off the canvas: the context is created without
 * `preserveDrawingBuffer`, so the back buffer is gone by the time anything
 * outside the frame callback looks at it, and the copy comes back black on a
 * perfectly healthy renderer.  Render once and read the pixels back in the
 * same turn instead, which is the only point at which they exist. */
const painted = await page.evaluate(() => {
  const s = window.__scene;
  s.pipeline.render();
  const gl = s.renderer.getContext();
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let min = 255, max = 0, sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const l = (px[i] + px[i + 1] + px[i + 2]) / 3;
    if (l < min) min = l;
    if (l > max) max = l;
    sum += l;
  }
  return { min, max, mean: sum / (px.length / 4) };
});
check(painted.max - painted.min > 40, 'canvas has a rendered image',
  `luma ${painted.min.toFixed(0)}..${painted.max.toFixed(0)}, mean ${painted.mean.toFixed(0)}`);

/* ------------------------------ the stick ------------------------------ */
const before = await page.evaluate(() => ({ ...window.__scene.player.pos }));
// drag the left thumb forward and hold it there
const stickX = Math.round(size.width * 0.18);
const stickY = Math.round(size.height * 0.62);
await page.touchscreen.tap(1, 1).catch(() => {});
await page.mouse.move(stickX, stickY);
await page.mouse.down();
await page.mouse.move(stickX, stickY - 60, { steps: 6 });
await page.waitForTimeout(1400);
const stick = await page.evaluate(() => ({
  fwd: window.__scene.controls.fwd,
  run: window.__scene.controls.run,
  onScreen: document.querySelector('.stick').classList.contains('on'),
  speed: Math.hypot(window.__scene.player.vel.x, window.__scene.player.vel.z),
}));
await page.mouse.up();
const after = await page.evaluate(() => ({ ...window.__scene.player.pos }));

check(stick.onScreen, 'stick appears where the thumb landed');
check(stick.fwd > 0.6, 'stick reads forward', `fwd ${stick.fwd.toFixed(2)}`);
check(stick.run === true, 'full deflection reads as a run');
/* Speed rather than distance covered.  This runs on a software rasteriser
 * at a few frames a second, and `dt` is clamped to 1/20 s per frame, so wall
 * time says nothing about how much of the simulation actually ran. */
check(stick.speed > 2.8, 'player is running', `${stick.speed.toFixed(2)} m/s, walk is 2.55`);
const moved = Math.hypot(after.x - before.x, after.z - before.z);
check(moved > 0.05, 'player position advanced', `${moved.toFixed(2)} m`);

const released = await page.evaluate(() => window.__scene.controls.fwd);
check(released === 0, 'stick releases cleanly');

/* ------------------------------- the look ------------------------------- */
const yaw0 = await page.evaluate(() => window.__scene.player.yaw);
const lookX = Math.round(size.width * 0.72);
const lookY = Math.round(size.height * 0.5);
await page.mouse.move(lookX, lookY);
await page.mouse.down();
await page.mouse.move(lookX - 160, lookY, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(200);
const yaw1 = await page.evaluate(() => window.__scene.player.yaw);
check(Math.abs(yaw1 - yaw0) > 0.4, 'drag turns the view', `Δyaw ${(yaw1 - yaw0).toFixed(2)}`);

/* --------------------------- tap to interact --------------------------- */
const stamped = await page.evaluate(() => {
  const s = window.__scene;
  const T = s.THREE;

  /* Stand in front of a real interactable rather than at remembered
   * coordinates: every hitbox is baked onto the planet, so its authored
   * (x, z) is not where it is in world space.  Take the first one's world
   * position, put the camera a body's width back along the local surface,
   * and aim at it.
   *
   * Everything below runs in one synchronous turn on purpose -- the frame
   * loop re-seats the camera from the player every frame, so an `await`
   * anywhere in here would undo the setup before the pick. */
  const target = s.world.interactables[0];
  const centre = new T.Box3().setFromObject(target.hitbox).getCenter(new T.Vector3());
  const up = centre.clone().sub(s.CENTER).normalize();
  const tangent = new T.Vector3().crossVectors(up, new T.Vector3(0, 0, 1)).normalize();

  s.camera.position.copy(centre).addScaledVector(tangent, 1.5);
  s.camera.up.copy(up);
  s.camera.lookAt(centre);

  const viaCrosshair = s.player.pick(s.world.interactables);
  const viaTap = s.player.pickAt(new T.Vector2(0, 0), s.world.interactables);

  const before = s.stamps.count;
  if (viaTap) s.player.onInteract(viaTap);
  return {
    label: target.label,
    crosshair: viaCrosshair?.label ?? null,
    tap: viaTap?.label ?? null,
    before,
    after: s.stamps.count,
  };
});
check(stamped.crosshair === stamped.label, 'crosshair finds the interactable it is aimed at',
  `${stamped.crosshair ?? 'nothing'} (wanted ${stamped.label})`);
check(stamped.tap === stamped.label, 'a tap ray finds the same thing the crosshair does',
  `${stamped.tap ?? 'nothing'}`);
check(stamped.after === stamped.before + 1, 'interacting collects a stamp',
  `${stamped.before} -> ${stamped.after}`);

const pillText = await page.locator('.stamp-count').textContent();
check(/^\d+\/\d+$/.test(pillText.trim()), 'stamp pill reads', pillText.trim());

const toast = await page.evaluate(() => {
  const n = document.querySelector('.stamp-toast');
  return { on: n.classList.contains('on'), text: n.textContent.trim() };
});
check(toast.on && toast.text.includes('スタンプ'), 'stamp toast names the find', toast.text);

// the book itself: the entry that was just collected must have stopped
// being a row of question marks
const bookRow = await page.evaluate(() => {
  const got = document.querySelector('.stamp-list li.got');
  return got ? got.querySelector('b').textContent : null;
});
check(!!bookRow && bookRow !== '???', 'stamp book shows the collected entry', bookRow ?? 'none');

/* --------------------------- buttons and pause --------------------------- */
await page.locator('.tbtn-menu').dispatchEvent('pointerdown');
await page.locator('.tbtn-menu').dispatchEvent('pointerup');
await page.waitForTimeout(600);
const paused = await page.evaluate(() => ({
  locked: window.__scene.player.locked,
  overlay: document.querySelector('.overlay').classList.contains('hidden'),
  mode: document.querySelector('.overlay').dataset.mode,
}));
check(paused.locked === false && !paused.overlay, 'menu button pauses', `mode ${paused.mode}`);
await page.screenshot({ timeout: 120000, path: resolve(SHOTS, 'ios-02-pause.png') });

await page.locator('.menu-action').click();
await page.waitForTimeout(400);

/* ------------------------------ orbit view ------------------------------ */
const planetBtn = page.locator('.tbtn-row .tbtn').nth(1);
await planetBtn.dispatchEvent('pointerdown');
await planetBtn.dispatchEvent('pointerup');
await page.waitForTimeout(1400);
/* Orbit sits three planet radii out, past every cull distance there is, so
 * the whole grid has to be switched back on or the globe comes back bare. */
const orbitDrawn = await page.evaluate(() => ({
  visible: window.__scene.chunks.visibleChunks,
  total: window.__scene.chunks.stats.cells,
}));
check(orbitDrawn.visible === orbitDrawn.total, 'orbit view keeps the world drawn',
  `${orbitDrawn.visible}/${orbitDrawn.total} chunks`);
await page.screenshot({ timeout: 120000, path: resolve(SHOTS, 'ios-03-orbit.png') });
await planetBtn.dispatchEvent('pointerdown');
await planetBtn.dispatchEvent('pointerup');
await page.waitForTimeout(900);
await page.screenshot({ timeout: 120000, path: resolve(SHOTS, 'ios-04-street.png') });

/* ------------------------------- portrait -------------------------------
 *
 * Chromium's mobile emulation resizes the page without telling it: changing
 * the viewport over CDP fires neither `resize` nor an `(orientation:
 * portrait)` media-query change, both of which a real device sends.  So the
 * *state* is checked against the browser (does it agree the page is now
 * portrait?) and the event a device would have sent is dispatched by hand.
 * Everything downstream of that event is the shipping code path. */
async function rotate(width, height) {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(700);
  return page.evaluate(() => ({
    browserSaysPortrait: matchMedia('(orientation: portrait)').matches,
    noticeOn: document.querySelector('.notice').classList.contains('on'),
  }));
}

const upright = await rotate(size.height, size.width);
check(upright.browserSaysPortrait, 'browser reports portrait after the rotation');
check(upright.noticeOn, 'portrait notice appears');

const back = await rotate(size.width, size.height);
check(!back.browserSaysPortrait, 'browser reports landscape again');
check(!back.noticeOn, 'portrait notice clears on rotate back');

/* -------------------------------- errors -------------------------------- */
const real = errors.filter((e) => !/favicon|Download the React|sw\.js/i.test(e));
check(real.length === 0, 'no console errors', real.slice(0, 4).join(' | '));

await browser.close();

console.log(`\n${fail.length ? `FAILED: ${fail.join(', ')}` : 'all checks passed'}\n`);
process.exit(fail.length ? 1 : 0);
