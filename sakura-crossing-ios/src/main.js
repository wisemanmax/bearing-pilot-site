import * as THREE from 'three';
import { PAL } from './core/palette.js';
import { Pipeline } from './core/post.js';
import { buildSky } from './core/sky.js';
import { R, CENTER, basisAt, positionAt } from './world/planet.js';
import { setOutlineResolution } from './core/outline.js';
import { Player } from './core/player.js';
import { createHud } from './core/hud.js';
import { createMusic } from './core/audio.js';
import { buildWorld } from './world/index.js';
import { createEbike } from './world/ebike.js';

import './mobile/mobile.css';
import {
  isTouchDevice, isIOS, isNativeShell, guessTier, isPortrait, portraitQuery,
} from './mobile/device.js';
import { createQuality, TIERS } from './mobile/quality.js';
import { chunkWorld } from './mobile/chunker.js';
import { createTouchControls, toNDC } from './mobile/touch.js';
import { createStamps } from './mobile/stamps.js';
import { createNotices } from './mobile/notices.js';
import { installIOS } from './mobile/ios.js';

/* ------------------------------------------------------------------ *
 * Sakura Crossing -- entry point, iOS build.
 *
 * Lighting is the classic two-light anime setup: one warm quantised key
 * for the sun, one cool bounce fill from the opposite side, and a
 * hemisphere with a violet ground colour so nothing in shadow ever goes
 * black.  The shadow camera follows the player on a snapped grid to keep
 * cast shadows crisp without shimmering.
 *
 * What the mobile port adds, and where:
 *
 *   device.js    which platform this is, and a first guess at the GPU
 *   quality.js   the tier table and the adaptive resolution controller
 *   chunker.js   spatial culling for a 19,000-mesh scene graph
 *   touch.js     the two-thumb control scheme
 *   ios.js       viewport, gestures, wake lock, WebGL context loss
 *   stamps.js    the stamp rally, which is what makes this a game
 *
 * The desktop path through this file is the original behaviour unchanged:
 * `guessTier` returns 'desktop', which means no chunk culling, no fused
 * pass, no resolution scaling and pointer lock as before -- and the touch
 * layer is never constructed at all.
 * ------------------------------------------------------------------ */

const canvas = document.getElementById('view');
const touch = isTouchDevice;
const tier = guessTier();
const preset = TIERS[tier];

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
  stencil: false,
  /* Safari would rather refuse a context than hand back a slow one, and a
   * slow context is precisely what the adaptive scaler exists to rescue. */
  failIfMajorPerformanceCaveat: false,
});
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = preset.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(new THREE.Color(PAL.fog), 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PAL.fog, 44, 205);

const camera = new THREE.PerspectiveCamera(46, 1, 0.25, 600);
camera.rotation.order = 'YXZ';

/* --------------------------------- light --------------------------------- */
const sun = new THREE.DirectionalLight(PAL.sun, 2.25);
sun.position.set(-52, 62, 56);
sun.castShadow = true;
sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
sun.shadow.camera.left = -34;
sun.shadow.camera.right = 34;
sun.shadow.camera.top = 34;
sun.shadow.camera.bottom = -34;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
scene.add(sun);
scene.add(sun.target);

// Cool bounce from the opposite quarter.  This carries most of the shadow
// side of every surface, so it is deliberately strong: an anime background
// has *coloured* shadows, not dark ones.
const fill = new THREE.DirectionalLight(PAL.fill, 1.08);
fill.position.set(48, 26, -44);
scene.add(fill);
scene.add(fill.target);

// a second, weaker bounce from below-front stops undersides going flat black
const bounce = new THREE.DirectionalLight(0xd8cbe8, 0.34);
bounce.position.set(10, -18, 40);
scene.add(bounce);
scene.add(bounce.target);

const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.12);
scene.add(hemi);

/* --------------------------------- world --------------------------------- */
const sky = buildSky(scene, 500);
const world = buildWorld(scene);

/* Chunk the baked world.  Nothing above this line knows it happened: the
 * colliders, the height field and the interactable list all address the same
 * objects, and only their parent in the scene graph has changed. */
