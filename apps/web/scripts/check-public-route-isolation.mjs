#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, "..");

const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const ignoredDirectories = new Set([
  ".next",
  "node_modules",
  "__tests__",
  "coverage",
  "dist",
  "out",
]);

const explicitPublicEntries = [
  "app/page.tsx",
  "app/about/page.tsx",
  "app/wiki/page.tsx",
  "app/lectures/page.tsx",
  "app/papers/page.tsx",
  "features/wiki/components/WikiPageView.tsx",
  "features/wiki/components/WikiGraphView.tsx",
  "features/wiki/components/WikiModuleContent.tsx",
  "features/wiki/modules/register-all.ts",
  "features/wiki/module-runtime/registry.ts",
];

const publicRouteDirectories = [
  "app/about",
  "app/wiki",
  "app/lectures",
  "app/papers",
];

const bannedRuntimePrefixes = [
  { prefix: "@cosmograph/", reason: "Cosmograph runtime package" },
  { prefix: "@duckdb/duckdb-wasm", reason: "DuckDB-WASM runtime package" },
  { prefix: "@/features/orb", reason: "private orb runtime" },
  { prefix: "features/orb", reason: "private orb runtime" },
  { prefix: "@/features/graph/cosmograph", reason: "private graph Cosmograph runtime" },
  { prefix: "features/graph/cosmograph", reason: "private graph Cosmograph runtime" },
  { prefix: "@/features/graph/duckdb", reason: "private graph DuckDB runtime" },
  { prefix: "features/graph/duckdb", reason: "private graph DuckDB runtime" },
  { prefix: "@/features/graph/orb", reason: "private graph orb runtime" },
  { prefix: "features/graph/orb", reason: "private graph orb runtime" },
];

const graphBarrelSpecifiers = new Set([
  "@/features/graph",
  "features/graph",
  "@/features/graph/index",
  "features/graph/index",
]);

function toRelative(filePath) {
  return path.relative(webRoot, filePath).split(path.sep).join("/");
}

function toAbsolute(relativePath) {
  return path.join(webRoot, relativePath);
}

function isIgnoredDirectory(name) {
  return ignoredDirectories.has(name);
}

function isSourceFile(filePath) {
  return sourceExtensions.includes(path.extname(filePath));
}

function walkFiles(root, predicate, result = []) {
  if (!fs.existsSync(root)) {
    return result;
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (isIgnoredDirectory(entry.name)) {
      continue;
    }

    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, result);
      continue;
    }

    if (entry.isFile() && predicate(fullPath)) {
      result.push(fullPath);
    }
  }

  return result;
}

function findPublicEntryFiles() {
  const entries = new Map();
  const addEntry = (filePath, label) => {
    if (fs.existsSync(filePath) && isSourceFile(filePath)) {
      entries.set(path.resolve(filePath), label);
    }
  };

  for (const relativePath of explicitPublicEntries) {
    addEntry(toAbsolute(relativePath), relativePath);
  }

  for (const relativeDirectory of publicRouteDirectories) {
    const directory = toAbsolute(relativeDirectory);
    for (const filePath of walkFiles(directory, (candidate) => {
      return path.basename(candidate) === "page.tsx";
    })) {
      addEntry(filePath, toRelative(filePath));
    }
  }

  for (const filePath of walkFiles(
    toAbsolute("features/wiki/module-runtime"),
    isSourceFile,
  )) {
    addEntry(filePath, toRelative(filePath));
  }

  for (const filePath of walkFiles(toAbsolute("features/wiki/modules"), (candidate) => {
    return /\/(?:page|content|register|manifest)\.(?:ts|tsx)$/.test(
      candidate.split(path.sep).join("/"),
    );
  })) {
    addEntry(filePath, toRelative(filePath));
  }

  return entries;
}

function stripComments(source) {
  let output = "";
  let index = 0;
  let mode = "code";

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (mode === "line-comment") {
      if (current === "\n") {
        mode = "code";
        output += current;
      } else {
        output += " ";
      }
      index += 1;
      continue;
    }

    if (mode === "block-comment") {
      if (current === "*" && next === "/") {
        output += "  ";
        mode = "code";
        index += 2;
      } else {
        output += current === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }

    if (mode === "single-quote") {
      output += current;
      if (current === "\\") {
        output += next ?? "";
        index += 2;
        continue;
      }
      if (current === "'") {
        mode = "code";
      }
      index += 1;
      continue;
    }

    if (mode === "double-quote") {
      output += current;
      if (current === "\\") {
        output += next ?? "";
        index += 2;
        continue;
      }
      if (current === "\"") {
        mode = "code";
      }
      index += 1;
      continue;
    }

    if (mode === "template") {
      output += current;
      if (current === "\\") {
        output += next ?? "";
        index += 2;
        continue;
      }
      if (current === "`") {
        mode = "code";
      }
      index += 1;
      continue;
    }

    if (current === "/" && next === "/") {
      output += "  ";
      mode = "line-comment";
      index += 2;
      continue;
    }

    if (current === "/" && next === "*") {
      output += "  ";
      mode = "block-comment";
      index += 2;
      continue;
    }

    if (current === "'") {
      mode = "single-quote";
    } else if (current === "\"") {
      mode = "double-quote";
    } else if (current === "`") {
      mode = "template";
    }

    output += current;
    index += 1;
  }

  return output;
}

