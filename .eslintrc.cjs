/** Root ESLint config shared by every app/package — see docs/44-CODING-STANDARDS.md */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  env: {
    es2022: true,
    node: true,
  },
  ignorePatterns: [
    "node_modules",
    "dist",
    "build",
    ".next",
    ".turbo",
    "*.config.js",
    "*.config.cjs",
    "*.config.mjs",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-explicit-any": [
      "warn",
      { ignoreRestArgs: false },
    ],
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
};
