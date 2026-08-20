import { globalIgnores } from "eslint/config";
import next from "eslint-config-next";

const config = [
  globalIgnores(["coverage/**", "playwright-report/**", "test-results/**"]),
  ...next
];

export default config;
