import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "istanbul",
      reporter: ["json-summary", "text"],
      include: ["src/rules/**/*.ts"],
      exclude: ["src/rules/**/*.test.ts"],
    },
  },
});
