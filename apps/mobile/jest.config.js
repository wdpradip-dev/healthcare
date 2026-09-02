/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/*.spec.ts", "**/*.spec.tsx"],
  // Mirrors tsconfig.json's "@/*" -> "./src/*" path alias — Metro resolves
  // it natively at runtime/build, but Jest needs its own mapping.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFiles: ["<rootDir>/jest.setup.ts"],
  // Each jest-expo worker loads a heavy RN/Expo environment; running several
  // in parallel exhausts available memory (observed as workers being
  // SIGTERM'd mid-run). One worker at a time is slower but reliable.
  maxWorkers: 1,
  // The default jest-expo pattern (kept below, unchanged, as the second
  // alternative) assumes a flat node_modules layout
  // (`node_modules/react-native/...`). pnpm nests real packages under
  // `node_modules/.pnpm/<name>/node_modules/<name>/...`, which has TWO
  // `node_modules/` segments — RegExp#test matches the leftmost one it can,
  // and the outer `.pnpm/...` segment trivially satisfies the negative
  // lookahead (nothing in it looks like `react-native`/`expo`/etc.), so the
  // real, inner match never gets evaluated and every RN/Expo package
  // silently falls through untransformed (Flow/JSX syntax errors on first
  // import). The optional `(\.pnpm/[^/]+/node_modules/)?` prefix lets the
  // match skip over exactly that wrapper segment and land on the real
  // package name either way, without changing how the original alternatives
  // themselves match (several rely on prefix matching, e.g. `expo(nent)?`
  // deliberately matching `expo-router`, `expo-modules-core`, etc.).
  transformIgnorePatterns: [
    "node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?(((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))",
  ],
  passWithNoTests: true,
};
