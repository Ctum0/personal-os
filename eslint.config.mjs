import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Tests build partial fixtures and read untyped SQLite rows on purpose:
    // asserting behaviour, not shaping data. Requiring precise types there
    // produces churn without catching bugs, so the type-purity rules are
    // relaxed for test files only (shipping code stays strict).
    files: ["src/tests/**/*.ts", "e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  globalIgnores([
    // Build output, including the isolated E2E/dev dist directories. Linting
    // generated bundles produced thousands of false errors and made the real
    // signal unreadable.
    ".next/**",
    ".next-e2e/**",
    ".next-pin/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local audit/verification output (screenshots, probe scripts, app clones).
    ".artifacts/**",
    "reports/**",
    "test-results/**",
  ]),
]);
