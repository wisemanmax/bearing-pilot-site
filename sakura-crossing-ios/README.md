# Sakura Crossing — iOS

An iOS port of [Kenton-GMI/sakura-crossing](https://github.com/Kenton-GMI/sakura-crossing):
an explorable Japanese suburban railway crossing, rendered in 3D and drawn to
look like a hand-painted 2D anime background. Six districts on a 160 m planet,
a train that circles the equator, and not one image asset in `src/` — every
surface, sign and cherry tree is generated in code.

This directory is the upstream project with a mobile layer added. Upstream is
MIT-licensed and its `LICENSE` is kept alongside this file.

---

## What the port adds

The original is a desktop first-person walk: pointer lock, WASD, and a
renderer that supersamples to 1.5–2× the window and pushes three full-screen
passes over the result. None of those three things survive contact with a
phone. The port replaces each, and leaves the world itself completely alone —
no district, prop or shader in `src/world/` was touched.

### Controls — `src/mobile/touch.js`

Two thumbs, split at 44% of the screen.

| | |
|---|---|
| **Left half** | Walk. The stick appears wherever your thumb lands rather than sitting in a fixed corner, because a thumb cannot see the screen it is covering. |
| **Push past 82%** | Run. Not a button and not a toggle — pushing the stick further to go faster is the one mapping nobody has to be told. |
| **Right half** | Look. Drag to turn. |
| **Tap anything** | Interact with *what you tapped*, not with what the crosshair is on. A tap that lands on nothing falls through to the crosshair, so tapping while stood in front of a vending machine still buys the drink. |
| **◎** | Interact with the crosshair target. Dimmed until something is in reach, which is how you find out there is anything here to press. |
| **🛵 ◐ ♪ ‖** | E-bike, orbit view, music, pause. |

An iPad with a keyboard attached keeps WASD as well; the two inputs are
merged by magnitude rather than summed, so a half-pushed stick and a held
**W** do not make 1.5.

### Performance — `src/mobile/quality.js`, `src/mobile/chunker.js`, `src/core/post.js`

Four changes, in descending order of what they were worth:

1. **The whole chain renders in CSS pixels, not device pixels** — canvas
   backing store included, with the display's own scaler doing the final
   upscale. On a 3× phone panel that alone is most of the win. The exact
   scale is not a setting: a controller measures frame time and moves it,
   dropping fast (1.1 s under 45 fps) and climbing slowly (4 s over 72 fps).
   This is the only approach that works on a platform that will not identify
   its own GPU — iOS has reported `"Apple GPU"` from
   `WEBGL_debug_renderer_info` since iOS 15 — and it is also the only one
   that survives thermal throttling ten minutes in.

2. **Ink and grade are fused into one pass.** The grade consumed exactly what
   the ink produced, at the same pixel; the intermediate half-float target
   existed only to hand it straight back, so it is not allocated at all.
   Three full-screen passes become two — one on the low tier, where FXAA is
   off too.

3. **The world is spatially chunked.** 19,000 meshes hang off one group and
   three.js walks that list twice a frame regardless of where the camera is.
   After the planet bake, every object small enough to belong to one place is
   reparented into a grid cell, and the cell is what gets tested — `visible`
   for the render list, `matrixWorldAutoUpdate` for the matrix walk. Cells
   inside the sun's shadow box are never frustum-culled, only distance-culled,
   because a building behind you still casts into frame. The cull that earns
   its keep here is the frustum one: the planet's radius is 160 m, so the
   true horizon is about 23 m away and the world has largely gone over the
   edge before any distance limit is reached.

4. **Shadows** drop to 1024 and update every second frame on mid, and switch
   off entirely on low.

Fog, camera far plane and cull distance move together per tier, with the cull
always a little *past* the point the fog has finished dissolving things, so
the world ends where it stops being drawn rather than being clipped in
mid-air. The ink fade moves with them too — line work surviving past the haze
that is meant to be swallowing it is the most obvious tell that a scene has
been cut down.

### The game — `src/mobile/stamps.js`

The original is a place, not a game: twenty-odd things respond and none of
them are counted. A phone is played in shorter sittings, so the port adds
the thing every Japanese railway does in spring anyway — a **スタンプラリー**.
Find something that responds, get a stamp, keep the book between sessions.

It is strictly additive. Nothing gates a door, blocks a route or fails.
Delete the module and the walk is unchanged.

### iOS plumbing — `src/mobile/ios.js`

The list of things Safari on a phone does that a desktop browser does not,
each of which breaks a full-screen canvas its own way: `innerHeight` lying
while the URL bar retracts (sized from `visualViewport` instead), pinch and
double-tap zoom, document rubber-band, the screen sleeping during a long
look, and — the one that matters — **iOS reclaiming the WebGL context** when
the app is backgrounded, which otherwise returns you to a blank canvas with
no error anywhere.

---

## Running it

```sh
npm install
npm run dev        # dev server with HMR on :5178
npm run play       # production build, served on :5179
```

Node 20+ — that is Capacitor 8's floor; the web build alone is happy on 18.
It must be served over HTTP — ES modules do not load from `file://`.

To play on a phone on the same network, bind the dev server to your LAN
address (`npm run dev -- --host`) and open it from Safari. Safari needs
**HTTPS or localhost** for the wake lock and the service worker; everything
else works over plain HTTP.

### Which path am I on?

The desktop path is the original behaviour, unchanged: pointer lock, no
chunk culling, no fused pass, no resolution scaling. Selection is on
`pointer: coarse` and `maxTouchPoints`, not on the user agent — see
`src/mobile/device.js`. From the console, `__scene.tier` and `__scene.touch`
report which you got, and `__scene.quality.fps` and `__scene.chunks.stats`
report what it is costing.

---

## Shipping to iOS

Two routes. Both serve the same `dist/`.

### Home screen (no App Store)

Already done — `manifest.webmanifest`, an `apple-touch-icon`, a
`black-translucent` status bar and a cache-first service worker. Open the
built site in Safari, **Share → Add to Home Screen**, and it launches
full-screen with no browser chrome and works offline after the first play.

### Native app (App Store)

The web build is wrapped with [Capacitor](https://capacitorjs.com). The
native project is generated rather than committed, because the Xcode
project, `Podfile.lock` and signing config are machine-specific.

```sh
npm install
npm run ios:init      # generates ios/ from the Capacitor template — once
npm run ios:sync      # builds the web app and copies it into ios/
npm run ios:open      # opens the workspace in Xcode
```

`ios:init` and `ios:sync` need **macOS with Xcode and CocoaPods** —
`cap add ios` runs `pod install`. Everything before that point (`npm run
build`, the smoke test, the icons) runs anywhere.

In Xcode, before archiving:

- Set your team and bundle identifier. The placeholder is
  `com.sakuracrossing.app` in `capacitor.config.json`; change it there and
  re-run `ios:sync` rather than editing it in Xcode alone.
- **Deployment info → Device Orientation**: landscape left and right only.
  The game shows a "turn your phone" notice in portrait, but the App Store
  build should simply not rotate there.
- **Status bar**: hidden. `Info.plist` →
  `UIViewControllerBasedStatusBarAppearance = NO`,
  `UIStatusBarHidden = YES`.
- Drop `public/icons/icon-1024.png` into the asset catalog's App Icon slot;
  Xcode generates the rest of the set from it.

Optional hardening: the app loads nothing from the network, so it can be
locked to app-bound domains — add `WKAppBoundDomains` to `Info.plist` and set
`ios.limitsNavigationsToAppBoundDomains` in `capacitor.config.json`. It is
left off by default because turning it on *without* the `Info.plist` key
gives you a webview that refuses to load anything, which is a confusing way
to find out about a security setting.

The app makes no network requests, collects nothing and has no accounts, so
App Privacy is "Data Not Collected". The bundled music track is credited
below.

---

## Tooling

```sh
npm run icons      # regenerate the app icons
npm run smoke      # headless mobile smoke test against a running preview
```

`tools/make-icons.mjs` draws the icon set with a small software rasteriser
and a PNG encoder over `zlib` — in the same spirit as the rest of the
project, and so that building the app never depends on an image toolchain
being installed.

`tools/smoke.mjs` drives a build in a touch-emulated Playwright context and
checks the things a port can silently get wrong: that the scene renders at
all, that the chunker did not eat the world, that the stick moves the player,
that a tap collects a stamp, and that the console is clean.

```sh
npm run play &
npm run smoke
```

---

## Layout

```
src/
  main.js            entry point; desktop and touch paths both start here
  core/              renderer, pipeline, player, HUD, materials  (upstream)
    post.js          + the fused ink+grade pass, + render-scale sizing
    player.js        + touch input source, + tap ray-picking
    hud.js           + touch copy and the look-sensitivity control
  world/             the town, untouched                         (upstream)
  mobile/            everything the port adds
    device.js        platform detection and the starting tier
    quality.js       tier table + adaptive resolution controller
    chunker.js       spatial culling of the baked scene graph
    touch.js         the two-thumb control scheme
    stamps.js        スタンプラリー
    notices.js       portrait and lost-context notices
    ios.js           viewport, gestures, wake lock, context loss
    mobile.css       the touch HUD
tools/
  make-icons.mjs     app icon generator
  smoke.mjs          headless mobile smoke test
```

---

## Credits

The world, the renderer and the 3D-to-2D technique are by
[Kenton-GMI](https://github.com/Kenton-GMI/sakura-crossing), MIT licensed —
see `LICENSE`. The mobile layer in `src/mobile/`, the changes marked above in
`src/core/`, and `tools/` are this port.

Music: *Divine Sakura Garden* by BFC Music, in `public/audio/`.
