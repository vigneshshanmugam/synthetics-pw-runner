import { journey, expect } from "synthetics-runner";

journey("check if title is present", async ({ page }) => {
  await journey.step("launch app", async () => {
    await page.goto("https://elastic.github.io/synthetics-demo/");
  });

  await journey.step("assert title", async () => {
    const header = await page.waitForSelector("h1");
    expect(await header.textContent()).toBe("todo");
  });
});

journey("check if input placeholder is correct", async ({ page }) => {
  await journey.step("launch app", async () => {
    await page.goto("https://elastic.github.io/synthetics-demo/");
  });

  await journey.step("assert placeholder value", async () => {
    const input = await page.waitForSelector("input.new-todo");
    expect(await input.getAttribute("placeholder")).toBe(
      "What needs to be done?"
    );
  });
});