const chunks = chunkWorld(world.root, { distance: preset.drawDistance });

const VOLUME_STORAGE_KEY = 'sakura-crossing-volume';
let initialVolume = 0.34;
try {
  const savedValue = localStorage.getItem(VOLUME_STORAGE_KEY);
  if (savedValue !== null) {
    const savedVolume = Number(savedValue);
    if (Number.isFinite(savedVolume)) initialVolume = Math.max(0, Math.min(1, savedVolume));
  }
} catch { /* storage is optional; the game works without it */ }

const controls = touch ? createTouchControls() : null;
const player = new Player(camera, canvas, world, { touch, input: controls });

const hud = createHud({ volume: initialVolume, touch });
const music = createMusic({ volume: initialVolume, fadeIn: 3.0 });
hud.setMuted(music.muted);
const rememberVolume = () => {
  try { localStorage.setItem(VOLUME_STORAGE_KEY, String(music.volume)); } catch { /* optional */ }
};

hud.onVolumeChange = (value) => {
  hud.setMuted(music.setVolume(value));
  controls?.setMuted(music.muted);
  rememberVolume();
};

const notices = touch ? createNotices() : null;

/* ------------------------------ stamp rally ------------------------------ *
 * Snapshotted before the e-bike exists, which is why the machine is not in
 * the book: `createEbike` adds and removes its own entry as it is summoned
 * and put away, and an entry that only appears in the list once you have
 * already found the thing is not a stamp rally. */
const stamps = touch ? createStamps({ interactables: world.interactables }) : null;
if (stamps) {
  stamps.onCollect = (entry, got, total) => notices.stamp(entry.title, got, total);
  stamps.onComplete = () => notices.complete(stamps.total);
}

/* The one machine you can ride.  Built here rather than in `buildWorld`
 * because it is placed *after* the planet bake -- see the note in the file. */
const ebike = createEbike({ scene, world, player, hud });

/** Everything an interaction does, from whichever input triggered it. */
function interactWith(target) {
  // on the machine, the interact control is the way off it, whatever you
  // happen to be looking at
  if (ebike.riding) {
    ebike.dismount();
    controls?.setRiding(false);
    return;
  }
  if (!target) return;
  target.action?.();
  stamps?.collect(target.label);
  controls?.setRiding(ebike.riding);
}
player.onInteract = interactWith;

/* ------------------------------- pipeline ------------------------------- */
const pipeline = new Pipeline(renderer, scene, camera, {
  pixelBudget: preset.maxPixels,
  fused: touch,
  renderScale: preset.renderScale,
});

/* --------------------------------- iOS --------------------------------- */
let contextLost = false;

const platform = touch
  ? installIOS({
    canvas,
    onResize: () => resize(),
    onPause: () => pause(),
    onContextLost: () => {
      contextLost = true;
      notices.setContextLost(true);
    },
    onContextRestored: () => {
      contextLost = false;
      notices.setContextLost(false);
    },
  })
  : null;

function viewportSize() {
  const vv = window.visualViewport;
  return {
    w: Math.round(vv?.width ?? window.innerWidth),
    h: Math.round(vv?.height ?? window.innerHeight),
  };
}

function resize() {
  const { w, h } = touch ? viewportSize() : { w: window.innerWidth, h: window.innerHeight };
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  pipeline.setSize(w, h);
  setOutlineResolution(pipeline.size.x, pipeline.size.y);
  notices?.setPortrait(isPortrait());
}
if (!touch) window.addEventListener('resize', resize);
/* Orientation is watched on its own rather than inferred from the resize
 * that usually accompanies it.  A rotation is not always a resize -- an app
 * rotated while backgrounded comes back at the new orientation having fired
 * nothing -- and a resize is very often not a rotation. */
if (touch) {
  portraitQuery?.addEventListener('change', () => notices.setPortrait(isPortrait()));
  notices.setPortrait(isPortrait());
}
resize();

/* ------------------------------- quality ------------------------------- */
const quality = createQuality(tier, {
  renderer,
  scene,
  camera,
  sun,
  pipeline,
  chunks,
  onResize: () => {
    pipeline.renderScale = quality.scale;
    resize();
  },
});

