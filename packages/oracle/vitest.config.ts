import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Several suites scaffold throwaway git repos in a temp dir. Without this they inherit
    // whatever is in the developer's ~/.gitconfig, so the same test can behave differently per
    // machine: core.hooksPath would point a scaffold at real hooks, and commit.gpgsign makes
    // every scaffold commit wait on gpg-agent. git reads a missing config file as an empty one.
    env: { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
    coverage: {
      provider: "istanbul",
      reporter: ["json-summary", "text"],
      include: ["src/rules/**/*.ts"],
      exclude: ["src/rules/**/*.test.ts"],
    },
  },
});
