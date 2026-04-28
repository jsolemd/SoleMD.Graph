// Ambient-field shader — Maze-derived point pipeline. Uses Maze's single
// color-pair shape: one `uColorBase` and one `uColorNoise` (vec3 form,
// which removes Maze's `uBnoise - uGcolor` blue-channel typo by
// construction — see `index.html:2165-2172`). The per-particle lerp is
// Maze-verbatim:
//   vColor = base + clamp(vNoise, 0, 1) * 4.0 * (noise - base)
// `vNoise` already varies across the field (driven by `aMove`/`uTime`),
// so a GSAP timeline tweening `uColorNoise` through a rainbow palette
// produces rolling waves of color — different particles reach peak noise
// saturation at different moments. Source citations: Maze shader
// `index.html:2119-2393`, base material `scripts.pretty.js:42545-42595`.
//
// The motion math (attributes, uniforms, noise helpers, displacement,
// point-size) is extracted into `field-vertex-motion.glsl.ts` so the
// orb picking shader includes the exact same chunks — clicks hit pixels
// that precisely match what the user sees.

import {
  FIELD_ATTRIBUTE_DECLS,
  FIELD_DISPLACEMENT_FN,
  FIELD_NOISE_HELPERS,
  FIELD_POINT_SIZE_FN,
  FIELD_UNIFORM_DECLS,
} from "./field-vertex-motion.glsl";

