# WebGPU Orb Visual Parity Plan

Status: active M7 continuation, updated 2026-04-28.

This plan tracks the visual-parity work for the raw WebGPU orb runtime on
`/graph`. The runtime contract is settled: the field/orb product path is
WebGPU-only, the particle core owns its canvas/device/frame graph, and the
2D Cosmograph lens remains a separate M8 dependency decision.

## Target

Match the legacy landing/Maze orb feel without preserving the WebGL runtime:

- cyan base points;
- stochastic warm/teal/pink color pulses that move through the globe;
- 5-octave simplex FBM motion;
- feathered Maze particle sprite halos;
- 1.4s intro depth settling;
- slow positive-Y ambient rotation with drag grace and selection pause;
- front-slab depth fade plus Fresnel rim so the globe reads as a sphere.

## Native WebGPU Contract

- Particle state lives in WebGPU storage buffers.
- Display uses instanced billboards, not WebGPU `Points`.
- Color, displacement, sprite sampling, picking, and readback are WGSL/WebGPU
  paths.
- The runtime uses one `GPUDevice`, one canvas context, one command encoder
  path, and one presentation owner.
- Historical WebGL screenshots and the current landing field are references
  only. They are not runtime compatibility targets.

## Implemented In This Pass

- Shared landing constants were extracted to
  `apps/web/features/field/shared/landing-feel-constants.ts`.
- A pure TypeScript simplex/FBM oracle was added at
  `apps/web/features/field/shared/simplex-spec.ts`, with golden tests.
- The WebGPU shader now uses GPU-side palette interpolation instead of
  runtime CPU color interpolation.
- The hand-rolled warm/teal accent injection was removed from the orb shader.
- The shader now uses a WGSL 2D/4D simplex implementation and 5-octave FBM.
- Particle sprites sample `/research/maze-particle.png` via a WebGPU texture
  and linear sampler.
- Intro depth boost now follows the landing 1.4s / 2.6x settle envelope.
- Rotation is controlled by a WebGPU-native state machine using the shared
  landing rotation constants.
- Picking and rectangle selection now dispatch in parallel workgroups with
  atomic results and tiny staging readback.
- Frame uniforms are preallocated, and the render pass uses a cached render
  bundle for the static billboard draw.

## Remaining Acceptance Work

- Add browser-side screenshot/histogram checks against the landing field at
  fixed palette times.
- Add a motion soak metric for 60s radial-amplitude RMS against the landing
  field.
- Verify WebGPU Compat mode on Chrome where available.
- Decide whether display-state storage reads need to become vertex attributes
  for stricter Compat-mode devices.
- Run a real Chrome Performance trace and pin steady-state allocation,
  one-submit-per-frame, and pick-dispatch timings.

## Out Of Scope

- WebGL2 fallback.
- Three.js `WebGPURenderer`.
- Cosmograph replacement.
- Scroll/chapter envelopes for the landing narrative.
- Maze stream/funnel motion.
- Replacing the legacy landing field runtime in this pass.
