const F2 = 0.366025403784439;
const G2 = 0.211324865405187;
const G22 = -0.577350269189626;
const INV_41 = 0.024390243902439;
const C4_X = 0.138196601125010504;
const C4_Y = 0.309016994374947451;
const FBM_OCTAVES = 5;

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];

export function simplexNoise2(input: Vec2): number {
  const [vx, vy] = input;
  const s = (vx + vy) * F2;
  let ix = Math.floor(vx + s);
  let iy = Math.floor(vy + s);
  const t = (ix + iy) * G2;
  const x0 = vx - ix + t;
  const y0 = vy - iy + t;
  const i1x = x0 > y0 ? 1 : 0;
  const i1y = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1x + G2;
  const y1 = y0 - i1y + G2;
  const x2 = x0 + G22;
  const y2 = y0 + G22;
  ix = mod289(ix);
  iy = mod289(iy);
  const p = [
    permute(permute(iy) + ix),
    permute(permute(iy + i1y) + ix + i1x),
    permute(permute(iy + 1) + ix + 1),
  ];
  let m0 = Math.max(0.5 - (x0 * x0 + y0 * y0), 0);
  let m1 = Math.max(0.5 - (x1 * x1 + y1 * y1), 0);
  let m2 = Math.max(0.5 - (x2 * x2 + y2 * y2), 0);
  m0 *= m0;
  m1 *= m1;
  m2 *= m2;
  m0 *= m0;
  m1 *= m1;
  m2 *= m2;
  const x = p.map((value) => 2 * fract(value * INV_41) - 1);
  const h = x.map((value) => Math.abs(value) - 0.5);
  const ox = x.map((value) => Math.floor(value + 0.5));
  const a0 = x.map((value, index) => value - ox[index]!);
  m0 *= 1.79284291400159 - 0.85373472095314 * (a0[0]! * a0[0]! + h[0]! * h[0]!);
  m1 *= 1.79284291400159 - 0.85373472095314 * (a0[1]! * a0[1]! + h[1]! * h[1]!);
  m2 *= 1.79284291400159 - 0.85373472095314 * (a0[2]! * a0[2]! + h[2]! * h[2]!);
  return (
    130 *
    (m0 * (a0[0]! * x0 + h[0]! * y0) +
      m1 * (a0[1]! * x1 + h[1]! * y1) +
      m2 * (a0[2]! * x2 + h[2]! * y2))
  );
}