/* --------------------------------- loop --------------------------------- */
const clock = new THREE.Clock();
const shadowTarget = new THREE.Vector3();
const sunOffset = new THREE.Vector3();
const tapNDC = new THREE.Vector2();
/** Sun direction, expressed in the player's local surface frame. */
const SUN_LOCAL = new THREE.Vector3(-52, 62, 56);
const FILL_LOCAL = new THREE.Vector3(48, 26, -44);
const BOUNCE_LOCAL = new THREE.Vector3(10, -18, 40);

/** Move a light so its direction stays fixed relative to the local surface. */
function seatLight(light, local, basis, origin) {
  sunOffset.set(0, 0, 0)
    .addScaledVector(basis.east, local.x)
    .addScaledVector(basis.up, local.y)
    .addScaledVector(basis.north, local.z);
  light.target.position.copy(origin);
  light.position.copy(origin).add(sunOffset);
}

/* ------------------------------ planet view ------------------------------ */
let planetView = false;
let orbit = 0.6;
const orbitDir = new THREE.Vector3();
const savedFog = scene.fog;

function setPlanetView(on) {
  planetView = on;
  scene.fog = on ? null : savedFog;
  camera.far = on ? 1600 : quality.settings.cameraFar;
  camera.updateProjectionMatrix();
  /* The ink pass linearises depth against the far plane, so moving the plane
   * without telling it puts every line in the wrong place -- which in orbit
   * means inking the whole globe as one silhouette. */
  pipeline.ink.mat.uniforms.uFar.value = camera.far;
  pipeline.ink.mat.uniforms.uSkyDepth.value = camera.far * 0.7;
  const s = sun.shadow.camera;
  const half = on ? R * 1.15 : 34;
  s.left = -half; s.right = half; s.top = half; s.bottom = -half;
  s.far = on ? R * 6 : 200;
  s.updateProjectionMatrix();
  hud.setPlanetView(on);
  controls?.setPlanetView(on);
  /* Orbit looks at the whole world from three planet radii out, so every
   * chunk is past the cull distance and the globe would come back empty. */
  chunks.setDistance(on ? Infinity : quality.settings.drawDistance);
}

function toggleMusic() {
  const off = music.toggle();
  hud.setMuted(off);
  hud.setVolume(music.volume);
  controls?.setMuted(off);
  rememberVolume();
  if (music.available) hud.flash(off ? '♪  music off' : '♪  music on');
}

/* -------------------------------- pausing -------------------------------- *
 * On desktop this is Esc releasing the pointer lock, and the browser tells
 * us it happened.  On a phone there is no lock to release, so pausing is
 * explicit: the ‖ button, or iOS backgrounding the app. */
function pause() {
  if (!touch || !player.locked) return;
  player.unlock();
}

hud.onStart = () => {
  music.start();
  platform?.unlock();
  player.lock();
};

player.onLockChange = (locked) => {
  hud.setLocked(locked);
  controls?.setVisible(locked);
  stamps?.setVisible(locked);
  quality.setActive(locked);
};

