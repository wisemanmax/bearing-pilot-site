/* ------------------------------------------------------------------ *
 * Quality tiers and the adaptive resolution controller.
 *
 * The desktop build renders at 1.5-2x the window and pushes three
 * full-screen passes over it.  On a phone that is the whole frame budget
 * spent before a single triangle is drawn: the four passes touch every
 * pixel, so the cost is linear in resolution and nothing else about the
 * scene matters until the resolution is under control.  Hence two levers,
 * in this order:
 *
 *   1. render scale  -- adjusted every second from the measured frame time
 *   2. draw distance -- fog, camera far plane and the chunk cull, moved
 *                       together so the world *ends* where it stops being
 *                       drawn rather than being clipped in mid-air
 *
 * The tier is a starting guess (see `device.js` on why it cannot be
 * better than a guess) and the controller corrects it within a few seconds
 * of the first frame.  It also corrects it *again* when the phone throttles,
 * which is the case a fixed setting cannot cover at all.
 * ------------------------------------------------------------------ */

/**
 * `renderScale` multiplies CSS pixels, so 1.0 is one render sample per CSS
 * pixel.  On a 3x phone panel that is already a 9x saving over rendering at
 * the device pixel ratio, which is what makes any of this affordable; the
 * display's own scaler does the rest and the cel look tolerates it far
 * better than a photographic one would.
 *
 * `minScale` is not lower than 0.42 anywhere.  The ink pass samples depth
 * one texel either side of each pixel, and below about that the offsets
 * collapse onto the same texel and the line work simply stops -- at which
 * point the renderer is no longer doing the one thing it exists to do, and
 * a slideshow with lines would be the better trade.
 */
export const TIERS = {
  /* `drawDistance` is always a little *past* `fogFar`, and that ordering is
   * the whole point: anything the chunk cull removes is by then fully
   * dissolved into the haze, so it cannot be seen going.  Pulling the cull
   * inside the fog would be faster and would also put a hole in the frame
   * every time you crested a hill.
   *
   * That the distance can afford to be generous is a property of this world
   * in particular.  The planet's radius is 160 m, so from eye height the true
   * horizon is only sqrt(2Rh) -- about 23 m -- and almost everything further
   * than that has already gone over the edge of the world.  The cull that
   * actually earns its keep here is the frustum test on the chunk, which
   * takes out everything behind and beside the camera; the distance is a
   * backstop for the view from the top of the hills. */
  low: {
    renderScale: 0.80, minScale: 0.45, maxScale: 1.05, maxPixels: 0.9e6,
    shadows: false, shadowMap: 1024, shadowEvery: 3,
    fxaa: false, fogNear: 24, fogFar: 112, cameraFar: 230, drawDistance: 120,
  },
  mid: {
    renderScale: 1.15, minScale: 0.55, maxScale: 1.5, maxPixels: 1.6e6,
    shadows: true, shadowMap: 1024, shadowEvery: 2,
    fxaa: true, fogNear: 32, fogFar: 148, cameraFar: 320, drawDistance: 156,
  },
  high: {
    renderScale: 1.3, minScale: 0.65, maxScale: 1.8, maxPixels: 2.6e6,
    shadows: true, shadowMap: 1536, shadowEvery: 2,
    fxaa: true, fogNear: 40, fogFar: 184, cameraFar: 430, drawDistance: 192,
  },
  /* Unchanged from the original: the supersample, the full 600 m far plane,
   * every pass on, and no culling beyond the frustum. */
  desktop: {
    renderScale: null, minScale: 1, maxScale: 2, maxPixels: 4.6e6,
    shadows: true, shadowMap: 2048, shadowEvery: 1,
    fxaa: true, fogNear: 44, fogFar: 205, cameraFar: 600, drawDistance: Infinity,
  },
};

const ORDER = ['low', 'mid', 'high', 'desktop'];

/**
 * Frame-time driven resolution scaling.
 *
 * Two asymmetric thresholds with separate dwell times.  Dropping is fast
 * (1.1 s under 45 fps) because a stuttering frame is felt immediately;
 * climbing is slow (4 s over 72 fps) because a scale that oscillates reads
 * as the image breathing, which is worse than simply being a little soft.
 * A cooldown after every change stops the two from chasing each other.
 */
class Adaptive {
  constructor({ min, max, start, onChange }) {
    this.min = min;
    this.max = max;
    this.scale = start;
    this.onChange = onChange;
    this.ema = 16.7;
    this.slow = 0;
    this.fast = 0;
    this.cooldown = 1.5;
    this.warmup = 45;      // frames of shader compilation and JIT, ignored
    this.enabled = true;
  }