function lineForOffset(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
    }
  }
  return line;
}

function readImports(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const strippedSource = stripComments(source);
  const imports = [];
  const staticImportPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s*)?["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const pattern of [staticImportPattern, dynamicImportPattern]) {
    let match;
    while ((match = pattern.exec(strippedSource)) !== null) {
      imports.push({
        specifier: match[1],
        statement: strippedSource.slice(match.index, pattern.lastIndex),
        line: lineForOffset(strippedSource, match.index),
      });
    }
  }

  return imports;
}

function matchesPrefix(specifier, prefix) {
  return specifier === prefix || specifier.startsWith(`${prefix}/`);
}

function explainBannedImport(importInfo) {
  const specifier = importInfo.specifier.replace(/\/+$/, "");

  for (const { prefix, reason } of bannedRuntimePrefixes) {
    if (matchesPrefix(specifier, prefix)) {
      return reason;
    }
  }

  if (graphBarrelSpecifiers.has(specifier)) {
    return importInfo.statement.includes("DashboardShell")
      ? "DashboardShell from the graph barrel"
      : "full graph barrel import";
  }

  return null;
}

function resolveSourceFile(basePath) {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile() && isSourceFile(basePath)) {
    return path.resolve(basePath);
  }

  for (const extension of sourceExtensions) {
    const candidate = `${basePath}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return path.resolve(candidate);
    }
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    for (const extension of sourceExtensions) {
      const candidate = path.join(basePath, `index${extension}`);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return path.resolve(candidate);
      }
    }
  }

  return null;
}

function resolveLocalImport(fromFile, specifier) {
  if (specifier.startsWith("@/")) {
    return resolveSourceFile(path.join(webRoot, specifier.slice(2)));
  }

  if (specifier.startsWith("features/")) {
    return resolveSourceFile(path.join(webRoot, specifier));
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return resolveSourceFile(path.resolve(path.dirname(fromFile), specifier));
  }

  return null;
}

function buildImportChain(filePath, parentByFile) {
  const chain = [];
  let cursor = filePath;
  const seen = new Set();

  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const parent = parentByFile.get(cursor);
    chain.push(toRelative(cursor));
    cursor = parent?.filePath ?? null;
  }

  return chain.reverse();
}

function scanPublicEntries() {
  const entries = findPublicEntryFiles();
  const queue = [...entries.keys()];
  const seen = new Set(queue);
  const parentByFile = new Map(
    queue.map((filePath) => [filePath, { filePath: null, specifier: null }]),
  );
  const violations = [];

  while (queue.length > 0) {
    const filePath = queue.shift();

    for (const importInfo of readImports(filePath)) {
      const reason = explainBannedImport(importInfo);
      if (reason) {
        violations.push({
          filePath,
          line: importInfo.line,
          specifier: importInfo.specifier,
          reason,
          chain: buildImportChain(filePath, parentByFile),
        });
        continue;
      }

      const resolved = resolveLocalImport(filePath, importInfo.specifier);
      if (!resolved || seen.has(resolved)) {
        continue;
      }

      seen.add(resolved);
      parentByFile.set(resolved, {
        filePath,
        specifier: importInfo.specifier,
      });
      queue.push(resolved);
    }
  }

  return { entries, seen, violations };
}

const { entries, seen, violations } = scanPublicEntries();

if (violations.length === 0) {
  process.stdout.write(
    `Public route isolation passed: scanned ${entries.size} public entries and ${seen.size} reachable source files.\n`,
  );
  process.exit(0);
}

console.error(
  `Public route isolation failed: found ${violations.length} heavy/private runtime import(s).`,
);
console.error("");
console.error(
  "Public routes and wiki page/module runtime entries must not import Cosmograph, DuckDB-WASM, orb, graph/cosmograph, graph/duckdb, graph/orb, or the graph barrel/DashboardShell surface.",
);
console.error(
  "Current shared UI debt is allowed: use deep graph chrome primitives such as PanelShell and dashboard shell state instead of importing the heavy graph runtime.",
);
console.error("");

for (const violation of violations) {
  console.error(
    `- ${toRelative(violation.filePath)}:${violation.line} imports "${violation.specifier}" (${violation.reason})`,
  );
  console.error(`  chain: ${violation.chain.join(" -> ")}`);
}

process.exit(1);