if (touch) {
  hud.setLookSensitivity(controls.sensitivity);
  hud.onLookSensitivityChange = (v) => { controls.sensitivity = v; };

  controls.onTap = (x, y) => {
    if (planetView) return;
    /* Tap-to-interact first, crosshair second.  A tap that landed on nothing
     * falls through to whatever the crosshair is on, so tapping in open space
     * while stood in front of a vending machine still buys the drink. */
    const hit = player.pickAt(toNDC(x, y, tapNDC), world.interactables) ?? player.hovered;
    if (hit) interactWith(hit);
  };

  controls.onButton = (name) => {
    switch (name) {
      case 'interact':
        interactWith(player.hovered);
        break;
      case 'bike':
        // in orbit the machine button is the way back down, same as V is
        if (planetView) setPlanetView(false);
        else {
          ebike.toggle();
          controls.setRiding(ebike.riding);
        }
        break;
      case 'planet': setPlanetView(!planetView); break;
      case 'music': toggleMusic(); break;
      case 'menu': pause(); break;
      default: break;
    }
  };
} else {
  canvas.addEventListener('click', () => {
    music.start();
    if (!player.locked) player.lock();
  });
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyM') toggleMusic();
  /* V summons the e-bike.  The orbit view moved to P to make room for it --
   * it is a thing you look at once, and this is a thing you use. */
  if (e.code === 'KeyV') {
    if (planetView) {
      setPlanetView(false);
      hud.flash('back on the ground');
    } else {
      ebike.toggle();
      controls?.setRiding(ebike.riding);
    }
  }
  if (e.code === 'KeyP') {
    setPlanetView(!planetView);
    hud.flash(planetView ? 'orbit view  ·  P to return' : 'back on the ground');
  }
  // two quiet toggles, handy for seeing what the ink and grade passes do
  if (e.code === 'KeyO') pipeline.enabled.ink = !pipeline.enabled.ink;
  if (e.code === 'KeyG') pipeline.enabled.grade = !pipeline.enabled.grade;
});

let lastFrame = performance.now();

function frame() {
  requestAnimationFrame(frame);

  const now = performance.now();
  const frameMs = now - lastFrame;
  lastFrame = now;

  const dt = Math.min(clock.getDelta(), 1 / 20);

  /* A lost context means there is no GPU to draw with.  The simulation is
   * stopped with it rather than run blind: coming back from the app switcher
   * a minute later to a train that has done four laps in the dark is worse
   * than coming back to where you left off. */
  if (contextLost) return;

  player.update(dt);
  ebike.update(dt);
  world.update(dt);

  if (planetView) {
    orbit += dt * 0.09;
    // biased toward +Y so the district (which sits at the flat origin, the
    // top of the globe) stays in view while the camera drifts around it
    orbitDir.set(Math.sin(orbit) * 0.8, 1.0, Math.cos(orbit) * 0.8).normalize();
    camera.position.copy(CENTER).addScaledVector(orbitDir, R * 3.3);
    camera.up.set(0, 1, 0);
    camera.lookAt(CENTER);
    // a fixed sun so the whole globe is lit coherently from outside
    sun.target.position.copy(CENTER);
    sun.position.copy(CENTER).add(new THREE.Vector3(-1.05, 0.95, 0.75).multiplyScalar(R * 2.2));
    hemi.position.set(0, 1, 0);
    seatLight(fill, FILL_LOCAL, { east: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), north: new THREE.Vector3(0, 0, 1) }, CENTER);
    bounce.visible = false;
  } else {
    bounce.visible = true;
    // Lighting is pinned to the local surface frame rather than to world
    // space: physically a cheat, but it keeps the district lit the same way
    // no matter how far round the planet you have walked.
    const b = basisAt(player.pos.x, player.pos.z);
    positionAt(player.pos.x, 0, player.pos.z, shadowTarget);
    seatLight(sun, SUN_LOCAL, b, shadowTarget);
    seatLight(fill, FILL_LOCAL, b, shadowTarget);
    seatLight(bounce, BOUNCE_LOCAL, b, shadowTarget);
    hemi.position.copy(b.up);
  }

  // the sky dome is centred on the flat origin, so it has to trail the camera
  sky.dome.position.copy(camera.position);
  sky.clouds.position.copy(camera.position);

  const hovered = !planetView && player.locked ? player.pick(world.interactables) : null;
  hud.setPrompt(hovered
    ? `${touch ? '◎' : 'E'}  ·  ${hovered.label.replace(/^.*?(?:\s+·\s+|\s+E\s+)/, '')}`
    : '');
  controls?.setPrompt(hovered ? hovered.label : '');
  hud.update(dt, player.locked);
  // flat authoring coordinates, so what the readout says is what the code uses
  hud.setCoords(player.pos, player.yaw, player.pitch, dt);

  /* The camera has to be current before the chunks are tested against it.
   * `player.update` has written the position and the quaternion, but the view
   * matrix the frustum is built from is derived from those, not stored -- and
   * the renderer does not derive it until after this point in the frame. */
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  chunks.update(camera);

  quality.frame(frameMs);
  pipeline.render();
}
frame();

