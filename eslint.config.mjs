import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = defineConfig([
  ...nextCoreWebVitals,
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
