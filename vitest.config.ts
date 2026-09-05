import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "https://www.temu.com/ca/test-product-g-1.html",
      },
    },
    include: ["extension/src/**/*.test.{js,ts}", "tests/**/*.test.ts"],
  },
});
