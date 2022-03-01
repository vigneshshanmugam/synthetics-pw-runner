import { PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = {
  use: {
    screenshot: "on",
  },
  reporter: "./src/reporters/json",
};

export default config;
