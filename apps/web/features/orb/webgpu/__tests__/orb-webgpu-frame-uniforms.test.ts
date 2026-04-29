import { OrbInteractionBurstEnvelope } from "../orb-webgpu-frame-uniforms";

describe("OrbInteractionBurstEnvelope (gesture-velocity model)", () => {
  it("stays at zero when no gesture is reported", () => {
    const envelope = new OrbInteractionBurstEnvelope();
    for (let i = 0; i < 30; i++) envelope.tick(1 / 60);
    expect(envelope.value).toBe(0);
  });

  it("does NOT saturate on a slow drag (the original bug)", () => {
    const envelope = new OrbInteractionBurstEnvelope();
    // Slight drag: 2 px/event at ROTATE_RADIANS_PER_PIXEL=0.005, both
    // axes (twist + pitch) firing per pointermove ⇒ |Δyaw|=|Δpitch|=0.01
    // each frame. Sustain for 1 second; envelope must remain well
    // under 1 — the old impulse+decay model pegged at 1 in <0.2s.
    for (let i = 0; i < 60; i++) {
      envelope.kick(0.01);
      envelope.kick(0.01);
      envelope.tick(1 / 60);
    }
    expect(envelope.value).toBeLessThan(0.6);
  });

  it("scales burst with gesture speed (slow → low, fast → high)", () => {
    const slow = new OrbInteractionBurstEnvelope();
    const fast = new OrbInteractionBurstEnvelope();
    // Run both for the same duration; only the per-frame magnitude
    // differs. After saturation the fast envelope must clearly exceed
    // the slow one.
    for (let i = 0; i < 60; i++) {
      slow.kick(0.01);
      fast.kick(0.1);
      slow.tick(1 / 60);
      fast.tick(1 / 60);
    }
    expect(fast.value).toBeGreaterThan(slow.value + 0.4);
  });

  it("saturates under a sustained fast spin", () => {
    const envelope = new OrbInteractionBurstEnvelope();
    // 0.2 rad/frame at 60fps = 12 rad/sec, well above the 5 rad/sec
    // saturation point.
    for (let i = 0; i < 30; i++) {
      envelope.kick(0.2);
      envelope.tick(1 / 60);
    }
    expect(envelope.value).toBeGreaterThan(0.95);
  });

  it("rings out after the gesture stops (long release)", () => {
    const envelope = new OrbInteractionBurstEnvelope();
    for (let i = 0; i < 30; i++) {
      envelope.kick(0.2);
      envelope.tick(1 / 60);
    }
    const peak = envelope.value;
    // Half a release-half-life later, the burst should have decayed
    // a bit but still be visibly present — that's the "ringout."
    for (let i = 0; i < 14; i++) envelope.tick(1 / 60); // ~0.23s
    expect(envelope.value).toBeLessThan(peak);
    expect(envelope.value).toBeGreaterThan(0.5);
    // After ~5 release half-lives (~2.4s), it should be essentially
    // gone — exponential decay never reaches exactly 0 unless the
    // epsilon clamp fires, so assert it has shrunk to a near-zero
    // floor rather than 0.
    for (let i = 0; i < 144; i++) envelope.tick(1 / 60);
    expect(envelope.value).toBeLessThan(0.04);
  });

  it("reset() clears both burst and pending magnitude", () => {
    const envelope = new OrbInteractionBurstEnvelope();
    envelope.kick(0.5);
    envelope.tick(1 / 60);
    envelope.kick(0.5);
    envelope.reset();
    // No pending magnitude leaks into the next tick.
    envelope.tick(1 / 60);
    expect(envelope.value).toBe(0);
  });

  it("ignores non-finite or non-positive magnitudes", () => {
    const envelope = new OrbInteractionBurstEnvelope();
    envelope.kick(0);
    envelope.kick(-0.5);
    envelope.kick(Number.NaN);
    envelope.tick(1 / 60);
    expect(envelope.value).toBe(0);
  });
});
