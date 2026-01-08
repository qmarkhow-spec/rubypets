import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals.js";
import nextTs from "eslint-config-next/typescript.js";

const nextVitalsConfig = Array.isArray(nextVitals) ? nextVitals : [nextVitals];
const nextTsConfig = Array.isArray(nextTs) ? nextTs : [nextTs];

const eslintConfig = defineConfig([
  ...nextVitalsConfig,
  ...nextTsConfig,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

