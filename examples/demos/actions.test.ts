import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("https://todomvc.com/examples/vanilla-es6/");
});

test("basic interaction", async ({ page }) => {
  const inputBox = page.locator("input.new-todo");
  const todoList = page.locator(".todo-list");

  await inputBox.fill("Learn Playwright");
  await inputBox.press("Enter");
  await expect(todoList).toHaveText("Learn Playwright");
  await page.locator(".filters >> text=Completed").click();
  await expect(todoList).not.toHaveText("Learn Playwright");
});

test("element selectors", async ({ page }) => {
  // When no selector engine is specified, Playwright will use the css selector engine.
  await page.type(".header input", "Learn Playwright");
  // So the selector above is the same as the following:
  await page.press("css=.header input", "Enter");

  // select by text with the text selector engine:
  await page.click("text=All");

  // Combine css and text selectors (https://playwright.dev/docs/selectors/#text-selector)
  await page.click('.todo-list > li:has-text("Playwright")');
  await page.click(".todoapp .footer >> text=Completed");

  // Selecting based on layout, with css selector
  expect(await page.innerText('a:right-of(:text("Active"))')).toBe("Completed");

  // Only visible elements, with css selector
  await page.click("text=Completed >> visible=true");

  // XPath selector
  await page.click("xpath=//html/body/section/section/label");
});
