/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "test",
  testMatch: ["**/*.integration-spec.ts"],
  passWithNoTests: true,
};
