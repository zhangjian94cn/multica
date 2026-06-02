import { expect, test } from "@playwright/test";
import { loginAsDefault } from "./helpers";

test.describe("Localization", () => {
  test("Chinese locale covers core dashboard navigation", async ({ page }) => {
    const workspaceSlug = await loginAsDefault(page);

    await page.evaluate(() => {
      localStorage.setItem("multica-locale", "zh");
      document.cookie = "multica-locale=zh; path=/; SameSite=Lax";
    });
    await page.goto(`/${workspaceSlug}/issues`);

    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
    await expect(page.getByRole("button", { name: "全部" })).toBeVisible();
    await expect(page.getByRole("button", { name: "成员" })).toBeVisible();
    await expect(page.getByRole("button", { name: "智能体" }).first()).toBeVisible();
    await expect(page.getByText("问题").first()).toBeVisible();

    await page.locator('a[href$="/projects"]').first().click();
    await page.waitForURL("**/projects");
    await expect(page.getByRole("heading", { name: "项目" })).toBeVisible();
    await expect(page.getByRole("button", { name: /新建项目/ })).toBeVisible();

    await page.locator('a[href$="/autopilots"]').first().click();
    await page.waitForURL("**/autopilots");
    await expect(page.getByRole("heading", { name: "自动驾驶" })).toBeVisible();
    await expect(page.getByText("还没有自动驾驶")).toBeVisible();
    await expect(page.getByText("每日新闻摘要")).toBeVisible();
    await expect(page.getByRole("button", { name: /从空白开始/ })).toBeVisible();

    await page.locator('a[href$="/skills"]').first().click();
    await page.waitForURL("**/skills");
    await expect(page.getByRole("heading", { name: "技能" })).toBeVisible();

    await page.locator('a[href$="/agents"]').first().click();
    await page.waitForURL("**/agents");
    await expect(page.getByRole("heading", { name: "智能体" })).toBeVisible();
    await expect(page.getByText("还没有智能体")).toBeVisible();

    await page.locator('a[href$="/runtimes"]').first().click();
    await page.waitForURL("**/runtimes");
    await expect(page.getByRole("heading", { name: "运行时" })).toBeVisible({
      timeout: 15000,
    });
  });
});
