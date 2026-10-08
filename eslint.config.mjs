import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = defineConfig([
  ...nextCoreWebVitals,
  {
    rules: {
      // Behavioral follow-ups and audit evidence: docs/ENGINEERING_BACKLOG.md (#56).
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
  {
    files: ["__tests__/**"],
    rules: {
      // Anonymous component mocks are intentional; enforce names in application code.
      "react/display-name": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "coverage/**",
  ]),
]);

export default config;
