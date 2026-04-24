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

export const FIELD_VERTEX_SHADER = `
precision highp float;

attribute float aAlpha;
attribute float aIndex;
attribute float aSelection;
// Per-particle category tag baked by field-attribute-baker.ts —
// 0 = paper, 1 = entity, 2 = relation, 3 = evidence (ambient background).
// Resolves which category floor this particle uses; no color segmenting.
attribute float aBucket;

attribute float aStreamFreq;
attribute float aFunnelNarrow;
attribute float aFunnelThickness;
attribute float aFunnelStartShift;
attribute float aFunnelEndShift;

attribute vec3 aMove;
attribute vec3 aSpeed;
attribute vec3 aRandomness;

// Paper-mode additions (orb-field pivot, step 4), packed into a single
// vec4 attribute so the total attribute budget is identical to the
// pre-pivot shader. Some WebGL platforms expose fewer attribute slots
// than the v2 spec floor; keeping the count flat is the safest design.
//
//   aClickPack.xyz = aClickAttraction  (0,0,0) in lands-mode
//   aClickPack.w   = aSizeFactor       (1.0 in lands-mode)
//
// With these defaults the shader additions are bit-exact no-ops.
// Paper identity (paperId ↔ particleIndex) is carried on the JS side
// (usePaperAttributesBaker returns a Map), so the shader needs no
// paper-id slot.
attribute vec4 aClickPack;

uniform bool uIsMobile;
uniform float uPixelRatio;
uniform float uScale;
uniform float uTime;
uniform float uTimeFactor;

uniform float uSpeed;
uniform float uSize;
uniform float uAlpha;
uniform float uDepth;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uSelection;

// Phase A1 per-category selection floors + brighten/size boost. Each
// particle uses its aBucket tag to pick one of the four floors; any
// particle whose aSelection exceeds min(categoryFloor, uSelection) is
// culled, surviving particles get a smoothstep falloff boost in color
// and size. Defaults (floors = 1, boostColor = 1, boostSize = 1) leave
// the blob visually identical to the pre-A1 baseline.
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

// info-8 / info-9 focus-entity spotlight. Focus particle (and up to
// FOCUS_MEMBER_SLOT_COUNT member indices, typically paper context
// points) survive the cull regardless of category floor and receive a
// scalable uFocusActive boost. When uFocusEntityIndex is -1 or
// uFocusActive is 0 the focus logic is inert.
uniform int uFocusEntityIndex;
uniform int uFocusMembers[8];
uniform int uFocusMemberCount;
uniform float uFocusActive;

// Click-attraction displacement gate. 0 by default (lands-mode no-op).
// d3-force-3d writes to aClickAttraction per click and tweens this to
// 1.0 briefly; see features/field/physics/click-attraction-sim.ts (step 7).
uniform float uClickStrength;

uniform float uWidth;
uniform float uHeight;
uniform float uStream;
uniform float uFunnelStart;
uniform float uFunnelEnd;
uniform float uFunnelThick;
uniform float uFunnelNarrow;
uniform float uFunnelStartShift;
uniform float uFunnelEndShift;
uniform float uFunnelDistortion;

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

vec3 mod289_1_0(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289_1_0(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute_1_1(vec3 x) {
  return mod289_1_0(((x * 34.0) + 1.0) * x);
}

float snoise_1_2(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,
    0.366025403784439,
    -0.577350269189626,
    0.024390243902439
  );
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289_1_0(i);
  vec3 p = permute_1_1(
    permute_1_1(i.y + vec3(0.0, i1.y, 1.0)) +
    i.x + vec3(0.0, i1.x, 1.0)
  );
  vec3 m = max(
    0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
    0.0
  );
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

vec4 permute(vec4 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float permute(float x) {
  return floor(mod(((x * 34.0) + 1.0) * x, 289.0));
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float taylorInvSqrt(float r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

vec4 grad4(float j, vec4 ip) {
  const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
  vec4 p;
  vec4 s;

  p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
  p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
  s = vec4(lessThan(p, vec4(0.0)));
  p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;

  return p;
}

float snoise(vec4 v) {
  const vec2 C = vec2(0.138196601125010504, 0.309016994374947451);

  vec4 i = floor(v + dot(v, C.yyyy));
  vec4 x0 = v - i + dot(i, C.xxxx);

  vec4 i0;
  vec3 isX = step(x0.yzw, x0.xxx);
  vec3 isYZ = step(x0.zww, x0.yyz);

  i0.x = isX.x + isX.y + isX.z;
  i0.yzw = 1.0 - isX;
  i0.y += isYZ.x + isYZ.y;
  i0.zw += 1.0 - isYZ.xy;
  i0.z += isYZ.z;
  i0.w += 1.0 - isYZ.z;

  vec4 i3 = clamp(i0, 0.0, 1.0);
  vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
  vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);

  vec4 x1 = x0 - i1 + 1.0 * C.xxxx;
  vec4 x2 = x0 - i2 + 2.0 * C.xxxx;
  vec4 x3 = x0 - i3 + 3.0 * C.xxxx;
  vec4 x4 = x0 - 1.0 + 4.0 * C.xxxx;

  i = mod(i, 289.0);
  float j0 = permute(permute(permute(permute(i.w) + i.z) + i.y) + i.x);
  vec4 j1 = permute(permute(permute(permute(
    i.w + vec4(i1.w, i2.w, i3.w, 1.0)) +
    i.z + vec4(i1.z, i2.z, i3.z, 1.0)) +
    i.y + vec4(i1.y, i2.y, i3.y, 1.0)) +
    i.x + vec4(i1.x, i2.x, i3.x, 1.0));

  vec4 ip = vec4(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0);

  vec4 p0 = grad4(j0, ip);
  vec4 p1 = grad4(j1.x, ip);
  vec4 p2 = grad4(j1.y, ip);
  vec4 p3 = grad4(j1.z, ip);
  vec4 p4 = grad4(j1.w, ip);

  vec4 norm = taylorInvSqrt(vec4(
    dot(p0, p0),
    dot(p1, p1),
    dot(p2, p2),
    dot(p3, p3)
  ));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  p4 *= taylorInvSqrt(dot(p4, p4));

  vec3 m0 = max(0.6 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
  vec2 m1 = max(0.6 - vec2(dot(x3, x3), dot(x4, x4)), 0.0);
  m0 = m0 * m0;
  m1 = m1 * m1;
  return 49.0 * (
    dot(m0 * m0, vec3(dot(p0, x0), dot(p1, x1), dot(p2, x2))) +
    dot(m1 * m1, vec2(dot(p3, x3), dot(p4, x4)))
  );
}

#define NUM_OCTAVES 5
float fbm(vec3 x) {
  float v = 0.0;
  float a = 0.5;
  vec3 shift = vec3(100.0);
  for (int i = 0; i < NUM_OCTAVES; ++i) {
    v += a * snoise(vec4(x, uTime * uTimeFactor));
    x = x * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

void main() {
  vNoise = fbm(position * (uFrequency + aStreamFreq * uStream));

  // Maze single-pair color lerp. One base + one noise hue; per-particle
  // vNoise variance (driven by aMove / uTime) gives the "waves" effect
  // when uColorNoise is tweened through a palette at runtime.
  vColor = uColorBase + clamp(vNoise, 0.0, 1.0) * 4.0 * (uColorNoise - uColorBase);

  // Light-mode ink remap: gamma-darken midtones while keeping pure palette
  // stops at full chroma — "bursts" read intense against paper instead of
  // washed-out. Clamp is required because vColor at line 229 overshoots
  // [0,1] via vNoise*4 amplification (orange stop R=3.45, magenta G=-1.79)
  // and pow(negative, …) is NaN.
  vColor = mix(vColor, pow(clamp(vColor, 0.0, 1.0), vec3(1.55)), uLightMode);

  vec3 displaced = position;
  displaced *= (1.0 + (uAmplitude * vNoise));
  displaced += vec3(
    uScale * uDepth * aMove * aSpeed * snoise_1_2(vec2(aIndex, uTime * uTimeFactor * uSpeed))
  );

  // Click-attraction displacement. aClickPack.xyz is zero in lands-mode
  // AND when no click sim is active; uClickStrength gates the fade-in/out.
  // Combined, this is a perfect zero in lands-mode.
  displaced += aClickPack.xyz * uClickStrength;

  if (uStream > 0.0) {
    displaced.x += uTime * uTimeFactor * uSpeed * uStream * 0.3;
    displaced.x = mod(displaced.x - uWidth * 0.5, uWidth) - uWidth * 0.5;

    float t = clamp((displaced.x - uFunnelStart) / (uFunnelEnd - uFunnelStart), 0.0, 1.0);
    float thickness = mix(
      uFunnelThick + aFunnelThickness,
      uFunnelNarrow + aFunnelNarrow,
      t
    );

    displaced.y += thickness * uHeight * aRandomness.y * uFunnelDistortion;
    displaced.y += (1.0 - t) * (uFunnelStartShift + aFunnelStartShift);
    displaced.y += t * (uFunnelEndShift + aFunnelEndShift);
    displaced.z += uHeight * aRandomness.z * (-1.0 * cos(displaced.x)) * uFunnelDistortion;

    mat2 rot = mat2(0.0, -1.0, 1.0, 0.0);
    if (uIsMobile) {
      displaced.xy = rot * displaced.xy;
    }
  }

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  vDistance = -mvPosition.z;
  gl_PointSize = uSize;
  gl_PointSize *= 100.0 / vDistance;
  gl_PointSize *= uPixelRatio;
  // Paper-mode per-particle size modulation. aClickPack.w (=aSizeFactor)
  // is 1.0 in lands-mode, so this multiply is a bit-exact no-op by
  // construction.
  gl_PointSize *= aClickPack.w;

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
