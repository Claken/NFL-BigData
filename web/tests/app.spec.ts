import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const ready = async (page: Page) =>
  expect(
    page.getByRole("button", { name: "Play replay", exact: true }),
  ).toBeVisible();
const geometry = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [".football-field", ".scrubber", ".transport", ".timeline-panel"].map(
        (selector) => {
          const box = document.querySelector(selector)!.getBoundingClientRect();
          return [
            selector,
            {
              x: box.x,
              y: box.y + scrollY,
              width: box.width,
              height: box.height,
            },
          ];
        },
      ),
    ),
  );
test("replay remains stable and accessible through projection", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await ready(page);
  const slider = page.getByRole("slider", { name: "Replay time", exact: true });
  const projectionToggle = page.getByRole("checkbox", {
    name: /Illustrative projection/,
  });
  await expect(projectionToggle).not.toBeChecked();
  await slider.focus();
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", /After the throw/);
  const recordedEnd = await slider.inputValue();
  const separationSlider = page.getByRole("slider", {
    name: "Seek separation chart",
  });
  await expect(separationSlider).toHaveAttribute("max", recordedEnd);
  await expect(page.locator(".gain-label")).toHaveText("LINE TO GAIN");
  await projectionToggle.check();
  await slider.focus();
  await slider.press("Home");
  const before = await geometry(page);
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", /Projection/);
  await expect(separationSlider).toHaveAttribute("max", recordedEnd);
  await expect(separationSlider).toHaveValue(recordedEnd);
  await expect(page.locator(".current-gap")).toContainText("at tracking end");
  expect(await geometry(page)).toEqual(before);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await projectionToggle.uncheck();
  await expect(slider).toHaveValue(recordedEnd);
  await expect(slider).toHaveAttribute("max", recordedEnd);
  await slider.press("Home");
  await page.screenshot({
    path: info.outputPath("film-room.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("playback, moments, camera and receiver selection work", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Play replay", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause replay", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Number(
        await page
          .getByRole("slider", { name: "Replay time", exact: true })
          .inputValue(),
      ),
    )
    .toBeGreaterThan(1.5);
  await page.getByRole("button", { name: "Pause replay", exact: true }).click();
  await page
    .getByRole("button", { name: "At the throw", exact: false })
    .click();
  await expect(
    page.getByRole("slider", { name: "Replay time", exact: true }),
  ).toHaveValue("3.3");
  await page
    .getByRole("button", { name: "Play after the throw", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause replay", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause replay", exact: true }).click();
  await page
    .getByRole("button", { name: "Show full field", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Fit players in view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Show receiver trail" }).click();
  await expect(
    page.getByRole("button", { name: "Show receiver trail" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", { name: "Harrison Bryant TE", exact: true })
    .click();
  await ready(page);
  await expect(page.locator(".receiver-heading h2")).toHaveText(
    "Harrison Bryant",
  );
  await page.goBack();
  await ready(page);
  await expect(page.locator(".receiver-heading h2")).toHaveText(
    "Anthony Schwartz",
  );
});
test("library search, selection, bookmarks and empty states", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Save play", exact: true }).click();
  await page.reload();
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Remove saved play" }),
  ).toHaveAttribute("aria-pressed", "true");
  const mobile = await page
    .getByRole("button", { name: "Open play library" })
    .isVisible();
  if (mobile)
    await page.getByRole("button", { name: "Open play library" }).click();
  const search = page.getByRole("searchbox", { name: "Search plays" });
  await search.fill("this receiver does not exist");
  await expect(
    page.getByRole("heading", { name: "No matching plays" }),
  ).toBeVisible();
  await search.fill("Mike Evans");
  await page.locator(".play-row:visible").first().click();
  await ready(page);
  await expect(page.locator(".receiver-heading h2")).toHaveText("Mike Evans");
  if (mobile)
    await page.getByRole("button", { name: "Open play library" }).click();
  await search.fill("");
  if (mobile)
    await page.getByRole("button", { name: "Saved", exact: true }).click();
  else
    await page
      .getByRole("button", { name: "Saved plays 1", exact: true })
      .click();
  await expect(page.locator(".play-row:visible")).toHaveCount(1);
  await page.locator(".play-row:visible").click();
  await ready(page);
  await expect(
    page.getByRole("heading", {
      name:
        (page.viewportSize()?.width ?? 1440) > 780
          ? "Chicago Bears vs Cleveland Browns"
          : "Bears vs Browns",
    }),
  ).toBeVisible();
});
test("dialogs trap and return focus; details and downloads remain available", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  const trigger = page.getByRole("button", {
    name: "Study notes",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await expect(
    dialog.getByRole("link", { name: "Review sample · CSV" }),
  ).toHaveAttribute("href", /downloads\/third_down_review_queue.csv/);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.getByRole("tab", { name: "Play details" }).click();
  await expect(
    page.getByRole("heading", { name: "Behind the play" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Analysis", exact: true }).click();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", { name: "Copy review cue", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review cue copied" }),
  ).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain("Game 2021092601 · Play 3345");
});
test("tracking load failure offers a working retry", async ({ page }) => {
  await page.route("**/data/replays/*.json", (route) => route.abort());
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "We couldn’t open this play" }),
  ).toBeVisible();
  await page.unroute("**/data/replays/*.json");
  await page.getByRole("button", { name: "Try again" }).click();
  await ready(page);
});
