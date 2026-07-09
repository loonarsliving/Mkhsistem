import { expect, test } from "@playwright/test";

const STAFF_EMAIL = process.env.TEST_STAFF_EMAIL ?? "";
const STAFF_PASSWORD = process.env.TEST_STAFF_PASSWORD ?? "";

test.describe("Attendance check-in / check-out", () => {
  test.skip(!STAFF_EMAIL, "TEST_STAFF_EMAIL not set — see tests/integration/README.md");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(STAFF_EMAIL);
    await page.getByLabel("Password").fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("completes a full check-in using the fake camera and mocked geolocation, then check-out", async ({
    page,
  }) => {
    // ---- Check in ----
    await page.getByRole("button", { name: "Check In" }).click();
    await expect(page.getByRole("heading", { name: "Check In" })).toBeVisible();

    // The fake video device produces frames almost immediately; wait for the
    // capture button to become enabled rather than a fixed sleep.
    const captureButton = page.getByRole("button", { name: "Ambil Foto" });
    await expect(captureButton).toBeEnabled({ timeout: 15_000 });
    await captureButton.click();

    // Location resolves from the mocked geolocation context (Head Office coords).
    await expect(page.getByText(/Lokasi terdeteksi/)).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder("Catatan (opsional)").fill("Playwright e2e check-in");
    const confirmCheckIn = page.getByRole("button", { name: "Konfirmasi Check In" });
    await expect(confirmCheckIn).toBeEnabled();
    await confirmCheckIn.click();

    await expect(page.getByText("Check-in berhasil")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Check In" })).not.toBeVisible();

    // Dashboard now shows a real check-in time and the Check Out action.
    await expect(page.getByText("Jam Masuk")).toBeVisible();
    await expect(page.getByRole("button", { name: "Check Out" })).toBeVisible();

    // ---- Check out ----
    await page.getByRole("button", { name: "Check Out" }).click();
    await expect(page.getByRole("heading", { name: "Check Out" })).toBeVisible();

    const captureButtonOut = page.getByRole("button", { name: "Ambil Foto" });
    await expect(captureButtonOut).toBeEnabled({ timeout: 15_000 });
    await captureButtonOut.click();
    await expect(page.getByText(/Lokasi terdeteksi/)).toBeVisible({ timeout: 10_000 });

    const confirmCheckOut = page.getByRole("button", { name: "Konfirmasi Check Out" });
    await expect(confirmCheckOut).toBeEnabled();
    await confirmCheckOut.click();

    await expect(page.getByText("Check-out berhasil")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Absensi hari ini selesai")).toBeVisible();
  });

  test("blocks confirming check-in before a photo has been captured", async ({ page }) => {
    await page.getByRole("button", { name: "Check In" }).click();
    await expect(page.getByRole("heading", { name: "Check In" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Konfirmasi Check In" })).toBeDisabled();
  });
});
