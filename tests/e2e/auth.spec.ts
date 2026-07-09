import { expect, test } from "@playwright/test";

const STAFF_EMAIL = process.env.TEST_STAFF_EMAIL ?? "";
const STAFF_PASSWORD = process.env.TEST_STAFF_PASSWORD ?? "";

test.describe("Authentication", () => {
  test("redirects an unauthenticated visitor from a protected route to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows a validation error for an invalid email", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("whatever");
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.getByText("Format email tidak valid")).toBeVisible();
  });

  test("rejects the wrong password with an inline error, not a crash", async ({ page }) => {
    test.skip(!STAFF_EMAIL, "TEST_STAFF_EMAIL not set — see tests/integration/README.md");
    await page.goto("/login");
    await page.getByLabel("Email").fill(STAFF_EMAIL);
    await page.getByLabel("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.getByText("Email atau password salah")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("logs in successfully and lands on the dashboard with the user's name", async ({ page }) => {
    test.skip(!STAFF_EMAIL, "TEST_STAFF_EMAIL not set — see tests/integration/README.md");

    await page.goto("/login");
    await page.getByLabel("Email").fill(STAFF_EMAIL);
    await page.getByLabel("Password").fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: "Masuk" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/Halo, Test/i)).toBeVisible();
  });

  test("logs out and is redirected back to /login, and the route is protected again", async ({ page }) => {
    test.skip(!STAFF_EMAIL, "TEST_STAFF_EMAIL not set — see tests/integration/README.md");

    await page.goto("/login");
    await page.getByLabel("Email").fill(STAFF_EMAIL);
    await page.getByLabel("Password").fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole("button", { name: /^Menu akun untuk/ }).click();
    await page.getByText("Keluar").click();

    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
