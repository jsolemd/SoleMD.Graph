import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  type SurfaceInventoryRow,
  surfaceInventoryDefinitions,
} from "./surface-lab-data";

const sourceRoots = ["apps/web/features", "apps/web/app"];
const ignoredPathFragments = ["/__tests__/", "/surface-lab/"];
const sourceExtensions = new Set([".ts", ".tsx"]);

async function collectSourceFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const resolved = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return collectSourceFiles(resolved);
      }

      if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name)) || entry.name.endsWith(".d.ts")) {
        return [];
      }

      return [resolved];
    }),
  );

  return nested.flat();
}

function shouldIgnoreFile(filePath: string) {
  const fileName = path.basename(filePath);
  return (
    ignoredPathFragments.some((fragment) => filePath.includes(fragment)) ||
    fileName === "index.ts" ||
    fileName === "index.tsx"
  );
}

function labelFromFile(filePath: string) {
  return path.basename(filePath, path.extname(filePath));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matcherToPattern(matcher: string) {
  if (matcher.startsWith("<")) {
    return new RegExp(`${escapeRegExp(matcher)}\\b`);
  }

  return new RegExp(`\\b${escapeRegExp(matcher)}\\b`);
}

export async function getSurfaceLabInventory(): Promise<SurfaceInventoryRow[]> {
  const cwd = process.cwd();
  const appRoot = cwd.endsWith(path.join("apps", "web"))
    ? cwd
    : path.join(cwd, "apps", "web");
  const files = (
    await Promise.all(
      sourceRoots.map((relativeRoot) =>
        collectSourceFiles(path.join(appRoot, relativeRoot.replace(/^apps\/web\//, ""))),
      ),
    )
  )
    .flat()
    .filter((filePath) => !shouldIgnoreFile(filePath));

  const fileContents = await Promise.all(
    files.map(async (filePath) => ({
      filePath,
      content: await fs.readFile(filePath, "utf8"),
    })),
  );

  return surfaceInventoryDefinitions.map((definition) => {
    const adopters = fileContents
      .filter(({ filePath, content }) => {
        if (definition.excludePaths?.some((fragment) => filePath.includes(fragment))) {
          return false;
        }

        return definition.matchers.some((matcher) => matcherToPattern(matcher).test(content));
      })
      .map(({ filePath }) => labelFromFile(filePath))
      .filter((value, index, array) => array.indexOf(value) === index)
      .sort((left, right) => left.localeCompare(right));

    return {
      primitive: definition.primitive,
      role: definition.role,
      status: definition.status,
      adopters,
      propagation: definition.propagation,
      note: definition.note,
    };
  });
}
