import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        // Порог покрытия: не ниже 80% по всем файлам вместе
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
});