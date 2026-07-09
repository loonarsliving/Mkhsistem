import { expect, test } from "@playwright/test";

const STAFF_EMAIL = process.env.TEST_STAFF_EMAIL ?? "";
const STAFF_PASSWORD = process.env.TEST_STAFF_PASSWORD ?? "";

// Deliberately never submits a valid registration here — that would create
// a real, permanent account in the live database with no way for this
// suite to clean it up (registration needs the service-role key, which
// isn't available in the anon-key test/e2e environment). Full submission
// was verified live via Supabase MCP instead. These tests cover what's safe
// to exercise through the real UI: rendering and client-side validation.
test.describe("Self-registration", () => {
  test("renders every required field", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByLabel("Nama Lengkap")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Nomor HP")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Konfirmasi Password")).toBeVisible();
    await expect(page.getByText("Pilih cabang")).toBeVisible();
    await expect(page.getByText("Pilih divisi")).toBeVisible();
    await expect(page.getByRole("button", { name: "Daftar" })).toBeVisible();
  });

  test("shows a validation error for an invalid email without submitting", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Nama Lengkap").fill("Test User");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Nomor HP").fill("081234567890");
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Konfirmasi Password").fill("password123");
    await page.getByRole("button", { name: "Daftar" }).click();
    await expect(page.getByText("Format email tidak valid")).toBeVisible();
  });

  test("shows a mismatch error when password confirmation differs", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Konfirmasi Password").fill("different456");
    await page.getByRole("button", { name: "Daftar" }).click();
    await expect(page.getByText("Konfirmasi password tidak cocok")).toBeVisible();
  });

  test("shows a validation error for a short password", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Password", { exact: true }).fill("short1");
    await page.getByLabel("Konfirmasi Password").fill("short1");
    await page.getByRole("button", { name: "Daftar" }).click();
    await expect(page.getByText("Password minimal 8 karakter")).toBeVisible();
  });

  test("links back to /login", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("link", { name: "Masuk" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects an authenticated user away from /register", async ({ page }) => {
    test.skip(!STAFF_EMAIL, "TEST_STAFF_EMAIL not set — see tests/integration/README.md");

    await page.goto("/login");
    await page.getByLabel("Email").fill(STAFF_EMAIL);
    await page.getByLabel("Password").fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/register");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
