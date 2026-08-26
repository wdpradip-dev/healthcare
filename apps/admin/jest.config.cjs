/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  rootDir: "src",
  testMatch: ["**/*.spec.tsx", "**/*.spec.ts"],
  setupFilesAfterEnv: ["<rootDir>/../jest.setup.ts"],
  passWithNoTests: true,
};
