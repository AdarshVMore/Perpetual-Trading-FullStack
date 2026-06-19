import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.ts", "apps/tests/**/*.ts"],
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@prisma-db": path.resolve(__dirname, "packages/prisma-db/index.ts"),
      "@redis-client": path.resolve(__dirname, "packages/redis-client/index.ts"),
      "@shared-types": path.resolve(__dirname, "packages/shared-types/src/index.ts"),
    },
  },
});
