import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { PAL } from './palette.js';

/* ------------------------------------------------------------------ *
 * The 3D-to-2D pipeline.
 *
 *   scene  ->  rtScene (colour + depth texture)
 *          ->  ink pass      : screen-space line work from the depth buffer
 *          ->  grade pass    : anime colour grade + linear->sRGB
 *          ->  fxaa pass     : clean up the line work, straight to screen
 *
 * Lines come from a *second difference* of linearised depth.  A first
 * difference would smear ink across the road wherever the surface is
 * grazing the camera; the second difference is flat across any planar
 * surface no matter how oblique, so it only fires on real silhouettes and
 * real creases.  Positive curvature (the near side of a silhouette, a
 * convex ridge) inks strongly; negative curvature (inside corners) inks
 * faintly, which mimics the lighter contact lines an animator draws.
 * ------------------------------------------------------------------ */

const INK_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uNear: { value: 0.25 },
    uFar: { value: 600 },
    uInk: { value: new THREE.Color(PAL.ink) },
    uThickness: { value: 1.35 },
    uSens: { value: 0.0042 },
    uConcave: { value: 0.026 },
    uConcaveAmount: { value: 0.42 },
    uFadeStart: { value: 40.0 },
    uFadeEnd: { value: 98.0 },
    uStrength: { value: 1.0 },
    uSkyDepth: { value: 420.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4( position.xy, 0.0, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform float uNear, uFar;
    uniform vec3 uInk;
    uniform float uThickness, uSens, uConcave, uConcaveAmount;
    uniform float uFadeStart, uFadeEnd, uStrength, uSkyDepth;
    varying vec2 vUv;

    float linearDepth( vec2 uv ) {
      float d = texture2D( tDepth, uv ).x;
      return -perspectiveDepthToViewZ( d, uNear, uFar );
    }

    void main() {
      vec3 col = texture2D( tDiffuse, vUv ).rgb;

      vec2 t = uTexel * uThickness;
      float dc = linearDepth( vUv );

      if ( dc > uSkyDepth ) {
        // pure sky: nothing to ink
        gl_FragColor = vec4( col, 1.0 );
        return;
      }

      float dl = linearDepth( vUv - vec2( t.x, 0.0 ) );
      float dr = linearDepth( vUv + vec2( t.x, 0.0 ) );
      float du = linearDepth( vUv + vec2( 0.0, t.y ) );
      float dd = linearDepth( vUv - vec2( 0.0, t.y ) );

      // second difference of linear depth, normalised by distance
      float sx = ( dl + dr - 2.0 * dc ) / dc;
      float sy = ( du + dd - 2.0 * dc ) / dc;

      float convex  = max( 0.0,  sx ) + max( 0.0,  sy );
      float concave = max( 0.0, -sx ) + max( 0.0, -sy );

      float edge = smoothstep( uSens * 0.32, uSens, convex );
      edge = max( edge, smoothstep( uConcave, uConcave * 3.4, concave ) * uConcaveAmount );

      // let the background dissolve into the haze instead of getting busy
      edge *= 1.0 - smoothstep( uFadeStart, uFadeEnd, dc );
      edge *= uStrength;

      // ink keeps a whisper of the underlying hue so it never looks pasted on
      vec3 line = mix( uInk, col * 0.42, 0.22 );
      gl_FragColor = vec4( mix( col, line, clamp( edge, 0.0, 1.0 ) ), 1.0 );
    }
  `,
};

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uShadowTint: { value: new THREE.Color(0xada8d0) },
    uLightTint: { value: new THREE.Color(0xfff7e8) },
    uSaturation: { value: 1.12 },
    uLift: { value: 0.032 },
    uVignette: { value: 0.15 },
    uWarmth: { value: 0.05 },
  },
  vertexShader: INK_SHADER.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uShadowTint, uLightTint;
    uniform float uSaturation, uLift, uVignette, uWarmth;
    varying vec2 vUv;

    vec3 linearToSRGB( vec3 c ) {
      return mix( c * 12.92, 1.055 * pow( max( c, vec3( 0.0031308 ) ), vec3( 1.0 / 2.4 ) ) - 0.055,
                  step( 0.0031308, c ) );
    }

    void main() {
      vec3 c = texture2D( tDiffuse, vUv ).rgb;
      float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );

      // split-tone: cool violet in the darks, warm paper white in the lights
      float k = smoothstep( 0.02, 0.55, l );
      c *= mix( uShadowTint, uLightTint, k );

      // gentle overall warmth, like late afternoon light through blossom
      c += vec3( uWarmth, uWarmth * 0.45, 0.0 ) * l * 0.35;

      // keep shadows readable -- never crushed to black
      c = c + uLift * ( 1.0 - k );

      c = mix( vec3( l ), c, uSaturation );

      float r = length( vUv - 0.5 ) * 1.42;
      c *= 1.0 - uVignette * pow( clamp( r, 0.0, 1.0 ), 2.6 );

      gl_FragColor = vec4( linearToSRGB( max( c, vec3( 0.0 ) ) ), 1.0 );
    }
  `,
};

/* ------------------------------------------------------------------ *
 * Ink and grade, fused.
 *
 * The two are separate passes on desktop because that is how they were
 * developed and either can be switched off to see what it does.  On a phone
 * that separation costs a full-screen read and a full-screen write of a
 * half-float target for nothing: the grade consumes exactly what the ink
 * produced, at exactly the same pixel, so the intermediate exists only to
 * be handed straight back.
 *
 * Fusing them removes one target from the chain and turns four passes over
 * every pixel into two -- which on a fill-bound mobile GPU is close to the
 * whole optimisation.  The maths below is copied from the two shaders above
 * and must stay in step with them; anything else would be a second look.
 * ------------------------------------------------------------------ */
const INK_GRADE_SHADER = {
  uniforms: { ...INK_SHADER.uniforms, ...GRADE_SHADER.uniforms },
  vertexShader: INK_SHADER.vertexShader,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform float uNear, uFar;
    uniform vec3 uInk;
    uniform float uThickness, uSens, uConcave, uConcaveAmount;
    uniform float uFadeStart, uFadeEnd, uStrength, uSkyDepth;
    uniform vec3 uShadowTint, uLightTint;
    uniform float uSaturation, uLift, uVignette, uWarmth;
    varying vec2 vUv;

    float linearDepth( vec2 uv ) {
      float d = texture2D( tDepth, uv ).x;
      return -perspectiveDepthToViewZ( d, uNear, uFar );
    }

    vec3 linearToSRGB( vec3 c ) {
      return mix( c * 12.92, 1.055 * pow( max( c, vec3( 0.0031308 ) ), vec3( 1.0 / 2.4 ) ) - 0.055,
                  step( 0.0031308, c ) );
    }

    void main() {
      vec3 col = texture2D( tDiffuse, vUv ).rgb;

      /* ---------------------------- ink ---------------------------- */
      float dc = linearDepth( vUv );
      if ( dc <= uSkyDepth ) {
        vec2 t = uTexel * uThickness;
        float dl = linearDepth( vUv - vec2( t.x, 0.0 ) );
        float dr = linearDepth( vUv + vec2( t.x, 0.0 ) );
        float du = linearDepth( vUv + vec2( 0.0, t.y ) );
        float dd = linearDepth( vUv - vec2( 0.0, t.y ) );

        float sx = ( dl + dr - 2.0 * dc ) / dc;
        float sy = ( du + dd - 2.0 * dc ) / dc;

        float convex  = max( 0.0,  sx ) + max( 0.0,  sy );
        float concave = max( 0.0, -sx ) + max( 0.0, -sy );

        float edge = smoothstep( uSens * 0.32, uSens, convex );
        edge = max( edge, smoothstep( uConcave, uConcave * 3.4, concave ) * uConcaveAmount );
        edge *= 1.0 - smoothstep( uFadeStart, uFadeEnd, dc );
        edge *= uStrength;

        vec3 line = mix( uInk, col * 0.42, 0.22 );
        col = mix( col, line, clamp( edge, 0.0, 1.0 ) );
      }

      /* --------------------------- grade --------------------------- */
      float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      float k = smoothstep( 0.02, 0.55, l );
      col *= mix( uShadowTint, uLightTint, k );
      col += vec3( uWarmth, uWarmth * 0.45, 0.0 ) * l * 0.35;
      col = col + uLift * ( 1.0 - k );
      col = mix( vec3( l ), col, uSaturation );

      float r = length( vUv - 0.5 ) * 1.42;
      col *= 1.0 - uVignette * pow( clamp( r, 0.0, 1.0 ), 2.6 );

      gl_FragColor = vec4( linearToSRGB( max( col, vec3( 0.0 ) ) ), 1.0 );
    }
  `,
};

const FXAA_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2() },
  },
  vertexShader: INK_SHADER.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    varying vec2 vUv;

    float luma( vec3 c ) { return dot( c, vec3( 0.299, 0.587, 0.114 ) ); }

    void main() {
      vec3 cM = texture2D( tDiffuse, vUv ).rgb;
      vec3 cNW = texture2D( tDiffuse, vUv + vec2( -uTexel.x, -uTexel.y ) ).rgb;
      vec3 cNE = texture2D( tDiffuse, vUv + vec2(  uTexel.x, -uTexel.y ) ).rgb;
      vec3 cSW = texture2D( tDiffuse, vUv + vec2( -uTexel.x,  uTexel.y ) ).rgb;
      vec3 cSE = texture2D( tDiffuse, vUv + vec2(  uTexel.x,  uTexel.y ) ).rgb;

      float lM = luma( cM ), lNW = luma( cNW ), lNE = luma( cNE ),
            lSW = luma( cSW ), lSE = luma( cSE );
      float lMin = min( lM, min( min( lNW, lNE ), min( lSW, lSE ) ) );
      float lMax = max( lM, max( max( lNW, lNE ), max( lSW, lSE ) ) );

      vec2 dir = vec2(
        -( ( lNW + lNE ) - ( lSW + lSE ) ),
         ( ( lNW + lSW ) - ( lNE + lSE ) )
      );
      float reduce = max( ( lNW + lNE + lSW + lSE ) * 0.25 * 0.18, 1.0 / 128.0 );
      float rcp = 1.0 / ( min( abs( dir.x ), abs( dir.y ) ) + reduce );
      dir = clamp( dir * rcp, vec2( -8.0 ), vec2( 8.0 ) ) * uTexel;

      vec3 rgbA = 0.5 * (
        texture2D( tDiffuse, vUv + dir * ( 1.0 / 3.0 - 0.5 ) ).rgb +
        texture2D( tDiffuse, vUv + dir * ( 2.0 / 3.0 - 0.5 ) ).rgb );
      vec3 rgbB = rgbA * 0.5 + 0.25 * (
        texture2D( tDiffuse, vUv - dir * 0.5 ).rgb +
        texture2D( tDiffuse, vUv + dir * 0.5 ).rgb );

      float lB = luma( rgbB );
      gl_FragColor = vec4( ( lB < lMin || lB > lMax ) ? rgbA : rgbB, 1.0 );
    }
  `,
};

function makeQuad(def) {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(def.uniforms),
    vertexShader: def.vertexShader,
    fragmentShader: def.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  return { quad: new FullScreenQuad(mat), mat };
}

export class Pipeline {
  /**
   * @param opts.fused        one ink+grade pass instead of two -- mobile
   * @param opts.renderScale  samples per CSS pixel; when set, the canvas
   *                          backing store is sized to it too and the CSS
   *                          stretches it, so the *whole* chain including
   *                          the final blit runs at that resolution.  Null
   *                          keeps the original device-pixel supersample.
   */
  constructor(renderer, scene, camera, { pixelBudget = 4.6e6, fused = false, renderScale = null } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.pixelBudget = pixelBudget;
    this.fused = fused;
    this.renderScale = renderScale;
    this.size = new THREE.Vector2(1, 1);

    const opts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: THREE.NoColorSpace,
    };
    this.rtScene = new THREE.WebGLRenderTarget(2, 2, opts);
    this.rtScene.depthTexture = new THREE.DepthTexture(2, 2);
    this.rtScene.depthTexture.format = THREE.DepthFormat;
    this.rtScene.depthTexture.type = THREE.UnsignedIntType;
    this.rtScene.depthTexture.minFilter = THREE.NearestFilter;
    this.rtScene.depthTexture.magFilter = THREE.NearestFilter;

    /* The intermediate colour target only exists to carry ink output into
     * the grade, so the fused path does not allocate it at all -- a
     * half-float screenful of memory and bandwidth that is never touched. */
    this.rtA = this.fused ? null : new THREE.WebGLRenderTarget(2, 2, { ...opts, depthBuffer: false });
    this.rtB = new THREE.WebGLRenderTarget(2, 2, {
      ...opts, type: THREE.UnsignedByteType, depthBuffer: false,
    });

    const fxaa = makeQuad(FXAA_SHADER);
    this.fxaa = fxaa;

    if (this.fused) {
      const combo = makeQuad(INK_GRADE_SHADER);
      combo.mat.uniforms.tDepth.value = this.rtScene.depthTexture;
      this.combo = combo;
      /* `ink` names whichever material carries the ink uniforms, so that the
       * quality tiers can retune the fade and the far plane without knowing
       * or caring which path is running. */
      this.ink = combo;
      this.grade = combo;
    } else {
      const ink = makeQuad(INK_SHADER);
      ink.mat.uniforms.tDepth.value = this.rtScene.depthTexture;
      this.combo = null;
      this.ink = ink;
      this.grade = makeQuad(GRADE_SHADER);
    }

    this.enabled = { ink: true, grade: true, fxaa: true };
  }

  /**
   * Size the chain.
   *
   * Two behaviours.  With no `renderScale` this is the original: the canvas
   * is one backing-store pixel per CSS pixel and the render targets are
   * supersampled above it, which is what keeps the ink crisp on a desktop.
   *
   * With a `renderScale` -- every mobile tier -- the canvas backing store is
   * scaled *too* and the CSS box stretches it back up.  That matters because
   * the last pass writes to the canvas: leaving it at full size would put a
   * full-resolution full-screen write back into a chain that exists to avoid
   * exactly that.  The display's own scaler does the final upscale for free.
   */
  setSize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    const mobile = this.renderScale !== null && !this.forceScale;
    let scale = this.forceScale || this.renderScale || (dpr < 1.5 ? 1.5 : Math.min(dpr, 2));
    if (w * h * scale * scale > this.pixelBudget) {
      scale = Math.max(mobile ? 0.4 : 1, Math.sqrt(this.pixelBudget / (w * h)));
    }
    this.scale = scale;
    const rw = Math.max(2, Math.floor(w * scale));
    const rh = Math.max(2, Math.floor(h * scale));
    this.size.set(rw, rh);

    this.renderer.setPixelRatio(1);
    if (mobile) {
      this.renderer.setSize(rw, rh, false);
      const style = this.renderer.domElement.style;
      style.width = `${w}px`;
      style.height = `${h}px`;
    } else {
      this.renderer.setSize(w, h, true);
    }

    this.rtScene.setSize(rw, rh);
    this.rtA?.setSize(rw, rh);
    this.rtB.setSize(rw, rh);

    const texel = new THREE.Vector2(1 / rw, 1 / rh);
    this.ink.mat.uniforms.uTexel.value.copy(texel);
    this.fxaa.mat.uniforms.uTexel.value.copy(texel);
    this.ink.mat.uniforms.uNear.value = this.camera.near;
    this.ink.mat.uniforms.uFar.value = this.camera.far;
    /* Scale ink weight with resolution so lines stay ~2 device px.  Below 1x
     * the tap offset would fall under half a texel and the second difference
     * would read the same pixel four times, so the line work simply stops --
     * hence the floor rather than letting the expression go where it likes. */
    this.ink.mat.uniforms.uThickness.value = Math.max(0.85, 1.05 + 0.55 * scale);
  }

  render() {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(this.scene, this.camera);

    const last = this.enabled.fxaa ? this.rtB : null;

    if (this.fused) {
      const u = this.combo.mat.uniforms;
      u.tDiffuse.value = this.rtScene.texture;
      // no separate pass to switch off, so the toggle turns the ink down
      u.uStrength.value = this.enabled.ink ? 1 : 0;
      r.setRenderTarget(last);
      this.combo.quad.render(r);
    } else {
      let src = this.rtScene.texture;
      if (this.enabled.ink) {
        this.ink.mat.uniforms.tDiffuse.value = src;
        r.setRenderTarget(this.rtA);
        this.ink.quad.render(r);
        src = this.rtA.texture;
      }
      this.grade.mat.uniforms.tDiffuse.value = src;
      r.setRenderTarget(last);
      this.grade.quad.render(r);
    }

    if (this.enabled.fxaa) {
      this.fxaa.mat.uniforms.tDiffuse.value = this.rtB.texture;
      r.setRenderTarget(null);
      this.fxaa.quad.render(r);
    }
    r.setRenderTarget(null);
  }

  dispose() {
    [this.rtScene, this.rtA, this.rtB].forEach((rt) => rt?.dispose());
    const passes = this.fused ? [this.combo, this.fxaa] : [this.ink, this.grade, this.fxaa];
    for (const p of passes) {
      p.quad.dispose();
      p.mat.dispose();
    }
  }
}
