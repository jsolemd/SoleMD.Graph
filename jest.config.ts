import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/examples/", "/archive/", "test-utils\\.ts$"],
};

export default createJestConfig(config);
