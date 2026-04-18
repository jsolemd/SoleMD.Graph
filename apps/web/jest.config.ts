import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/examples/", "/archive/", "-utils\\.ts$"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@solemd/api-client$": "<rootDir>/../../packages/api-client/src/index.ts",
    "^@solemd/api-client/(.*)$": "<rootDir>/../../packages/api-client/src/$1",
    "^@solemd/graph$": "<rootDir>/../../packages/graph/src/index.ts",
    "^@solemd/graph/(.*)$": "<rootDir>/../../packages/graph/src/$1",
  },
};

export default createJestConfig(config);
