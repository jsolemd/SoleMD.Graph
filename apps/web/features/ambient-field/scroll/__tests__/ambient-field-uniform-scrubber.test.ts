import { createUniformScrubber } from "../ambient-field-uniform-scrubber";

describe("createUniformScrubber", () => {
  it("reaches ~0.5 of the target gap after one half-life", () => {
    const scrubber = createUniformScrubber<"value">({
      halfLifeMs: 1000,
      initial: { value: 0 },
    });
    const out = scrubber.step(1000, { value: 1 });
    expect(out.value).toBeCloseTo(0.5, 3);
  });

  it("reaches ~0.75 of the target gap after two half-lives", () => {
    const scrubber = createUniformScrubber<"value">({
      halfLifeMs: 1000,
      initial: { value: 0 },
    });
    scrubber.step(1000, { value: 1 });
    const out = scrubber.step(1000, { value: 1 });
    expect(out.value).toBeCloseTo(0.75, 3);
  });

  it("does not move when dtMs is 0", () => {
    const scrubber = createUniformScrubber<"a">({
      halfLifeMs: 1000,
      initial: { a: 0 },
    });
    const out = scrubber.step(0, { a: 1 });
    expect(out.a).toBe(0);
  });

  it("defaults unseen keys to their first target (no initial step movement)", () => {
    const scrubber = createUniformScrubber<"a" | "b">({ halfLifeMs: 500 });
    const out = scrubber.step(500, { a: 10, b: -5 });
    expect(out.a).toBe(10);
    expect(out.b).toBe(-5);
    // Second step with the same target is a no-op.
    const next = scrubber.step(500, { a: 10, b: -5 });
    expect(next.a).toBe(10);
    expect(next.b).toBe(-5);
  });

  it("reset() clears state when called with no arguments", () => {
    const scrubber = createUniformScrubber<"value">({
      halfLifeMs: 1000,
      initial: { value: 0 },
    });
    scrubber.step(1000, { value: 1 });
    scrubber.reset();
    // After reset, the first step defaults current to target (1) and
    // returns target unchanged on the first frame.
    const out = scrubber.step(500, { value: 1 });
    expect(out.value).toBe(1);
  });

  it("reset(partial) rewrites only the listed keys", () => {
    const scrubber = createUniformScrubber<"a" | "b">({
      halfLifeMs: 1000,
      initial: { a: 0, b: 0 },
    });
    scrubber.step(1000, { a: 1, b: 1 });
    scrubber.reset({ a: 0 });
    expect(scrubber.current().a).toBe(0);
    expect(scrubber.current().b).toBeCloseTo(0.5, 3);
  });

  it("tracks multiple keys independently with different targets each step", () => {
    const scrubber = createUniformScrubber<"x" | "y">({
      halfLifeMs: 1000,
      initial: { x: 0, y: 0 },
    });
    scrubber.step(500, { x: 1, y: -1 });
    const after = scrubber.step(500, { x: 1, y: 0 });
    expect(after.x).toBeGreaterThan(after.y);
    expect(after.x).toBeGreaterThan(0);
    expect(after.y).toBeLessThan(0);
  });
});
