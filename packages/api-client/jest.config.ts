import type { Config } from "jest";

// Reuses Next.js SWC jest transformer (hoisted at repo root) so this package
// doesn't need ts-jest or @babel/preset-typescript as its own dev deps.
// next/jest.js refuses to load without a Next pages/app dir, so we wire the
// underlying transformer directly.
const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  transform: {
    "^.+\\.(t|j)sx?$": [
      "next/dist/build/swc/jest-transformer",
      { jsConfig: { compilerOptions: { jsx: "preserve" } } },
    ],
  },
  moduleNameMapper: {
    // `server-only` throws when imported outside a Next server component.
    // Stub it so package-scoped jest (no Next runtime) can exercise server code.
    "^server-only$": "<rootDir>/../../node_modules/next/dist/build/jest/__mocks__/empty.js",
  },
};

export default config;
