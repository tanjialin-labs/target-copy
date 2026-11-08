import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  globalIgnores([
    "node_modules",
    "main.js",
    "esbuild.config.mjs",
    "tests",
    "docs",
  ]),
  ...obsidianmd.configs.recommended,
  {
    files: ["src/core/**/*.ts", "src/adapters/**/*.ts"],
    // Export DOM belongs to an inert document, which has no browsing window.
    rules: { "obsidianmd/prefer-create-el": "off" },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*", "scripts/*.mjs"],
        },
      },
    },
  },
]);
