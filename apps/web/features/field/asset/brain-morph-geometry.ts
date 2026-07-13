// Brain point cloud used as the orb->brain morph target for the delirium
// lecture. The blob's 16384 orb particles each carry a second "home" here; the
// field vertex shader mixes position -> this target on uMorph, so the same
// particles that are the landing orb flow into the shape of the brain.
//
// Ported from the WebGPU delirium prototype (the visual bar): a fibonacci
// cortical shell with anatomical deformation — fuller frontal pole, tapered
// occiput, temporal bulge, flattened base, an interhemispheric fissure groove,
// and gyral noise — plus an inner shell for volumetric depth, a cerebellum, and
// a brainstem. Built in an anatomical frame (x lateral, y superior,
// z anterior+), recentered on its centroid, then tilted into a resting 3/4
// lateral pose so the silhouette reads the moment it forms; the blob's idle
// spin sweeps it from there.
//
// Delivered to the GPU as a float texture (see field-morph-target-texture),
// NOT a vertex attribute — the field shader is already at the WebGL
// MAX_VERTEX_ATTRIBS budget (see field-particle-state-texture for the same
// reasoning).

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// mulberry32 — matches the registry's deterministic rng so the brain is stable
// across builds without depending on the blob's attribute-bake stream.
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic value noise for organic gyral displacement on the surface.
function brainNoise3(x: number, y: number, z: number): number {
  return (
    (Math.sin(x * 3.1 + z * 1.7) * Math.cos(y * 2.9 - z * 1.3) +
      0.55 * Math.sin(y * 5.3 - x * 2.1) * Math.cos(z * 4.7 + x * 1.1) +
      0.3 * Math.sin(x * 8.4 + y * 3.3) * Math.cos(z * 7.9 - y * 2.2)) /
    1.85
  );
}

