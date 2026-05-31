import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  // Project-wide rule overrides
  {
    rules: {
      "no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  // Node.js CommonJS files
  {
    files: ["server.js", "src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
  // Vitest test files (ESM)
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // Browser frontend
  {
    files: ["public/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: globals.browser,
    },
  },
];
