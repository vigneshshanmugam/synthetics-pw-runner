import { journey, expect } from "synthetics-runner";

journey("synthetics compatability", async ({ page }) => {
  await journey.step("Go to example page", async () => {
    await page.goto("https://www.example.com");
  });

  await journey.step("go to vignesh home", async () => {
    await page.goto("https://vigneshh.in");
    throw new Error("boom");
  });
});
