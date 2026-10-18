import { test, expect } from "@playwright/test";
test("measured dashboard, forecasts and reproducible exports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A clearer view of what’s next." }),
  ).toBeVisible();
  await expect(page.getByText("80.9%", { exact: true }).first()).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(8);
  await page.getByLabel("Search products").fill("009");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Search products").fill("");
  await page.getByRole("button", { name: "7 days", exact: true }).click();
  await expect(
    page.getByText("7-DAY FORECAST", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "28 days", exact: true }).click();
  await page.getByLabel("Forecast model").selectOption("gradient_boosting");
  await expect(page.getByText("78.2%", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Forecast model").selectOption("selected");
  await page.screenshot({
    path: "docs/stocksense-overview.png",
    fullPage: true,
  });
  const exporting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export forecast", exact: true })
    .click();
  expect((await exporting).suggestedFilename()).toBe("stocksense-forecast.csv");
  await page.getByRole("button", { name: "Forecast lab", exact: true }).click();
  await page
    .getByRole("button", { name: "Holdout check", exact: true })
    .click();
  await expect(
    page.getByText(/actuals shown only for evaluation/),
  ).toBeVisible();
  await page.getByLabel("Product series").selectOption("FOODS_1_009");
  await page.getByRole("button", { name: "Backtests", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Final 28-day scoreboard" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Data & methods", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "SQL data-quality audit" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("inventory cost assumptions change the recommendation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Inventory lab", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The decision, in units" }),
  ).toBeVisible();
  const initial = await page
    .locator(".decision-grid>div")
    .first()
    .locator("strong")
    .innerText();
  await page.getByLabel("Cost of one missed sale").fill("20");
  await expect
    .poll(async () =>
      Number(
        (
          await page
            .locator(".decision-grid>div")
            .first()
            .locator("strong")
            .innerText()
        ).replaceAll(",", ""),
      ),
    )
    .toBeGreaterThanOrEqual(Number(initial.replaceAll(",", "")));
  await page.getByLabel("Assumed starting stock").fill("400");
  await expect(page.locator(".decision-grid .highlight strong")).toHaveText(
    "0",
  );
  await page.screenshot({
    path: "docs/stocksense-inventory.png",
    fullPage: true,
  });
});
test("mobile navigation and layout stay usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A clearer view of what’s next." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("button", { name: "Inventory lab", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Set your assumptions" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "docs/stocksense-mobile.png", fullPage: true });
});
