import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Spatial chunking for the baked world.
 *
 * The world is 19,000 meshes hanging off one group.  Three.js walks that
 * list twice a frame -- once to update matrices and once to build the
 * render list -- and both walks are per-object regardless of whether the
 * object is anywhere near the camera.  On a desktop that is a few
 * milliseconds of slack.  On a phone it is the frame.
 *
 * So after the planet bake, every child of `world.root` small enough to
 * belong to one place is reparented into a grid group, and the grid group
 * is what gets tested.  Two flags do the work, and they are different
 * flags for different walks:
 *
 *   visible = false             -> `projectObject` returns at the group and
 *                                  never sees the subtree (render list)
 *   matrixWorldAutoUpdate=false -> `updateMatrixWorld` does not recurse into
 *                                  the group at all (matrix walk)
 *
 * The second is only safe while the first is also false: nothing inside a
 * hidden chunk is being drawn, so a stale matrix cannot be seen.  Turning a
 * chunk back on restores it with one forced `updateMatrixWorld`, which is
 * what lets an animated prop inside a chunk resume correctly rather than
 * coming back frozen.
 *
 * Anything too big to belong to one place -- the planet sphere, the road,
 * the merged blossom canopies, the train -- is left in `root` and drawn
 * every frame, which is right: those are a handful of draw calls carrying
 * most of the triangles, and the triangles were never the problem.
 * ------------------------------------------------------------------ */

/** Objects with a bounding sphere bigger than this stay unchunked. */
const MAX_RADIUS = 26;

/**
 * Chunks nearer than this are never culled by the frustum, only by distance.
 *
 * The sun's shadow camera is a 68 m box around the player, so a building
 * *behind* the camera can still cast into frame.  Frustum-culling it would
 * make its shadow blink out the moment you turned your back on it, which is
 * far more obvious than the cost of drawing it.  Comfortably clear of the
 * shadow box, and everything past it is fair game.
 */
const SHADOW_KEEP = 46;

export function chunkWorld(root, { cell = 20, distance = 110 } = {}) {
  root.updateMatrixWorld(true);

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const cells = new Map();

  let chunked = 0;
  let kept = 0;

  // snapshot: the loop reparents, which mutates `root.children` underneath it
  for (const child of [...root.children]) {
    if (child.userData?.noChunk || child.name === 'train') { kept++; continue; }

    box.setFromObject(child);
    if (box.isEmpty()) { kept++; continue; }

    box.getSize(size);
    const radius = size.length() / 2;
    if (radius > MAX_RADIUS) { kept++; continue; }

    box.getCenter(centre);
    const key = `${Math.floor(centre.x / cell)},${Math.floor(centre.y / cell)},${Math.floor(centre.z / cell)}`;
    let entry = cells.get(key);
    if (!entry) {
      const group = new THREE.Group();
      group.name = `chunk:${key}`;
      group.matrixAutoUpdate = false;      // identity, and it never moves
      root.add(group);
      entry = { group, box: new THREE.Box3(), centre: new THREE.Vector3(), radius: 0, on: true };
      cells.set(key, entry);
    }
    entry.box.union(box);
    entry.group.add(child);
    chunked++;
  }

  const chunks = [...cells.values()];
  for (const c of chunks) {
    c.box.getCenter(c.centre);
    c.box.getSize(size);
    c.radius = size.length() / 2;
  }

  const frustum = new THREE.Frustum();
  const viewProj = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  let far = distance;
  let enabled = Number.isFinite(distance);
  let visibleCount = chunks.length;

  return {
    chunks,
    stats: { chunked, kept, cells: chunks.length },
    get visibleChunks() { return visibleCount; },

    setDistance(d) {
      enabled = Number.isFinite(d);
      far = d;
      if (!enabled) {
        // desktop tier: hand the world back exactly as it was built
        for (const c of chunks) {
          if (c.on) continue;
          c.on = true;
          c.group.visible = true;
          c.group.matrixWorldAutoUpdate = true;
          c.group.updateMatrixWorld(true);
        }
        visibleCount = chunks.length;
      }
    },

    /** @param camera  the camera the frame is about to be rendered from */
    update(camera) {
      if (!enabled) return;

      viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(viewProj);
      const eye = camera.position;
      visibleCount = 0;

      for (const c of chunks) {
        const d = eye.distanceTo(c.centre) - c.radius;
        let on = d < far;
        /* Beyond the shadow box the frustum can be trusted; inside it, the
         * chunk may be casting into frame from behind the camera. */
        if (on && d > SHADOW_KEEP) {
          sphere.center.copy(c.centre);
          sphere.radius = c.radius;
          on = frustum.intersectsSphere(sphere);
        }
        if (on) visibleCount++;
        if (on === c.on) continue;

        c.on = on;
        c.group.visible = on;
        c.group.matrixWorldAutoUpdate = on;
        // coming back on: refresh the whole subtree in one forced pass, so
        // anything animated inside resumes from where the world actually is
        if (on) c.group.updateMatrixWorld(true);
      }
    },
  };
}