// expose a little for tuning from the console
window.__scene = {
  scene, camera, renderer, pipeline, world, player, ebike, music, hud, sun, fill, bounce, hemi,
  chunks, quality, stamps, controls, tier, touch, isIOS, THREE,
  // the planet frame, so a console session can work in world space
  CENTER, R,
};
window.__setOutlineRes = setOutlineResolution;

/* Offline support, for the home-screen build only.  Inside the native shell
 * the files are already local and a worker in front of them is pure
 * overhead; in dev a cache in front of the module graph is a liability. */
if ('serviceWorker' in navigator && import.meta.env?.PROD && !isNativeShell) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* Blocked, unsupported, or served over plain http: play online. */
    });
  });
}

if (import.meta.env?.DEV) {
  /**
   * Dev capture: render one frame at a fixed size and post it to the dev
   * server, so framing and colour can be reviewed outside the browser.
   */
  window.__shot = async (name = 'shot', W = 1600, H = 900, opts = {}) => {
    if (opts.pos) player.pos.set(opts.pos[0], player.pos.y, opts.pos[2]);
    if (opts.y !== undefined) player.pos.y = opts.y;
    if (opts.yaw !== undefined) player.yaw = opts.yaw;
    if (opts.pitch !== undefined) player.pitch = opts.pitch;
    if (opts.orbit !== undefined) {
      // external view of the whole planet
      if (!planetView) setPlanetView(true);
      orbit = opts.orbit;
      orbitDir.set(Math.sin(orbit) * (opts.tilt ?? 0.8), 1.0, Math.cos(orbit) * (opts.tilt ?? 0.8)).normalize();
      camera.position.copy(CENTER).addScaledVector(orbitDir, R * (opts.dist ?? 3.3));
      camera.up.set(0, 1, 0);
      camera.lookAt(CENTER);
      sun.target.position.copy(CENTER);
      sun.position.copy(CENTER).add(new THREE.Vector3(-1.05, 0.95, 0.75).multiplyScalar(R * 2.2));
      hemi.position.set(0, 1, 0);
      bounce.visible = false;
    } else {
      if (planetView) setPlanetView(false);
      bounce.visible = true;
      // always resync the camera: the rAF loop is throttled when the page is
      // not compositing, so the camera cannot be assumed to match the player
      player.pos.y = world.heightAt(player.pos.x, player.pos.z);
      player.bob = 0;
      player.applyCamera(0);
    }
    if (opts.ink !== undefined) pipeline.enabled.ink = opts.ink;
    if (opts.grade !== undefined) pipeline.enabled.grade = opts.grade;
    pipeline.forceScale = opts.scale || 1;

    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    pipeline.setSize(W, H);
    setOutlineResolution(pipeline.size.x, pipeline.size.y);
    if (opts.orbit === undefined) {
      const b = basisAt(player.pos.x, player.pos.z);
      positionAt(player.pos.x, 0, player.pos.z, shadowTarget);
      seatLight(sun, SUN_LOCAL, b, shadowTarget);
      seatLight(fill, FILL_LOCAL, b, shadowTarget);
      seatLight(bounce, BOUNCE_LOCAL, b, shadowTarget);
      hemi.position.copy(b.up);
    }
    // in orbit the dome stays put so its gradient reads as a real sky
    if (!planetView) {
      sky.dome.position.copy(camera.position);
      sky.clouds.position.copy(camera.position);
    } else {
      sky.dome.position.set(0, 0, 0);
      sky.clouds.position.set(0, 0, 0);
    }
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    chunks.update(camera);
    pipeline.render();

    const off = document.createElement('canvas');
    const outW = opts.outW || W;
    off.width = outW;
    off.height = Math.round((outW * H) / W);
    off.getContext('2d').drawImage(canvas, 0, 0, off.width, off.height);
    const data = off.toDataURL('image/jpeg', opts.quality || 0.86);
    const r = await fetch('/__shot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, data }),
    });
    return r.json();
  };
}