  /** @param ms  the last frame's wall time, in milliseconds */
  sample(ms) {
    if (!this.enabled) return;
    if (this.warmup > 0) { this.warmup--; return; }
    // A frame over 100 ms is a stall -- a tab wake, a GC pause, a shader
    // compile -- not a workload signal, and feeding it in drops the scale
    // for something that will not happen again.
    if (ms > 100) return;

    this.ema += (ms - this.ema) * 0.06;
    const dt = ms / 1000;

    if (this.cooldown > 0) { this.cooldown -= dt; return; }

    if (this.ema > 22) { this.slow += dt; this.fast = 0; }
    else if (this.ema < 13.5) { this.fast += dt; this.slow = 0; }
    else { this.slow = 0; this.fast = 0; }

    if (this.slow > 1.1) this._set(this.scale * 0.86);
    else if (this.fast > 4.0) this._set(this.scale * 1.07);
  }

  _set(next) {
    const clamped = Math.max(this.min, Math.min(this.max, next));
    this.slow = 0;
    this.fast = 0;
    this.cooldown = 1.5;
    if (Math.abs(clamped - this.scale) < 0.012) return;
    this.scale = clamped;
    // start the average from the target rather than the old frame time, so
    // the next decision is made on frames actually rendered at this scale
    this.ema = 16.7;
    this.onChange(clamped);
  }

  get fps() { return this.ema > 0 ? 1000 / this.ema : 0; }
}

/**
 * Wire a tier to the renderer, the scene and the pipeline.
 *
 * @param tierName  a key of `TIERS`
 * @param ctx       { renderer, scene, camera, sun, pipeline, chunks }
 */
export function createQuality(tierName, ctx) {
  const { renderer, scene, camera, sun, pipeline, chunks } = ctx;
  /* The fog object, not `scene.fog`.  The orbit view detaches the fog from
   * the scene and puts the same object back on the way down, so reading the
   * scene here would find null and reattach a stale one. */
  const fog = ctx.fog ?? scene.fog;
  let name = ORDER.includes(tierName) ? tierName : 'mid';
  let t = TIERS[name];

  /** Apply everything the tier owns except the resolution. */
  function applyTier() {
    t = TIERS[name];

    fog.near = t.fogNear;
    fog.far = t.fogFar;
    camera.far = t.cameraFar;
    camera.updateProjectionMatrix();

    /* The ink fade has to move with the fog or the two disagree: lines
     * surviving past the haze that is meant to be swallowing them is the
     * single most obvious tell that a scene has been cut down. */
    const ink = pipeline.ink.mat.uniforms;
    ink.uFadeStart.value = t.fogNear * 0.9;
    ink.uFadeEnd.value = t.fogFar * 0.48;
    ink.uFar.value = t.cameraFar;
    ink.uSkyDepth.value = t.cameraFar * 0.7;

    renderer.shadowMap.enabled = t.shadows;
    sun.castShadow = t.shadows;
    if (t.shadows && sun.shadow.mapSize.x !== t.shadowMap) {
      sun.shadow.mapSize.set(t.shadowMap, t.shadowMap);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    /* Shadows are re-rendered on a subset of frames.  The sun is pinned to
     * the player's local surface frame and the shadow camera snaps to a grid,
     * so between updates the map is stale by at most one snap step -- which is
     * invisible, and it is a whole extra scene traversal saved. */
    renderer.shadowMap.autoUpdate = t.shadowEvery <= 1;

    pipeline.enabled.fxaa = t.fxaa;
    if (chunks) chunks.setDistance(t.drawDistance);
  }

  const adaptive = new Adaptive({
    min: t.minScale,
    max: t.maxScale,
    start: t.renderScale ?? 1,
    onChange: () => ctx.onResize?.(),
  });
  adaptive.enabled = t.renderScale !== null;

  applyTier();

  let shadowTick = 0;

  return {
    get tier() { return name; },
    get settings() { return t; },
    get scale() { return adaptive.enabled ? adaptive.scale : null; },
    get fps() { return adaptive.fps; },

    setTier(next) {
      if (!ORDER.includes(next) || next === name) return;
      name = next;
      applyTier();
      adaptive.min = t.minScale;
      adaptive.max = t.maxScale;
      adaptive.enabled = t.renderScale !== null;
      adaptive.scale = Math.max(t.minScale, Math.min(t.maxScale, t.renderScale ?? 1));
      adaptive.warmup = 45;
      ctx.onResize?.();
    },

    /** Called once per rendered frame, before `pipeline.render()`. */
    frame(ms) {
      adaptive.sample(ms);
      if (t.shadowEvery > 1 && t.shadows) {
        shadowTick = (shadowTick + 1) % t.shadowEvery;
        renderer.shadowMap.needsUpdate = shadowTick === 0;
      }
    },

    /** Pause adaptation while the frame time means nothing (menus, pauses). */
    setActive(on) {
      adaptive.enabled = on && t.renderScale !== null;
      if (on) adaptive.warmup = 20;
    },
  };
}