// Emits EXACTLY `count` xyz points (count*3 floats) so it maps one-to-one onto
// the blob's particles. Sized to roughly match the blob sphere's extent so the
// blob's own baseScale renders the brain at the orb's on-screen size.
export function buildBrainMorphTarget(
  count: number,
  seed = 0x2b1a,
): Float32Array {
  const random = createRng(seed);
  const out = new Float32Array(count * 3);
  let w = 0;
  const push = (x: number, y: number, z: number) => {
    out[w] = x;
    out[w + 1] = y;
    out[w + 2] = z;
    w += 3;
  };

  // Proportion the shells to hit `count` exactly (surface takes the remainder).
  const cerebellumCount = Math.round(count * 0.092);
  const brainstemCount = Math.round(count * 0.038);
  const innerCount = Math.round(count * 0.118);
  const surfaceCount = count - cerebellumCount - brainstemCount - innerCount;

  // Triangular weight peaking at the middle of [a, b], 0 outside — used to
  // localize anatomical features (temporal lobe, sylvian fissure) to a band.
  const tent = (v: number, a: number, b: number) => {
    const mid = (a + b) / 2;
    const half = (b - a) / 2;
    return Math.max(0, 1 - Math.abs(v - mid) / half);
  };

  // Cerebral shell. The base is an ellipsoid LONGER front-to-back than it is
  // wide or tall (a real brain's defining proportion — the old build was wider
  // than long, which read as a ball). Sculpted for the lateral silhouette:
  // tapered/drooping occiput, full frontal pole, a temporal lobe that projects
  // down-and-forward, a carved sylvian fissure above it, a flat base, and the
  // dorsal interhemispheric groove.
  const pushSurface = (n: number, seedBias: number, radial: number) => {
    for (let i = 0; i < n; i += 1) {
      const uy = 1 - (i / (n - 1)) * 2;
      const rr = Math.sqrt(Math.max(0, 1 - uy * uy));
      const th = GOLDEN_ANGLE * i;
      const ux = Math.cos(th) * rr;
      const uz = Math.sin(th) * rr;
      let x = ux * 1.02 * radial; // lateral (half-width)
      let y = uy * 0.92 * radial; // superior-inferior
      let z = uz * 1.42 * radial; // anterior(+)-posterior(-), the LONG axis
      // occipital pole (posterior): taper the width, extend to a blunt point,
      // and droop it downward so the back reads as the occipital lobe.
      if (z < 0) {
        const o = Math.min(1, -z / 1.42);
        x *= 1 - 0.3 * o;
        z *= 1 + 0.05 * o;
        y -= 0.1 * o * o;
        y *= 1 - 0.05 * o;
      }
      // frontal pole (anterior): narrow slightly and lift the orbital
      // undersurface so the front rounds off instead of hanging square.
      if (z > 0) {
        const f = Math.min(1, z / 1.42);
        x *= 1 - 0.05 * f;
        if (y < -0.05) y += 0.05 * f;
      }
      // temporal lobe: an anterior-inferior-lateral mass that projects down and
      // forward — the feature that most makes a lateral view read as a brain.
      const temporal =
        tent(z, -0.25, 0.8) * Math.min(1, Math.max(0, (0.08 - y) / 0.5));
      x *= 1 + 0.2 * temporal;
      y -= 0.1 * temporal;
      z += 0.06 * temporal;
      // sylvian fissure: a cleft riding just above the temporal lobe, carved by
      // pulling the lateral surface inward along a horizontal-ish band.
      const sylvian =
        Math.exp(-Math.pow((y - 0.03) / 0.07, 2)) * tent(z, -0.1, 0.75);
      x *= 1 - 0.16 * sylvian;
      // flat base (the brain sits on a flat skull base)
      if (y < -0.33) y = -0.33 + (y + 0.33) * 0.48;
      const nz = brainNoise3(ux * 3.2 + seedBias, uy * 3.2, uz * 3.2 + seedBias);
      const disp = 1 + 0.045 * nz;
      x *= disp;
      y *= disp;
      z *= disp;
      // interhemispheric fissure: press the dorsal midline down into a groove
      if (y > 0.18 && Math.abs(x) < 0.13) y -= 0.055 * (1 - Math.abs(x) / 0.13);
      push(x, y, z);
    }
  };

  pushSurface(surfaceCount, 0, 1);
  pushSurface(innerCount, 3.1, 0.83); // inner shell for volumetric depth

  // cerebellum: a compact, foliated mass tucked below and behind the occipital
  // lobe (posterior-inferior), separated from the cerebrum by the flat base.
  for (let c = 0; c < cerebellumCount; c += 1) {
    const uy = 1 - (c / Math.max(1, cerebellumCount - 1)) * 2;
    const rr = Math.sqrt(Math.max(0, 1 - uy * uy));
    const th = GOLDEN_ANGLE * c;
    const ux = Math.cos(th) * rr;
    const uz = Math.sin(th) * rr;
    const nz = brainNoise3(ux * 11 + 7, uy * 11, uz * 11 + 7);
    push(
      ux * 0.34 * (1 + 0.05 * nz),
      -0.58 + uy * 0.26 * (1 + 0.05 * nz),
      -0.95 + uz * 0.32 * (1 + 0.05 * nz),
    );
  }

  // brainstem: a tapering stalk that descends anterior to the cerebellum
  for (let s = 0; s < brainstemCount; s += 1) {
    const t = s / Math.max(1, brainstemCount - 1);
    const ang = random() * Math.PI * 2;
    const rad = (0.13 - 0.06 * t) * (0.7 + 0.5 * random());
    push(
      Math.cos(ang) * rad,
      -0.34 - t * 0.72,
      -0.14 - 0.14 * t + Math.sin(ang) * rad,
    );
  }

  // Recenter on the centroid so the blob's origin-anchored rotation spins the
  // brain about its own middle, then bake a resting 3/4 lateral pose. The long
  // (anterior-posterior) axis is z, so a ~77deg yaw swings it to near-horizontal
  // with the lateral surface toward the camera; a small nose-down pitch reads
  // as a slight look-from-above. The blob's idle spin sweeps it from here.
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < count; i += 1) {
    cx += out[i * 3]!;
    cy += out[i * 3 + 1]!;
    cz += out[i * 3 + 2]!;
  }
  cx /= count;
  cy /= count;
  cz /= count;
  const yaw = -1.35;
  const pitch = 0.12;
  const cyaw = Math.cos(yaw);
  const syaw = Math.sin(yaw);
  const cpit = Math.cos(pitch);
  const spit = Math.sin(pitch);
  for (let i = 0; i < count; i += 1) {
    const x = out[i * 3]! - cx;
    const y = out[i * 3 + 1]! - cy;
    const z = out[i * 3 + 2]! - cz;
    const x1 = x * cyaw + z * syaw;
    const z1 = -x * syaw + z * cyaw;
    const y2 = y * cpit - z1 * spit;
    const z2 = y * spit + z1 * cpit;
    out[i * 3] = x1;
    out[i * 3 + 1] = y2;
    out[i * 3 + 2] = z2;
  }

  return out;
}