export function simplexNoise4(input: Vec4): number {
  const [vx, vy, vz, vw] = input;
  let ix = Math.floor(vx + (vx + vy + vz + vw) * C4_Y);
  let iy = Math.floor(vy + (vx + vy + vz + vw) * C4_Y);
  let iz = Math.floor(vz + (vx + vy + vz + vw) * C4_Y);
  let iw = Math.floor(vw + (vx + vy + vz + vw) * C4_Y);
  const dotI = (ix + iy + iz + iw) * C4_X;
  const x0: Vec4 = [vx - ix + dotI, vy - iy + dotI, vz - iz + dotI, vw - iw + dotI];

  const isX: Vec3 = [
    step(x0[1], x0[0]),
    step(x0[2], x0[0]),
    step(x0[3], x0[0]),
  ];
  const isYZ: Vec3 = [
    step(x0[2], x0[1]),
    step(x0[3], x0[1]),
    step(x0[3], x0[2]),
  ];
  const i0 = [
    isX[0] + isX[1] + isX[2],
    1 - isX[0] + isYZ[0] + isYZ[1],
    1 - isX[1] + 1 - isYZ[0] + isYZ[2],
    1 - isX[2] + 1 - isYZ[1] + 1 - isYZ[2],
  ] as const;
  const i3 = i0.map((value) => clamp(value, 0, 1)) as unknown as Vec4;
  const i2 = i0.map((value) => clamp(value - 1, 0, 1)) as unknown as Vec4;
  const i1 = i0.map((value) => clamp(value - 2, 0, 1)) as unknown as Vec4;
  const x1 = subAdd(x0, i1, C4_X);
  const x2 = subAdd(x0, i2, 2 * C4_X);
  const x3 = subAdd(x0, i3, 3 * C4_X);
  const x4: Vec4 = [x0[0] - 1 + 4 * C4_X, x0[1] - 1 + 4 * C4_X, x0[2] - 1 + 4 * C4_X, x0[3] - 1 + 4 * C4_X];

  ix = mod289(ix);
  iy = mod289(iy);
  iz = mod289(iz);
  iw = mod289(iw);
  const j0 = permute(permute(permute(permute(iw) + iz) + iy) + ix);
  const j1 = [
    permute(permute(permute(permute(iw + i1[3]) + iz + i1[2]) + iy + i1[1]) + ix + i1[0]),
    permute(permute(permute(permute(iw + i2[3]) + iz + i2[2]) + iy + i2[1]) + ix + i2[0]),
    permute(permute(permute(permute(iw + i3[3]) + iz + i3[2]) + iy + i3[1]) + ix + i3[0]),
    permute(permute(permute(permute(iw + 1) + iz + 1) + iy + 1) + ix + 1),
  ] as const;
  const ip: Vec4 = [1 / 294, 1 / 49, 1 / 7, 0];
  const p0 = grad4(j0, ip);
  const p1 = grad4(j1[0], ip);
  const p2 = grad4(j1[1], ip);
  const p3 = grad4(j1[2], ip);
  const p4 = grad4(j1[3], ip);
  const norm = [
    taylorInvSqrt(dot4(p0, p0)),
    taylorInvSqrt(dot4(p1, p1)),
    taylorInvSqrt(dot4(p2, p2)),
    taylorInvSqrt(dot4(p3, p3)),
  ] as const;
  const np0 = mul4(p0, norm[0]);
  const np1 = mul4(p1, norm[1]);
  const np2 = mul4(p2, norm[2]);
  const np3 = mul4(p3, norm[3]);
  const np4 = mul4(p4, taylorInvSqrt(dot4(p4, p4)));
  let m00 = Math.max(0.6 - dot4(x0, x0), 0);
  let m01 = Math.max(0.6 - dot4(x1, x1), 0);
  let m02 = Math.max(0.6 - dot4(x2, x2), 0);
  let m10 = Math.max(0.6 - dot4(x3, x3), 0);
  let m11 = Math.max(0.6 - dot4(x4, x4), 0);
  m00 *= m00;
  m01 *= m01;
  m02 *= m02;
  m10 *= m10;
  m11 *= m11;
  return (
    49 *
    (m00 * m00 * dot4(np0, x0) +
      m01 * m01 * dot4(np1, x1) +
      m02 * m02 * dot4(np2, x2) +
      m10 * m10 * dot4(np3, x3) +
      m11 * m11 * dot4(np4, x4))
  );
}

export function simplexFbm3(position: Vec3, time: number): number {
  let x = position[0];
  let y = position[1];
  let z = position[2];
  let value = 0;
  let amplitude = 0.5;
  for (let octave = 0; octave < FBM_OCTAVES; octave += 1) {
    value += amplitude * simplexNoise4([x, y, z, time]);
    x = x * 2 + 100;
    y = y * 2 + 100;
    z = z * 2 + 100;
    amplitude *= 0.5;
  }
  return value;
}

function grad4(j: number, ip: Vec4): Vec4 {
  const px = Math.floor(fract(j * ip[0]) * 7) * ip[2] - 1;
  const py = Math.floor(fract(j * ip[1]) * 7) * ip[2] - 1;
  const pz = Math.floor(fract(j * ip[2]) * 7) * ip[2] - 1;
  const pw = 1.5 - (Math.abs(px) + Math.abs(py) + Math.abs(pz));
  const sx = px < 0 ? 1 : 0;
  const sy = py < 0 ? 1 : 0;
  const sz = pz < 0 ? 1 : 0;
  const sw = pw < 0 ? 1 : 0;
  return [
    px + (sx * 2 - 1) * sw,
    py + (sy * 2 - 1) * sw,
    pz + (sz * 2 - 1) * sw,
    pw,
  ];
}

function mod289(value: number): number {
  return value - Math.floor(value * (1 / 289)) * 289;
}

function permute(value: number): number {
  return mod289(((value * 34) + 1) * value);
}

function taylorInvSqrt(value: number): number {
  return 1.79284291400159 - 0.85373472095314 * value;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function step(edge: number, value: number): number {
  return value < edge ? 0 : 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function subAdd(a: Vec4, b: Vec4, add: number): Vec4 {
  return [a[0] - b[0] + add, a[1] - b[1] + add, a[2] - b[2] + add, a[3] - b[3] + add];
}

function mul4(a: Vec4, scalar: number): Vec4 {
  return [a[0] * scalar, a[1] * scalar, a[2] * scalar, a[3] * scalar];
}

function dot4(a: Vec4, b: Vec4): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}
