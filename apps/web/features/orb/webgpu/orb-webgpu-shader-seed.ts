export const ORB_WEBGPU_SHADER_SEED_WGSL = /* wgsl */ `
// One-shot GPU init for the ambient particle field. Dispatched by the
// runtime on the first non-empty upload. Positions start at their stable
// home locations; velocity.xyz starts at rest and becomes persistent
// physics state in integrateParticles.
@compute @workgroup_size(64)
fn seedAmbientGeometry(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let count = computeFrame.count;
  if (i >= count) {
    return;
  }

  let pos = homePositionForIndex(i);
  computePositions[i] = vec4f(pos, 0.0);

  let h3 = iHashToFloat(iHash(i ^ 0x68bc21ebu));
  let h4 = iHashToFloat(iHash(i ^ 0xb2a82e27u));
  let h5 = iHashToFloat(iHash(i ^ 0xc4d7a3feu));
  let h6 = iHashToFloat(iHash(i ^ 0x9747b28cu));
  let perParticleSpeed = 0.2 + h6 * 0.8;
  computeVelocities[i] = vec4f(0.0, 0.0, 0.0, perParticleSpeed);

  computeAttributes[i] = vec4f(
    0.5 + h3 * 0.1,
    0.5 + h4 * 0.1,
    0.5 + h5 * 0.05,
    0.82,
  );
}
`;
