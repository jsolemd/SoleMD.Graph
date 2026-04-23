import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Three.js r169 replaced the singular `BufferAttribute.updateRange = {...}`
 * setter with the plural `addUpdateRange` / `clearUpdateRanges` / `.updateRanges`
 * API. We pin >= 0.169 in package.json, but silent regressions can creep
 * back in if someone copies a pre-r169 snippet. This test asserts that the
 * legacy singular syntax never appears inside the orb module.
 *
 * Scope: `apps/web/features/graph/orb/**` only. Other places in the repo
 * that still use the pre-r169 idiom are out of scope for this PoC and
 * will be cleaned up when the real orb work lands.
 */

const ORB_ROOT = path.resolve(__dirname, "..");
const LEGACY_PATTERN = /\.updateRange\s*=\s*\{/;

async function walk(dir: string, acc: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, acc);
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("orb module / three.js r169+ API compatibility", () => {
  it("never uses the pre-r169 singular `.updateRange = {` setter", async () => {
    const files = await walk(ORB_ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      // Skip this very test file to avoid the regex matching itself.
      if (file.endsWith("three-api-compat.test.ts")) continue;
      const source = await fs.readFile(file, "utf8");
      if (LEGACY_PATTERN.test(source)) {
        offenders.push(path.relative(ORB_ROOT, file));
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        `Found pre-r169 \`updateRange\` usage in:\n  ${offenders.join("\n  ")}\n\n` +
          "Use `attr.clearUpdateRanges()` + `attr.addUpdateRange(start, count)` " +
          "instead. See https://github.com/mrdoob/three.js/pull/29016",
      );
    }
    expect(offenders).toEqual([]);
  });

  it("uses `addUpdateRange` at least once (GraphOrb depends on it)", async () => {
    const files = await walk(ORB_ROOT);
    let found = false;
    for (const file of files) {
      if (file.endsWith("three-api-compat.test.ts")) continue;
      const source = await fs.readFile(file, "utf8");
      if (source.includes("addUpdateRange")) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
