import type { Config } from "jest";

// Reuses Next.js SWC jest transformer (hoisted at repo root) so this package
// doesn't need ts-jest or @babel/preset-typescript as its own dev deps.
// next/jest.js refuses to load without a Next pages/app dir, so we wire the
// underlying transformer directly.
const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "-utils\\.ts$"],
  transform: {
    "^.+\\.(t|j)sx?$": [
      "next/dist/build/swc/jest-transformer",
      { jsConfig: { compilerOptions: { jsx: "preserve" } } },
    ],
  },
};

export default config;