export const FIELD_VERTEX_SHADER = `
precision highp float;

${FIELD_ATTRIBUTE_DECLS}

// Display-only attributes (picking does not read these).
attribute float aAlpha;
attribute float aSelection;
// 0 = paper, 1 = entity, 2 = relation, 3 = evidence (ambient background).
attribute float aBucket;

${FIELD_UNIFORM_DECLS}

// Display-only uniforms.
uniform float uAlpha;
uniform float uSelection;

// Slice 8: per-particle dynamic state texture, keyed by aIndex.
// uScopeDimEnabled gates the dim multiplier so non-orb layers
// (stream, objectFormation) skip the sampler read entirely. R lane
// = filter / timeline scope membership in [0,1] (normalized texels).
// uParticleStateTexSize is the side length in pixels (128 for the
// 16k-particle baseline). R lane = scope; G lane = focus/hover
// excitation; B lane = evidence/search pulse. Lane defaults are R=1
// and G/B/A=0, making the
// resolver-idle path a bit-exact no-op.
uniform sampler2D uParticleStateTex;
uniform float uParticleStateTexSize;
uniform float uScopeDimEnabled;
uniform float uScopeDimFloor;
uniform float uOrbFocusActive;

// Phase A1 per-category selection floors + brighten/size boost.
uniform float uPapersSelection;
uniform float uEntitiesSelection;
uniform float uRelationsSelection;
uniform float uEvidenceSelection;
uniform vec3 uSelectionBoostColor;
uniform float uSelectionBoostSize;
// info-7 cluster emergence: amplifies brightness against the existing fbm
// noise so neighborhoods read as spatial coherence rather than as hard
// category borders. 0 = off (identity), 1 = full amplification.
uniform float uClusterEmergence;

// info-8 / info-9 focus-entity spotlight.
uniform int uFocusEntityIndex;
uniform int uFocusMembers[8];
uniform int uFocusMemberCount;
uniform float uFocusActive;

// Maze single-pair color uniforms. uColorBase is fixed by the preset;
// uColorNoise is tweened at runtime (BlobController rainbow cycle).
uniform vec3 uColorBase;
uniform vec3 uColorNoise;

// 0.0 = dark paper (particles are saturated paint on black), 1.0 = light
// paper (particles become low-luminance ink dots). Maze shipped dark-only;
// SoleMD threads the computed Mantine color scheme through FieldScene.
uniform float uLightMode;

varying float vAlpha;
varying float vDistance;
varying float vNoise;
varying vec3 vColor;

${FIELD_NOISE_HELPERS}

${FIELD_DISPLACEMENT_FN}

${FIELD_POINT_SIZE_FN}

void main() {
  float noise;
  vec3 displaced = computeFieldDisplacement(noise);
  vNoise = noise;

  // Maze single-pair color lerp. One base + one noise hue; per-particle
  // vNoise variance (driven by aMove / uTime) gives the "waves" effect
  // when uColorNoise is tweened through a palette at runtime.
  vColor = uColorBase + clamp(vNoise, 0.0, 1.0) * 4.0 * (uColorNoise - uColorBase);

  // Light-mode ink remap: gamma-darken midtones while keeping pure palette
  // stops at full chroma — "bursts" read intense against paper instead of
  // washed-out. Clamp is required because vColor at the line above
  // overshoots [0,1] via vNoise*4 amplification (orange stop R=3.45,
  // magenta G=-1.79) and pow(negative, …) is NaN.
  vColor = mix(vColor, pow(clamp(vColor, 0.0, 1.0), vec3(1.55)), uLightMode);

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  vDistance = -mvPosition.z;
  gl_PointSize = computeFieldPointSize(mvPosition);

  vAlpha = uAlpha * aAlpha * (300.0 / vDistance);
  // Light-mode alpha boost: particles that were glow on black need more
  // opacity to hold against paper. All three field layers share this
  // shader under NormalBlending, so overlaps compound — 1.5 gives bursts
  // density without letting dense chapters collapse into a solid wash.
  vAlpha = mix(vAlpha, vAlpha * 1.5, uLightMode);

  // Phase A1 per-category selection + focus survival. aBucket is
  // baked as an exact float integer (0/1/2/3); the ternary chain
  // resolves each particle's category floor. Effective floor is the
  // tighter of the category floor and the legacy global uSelection so
  // the Maze-parity hotspot-beat dim continues to work untouched when
  // floors are at defaults of 1.
  float categoryFloor =
    aBucket < 0.5 ? uPapersSelection :
    aBucket < 1.5 ? uEntitiesSelection :
    aBucket < 2.5 ? uRelationsSelection :
    uEvidenceSelection;
  float effectiveFloor = min(categoryFloor, uSelection);

  int particleIndex = int(aIndex);
  bool isFocusEntity =
    (uFocusActive > 0.001) && (uFocusEntityIndex == particleIndex);
  // Constant-bounded loop (matches Three.js + GLSL ES 1.0 rules); the
  // early-detect via OR keeps the branch predictable. uFocusMemberCount
  // gates which slots are active; remaining slots hold the -1 sentinel
  // and never match a real particle index.
  bool isFocusMember = false;
  for (int mi = 0; mi < 8; mi++) {
    if (mi < uFocusMemberCount && particleIndex == uFocusMembers[mi]) {
      isFocusMember = true;
    }
  }
  isFocusMember = isFocusMember && (uFocusActive > 0.001);

  if (!isFocusEntity && !isFocusMember && aSelection > effectiveFloor) {
    vAlpha = 0.0;
  } else {
    float survivorBoost;
    if (isFocusEntity) {
      survivorBoost = uFocusActive;
    } else if (isFocusMember) {
      survivorBoost = uFocusActive * 0.6;
    } else {
      // Monotonic: strongest at deepest survivors (aSelection ~ 0),
      // zero at the cull edge. Clamped denominator keeps the divide
      // safe when a floor tweens through 0.
      survivorBoost = smoothstep(
        0.0,
        max(effectiveFloor, 0.001),
        max(effectiveFloor - aSelection, 0.0)
      );
    }
    vColor = mix(vColor, vColor * uSelectionBoostColor, survivorBoost);
    gl_PointSize *= mix(1.0, uSelectionBoostSize, survivorBoost);
  }

  // info-7 cluster emergence. vNoise already varies spatially via the
  // fbm pass above; amplifying it modulates brightness across soft
  // neighborhoods without introducing hard category-colored groups.
  vColor *= mix(1.0, 1.0 + 0.45 * (vNoise - 0.5), uClusterEmergence);

  // Slice 8: out-of-scope dim, sampled from the particle-state
  // sidecar texture. R lane carries scope membership (1 = in scope,
  // 0 = out of scope). Stream / objectFormation pass a zero gate
  // (uScopeDimEnabled = 0) so the sampler read is skipped and they
  // render unaffected. Default texture is full white, making the
  // resolver-idle path a bit-exact no-op for the orb layer too.
  if (uScopeDimEnabled > 0.5) {
    float sx = mod(aIndex, uParticleStateTexSize);
    float sy = floor(aIndex / uParticleStateTexSize);
    vec2 stateUv =
      (vec2(sx, sy) + 0.5) / uParticleStateTexSize;
    vec4 particleState = texture2D(uParticleStateTex, stateUv);
    vAlpha *= mix(uScopeDimFloor, 1.0, particleState.r);

    // Slice C: hover/click focus visualization. G carries normalized
    // excitation: hover writes ~0.5, click spotlight writes 1.0. The
    // scalar focus gate is intentionally separate because G=0 is also
    // the resolver-idle lane default; without the gate the shader cannot
    // distinguish "no focus yet" from "focus active and this particle is
    // not focused".
    float focusG = particleState.g;
    if (uOrbFocusActive > 0.001) {
      vAlpha *= mix(0.14, 1.0, focusG);
    }
    vAlpha *= mix(1.0, 1.9, focusG);
    vColor = mix(vColor, vColor * 1.25, focusG);
    gl_PointSize *= mix(1.0, 1.45, focusG);

    // Slice F: search / evidence pulse. B carries normalized intensity
    // from the latest RAG result set. This is a render-only pulse: it
    // makes answer evidence visible on the orb without mutating the
    // selection table or the current filter/timeline scope.
    float evidenceB = particleState.b;
    vAlpha *= mix(1.0, 2.2, evidenceB);
    vColor = mix(vColor, max(vColor, vec3(1.0, 0.72, 0.56)), evidenceB * 0.72);
    gl_PointSize *= mix(1.0, 1.65, evidenceB);
  }
}
`;

export const FIELD_FRAGMENT_SHADER = `
precision highp float;

varying float vAlpha;
varying vec3 vColor;

uniform sampler2D pointTexture;

void main() {
  vec4 sprite = texture2D(pointTexture, gl_PointCoord);
  vec4 color = vec4(vColor, vAlpha) * sprite;

  // SoleMD optimization over Maze (Maze always writes): discard sub-threshold
  // fragments to cut fill-rate on feathered sprite edges.
  if (color.a <= 0.01) {
    discard;
  }

  gl_FragColor = color;
}
`;
