// Single knob: target resident orb particle count. Drives:
//  - DuckDB `paper_sample` reservoir size (USING SAMPLE reservoir(N))
//  - WebGPU buffer allocations (clamped down only if the adapter's
//    maxStorageBufferBindingSize literally cannot fit this many)
//  - All CPU-side typed-array sizes (positions/velocities/etc.)
//  - Focus / hover / selection index validation
//
// Bumping this is the only edit needed to scale density up. The seed
// point source modulo-wraps when the requested count exceeds the
// underlying field-blob asset, so increasing this does not require
// regenerating the field assets.
export const ORB_PARTICLE_CAPACITY = 1_000_000;

// Largest single per-particle storage buffer in the WebGPU pipeline:
// the DisplayParticle struct (vec4 center + vec4 color + vec2 effects,
// padded to 48 bytes by WGSL alignment). The gate uses this to compute
// whether the adapter's storage-buffer binding limit can hold
// ORB_PARTICLE_CAPACITY particles, falling back to the largest count
// that fits if not.
export const ORB_PARTICLE_DISPLAY_BYTES = 48;

// Orb-local override for landing's BLOB_FREQUENCY (0.5).
//
// Higher frequency = smaller, more numerous color regions. At 1M
// density landing's 0.5 puts ~0.7 wavelengths across the orb — one
// big warm blob with speckly hot particles. 0.8 gives ~1.1
// wavelengths — multiple distinct burst clusters, which reads as
// "many bursts" rather than "one tinted region."
export const ORB_BLOB_FREQUENCY = 0.8;

// Orb-local override for landing's BLOB_AMPLITUDE (0.05).
//
// Landing renders its FBM-driven radial breathing as sub-pixel particle
// dots in a wide-camera context — at that framing, ±5% radial swing
// reads as gentle field shimmer. The orb fills most of the canvas at
// 1M density with BLOB_RADIUS=1.40, so the same 0.05 amplitude reads
// as the entire orb pulsating in/out (the user-reported regression).
//
// 0.02 keeps a soft breathing rhythm without dominating perception, so
// per-particle directional drift (motion.xyz × speed × depth ×
// liveDrift) becomes the visible motion lane instead — the Maze/landing
// "flowing particles" feel.
export const ORB_BLOB_AMPLITUDE = 0.02;
