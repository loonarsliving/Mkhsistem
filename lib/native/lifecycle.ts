import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

/** Hides the native splash once the first page has painted — called once from NativeAppShell. */
export async function hideSplashScreen(): Promise<void> {
  await SplashScreen.hide();
}

export async function configureStatusBar(): Promise<void> {
  try {
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: "#ffffff" });
  } catch {
    // status bar APIs can throw on devices/OS versions that don't support overlay control — non-fatal
  }
}

// Below this, a foreground return is a genuine "the user put the phone away
// and came back" resume, worth refreshing the session for. Below it, it's
// almost certainly the WebView briefly losing foreground to a native
// plugin activity we launched ourselves (Camera.getPhoto(), the biometric
// prompt, the share sheet, the gallery picker) and immediately regaining
// it once that activity finishes — Capacitor fires the exact same
// `appStateChange({isActive: true})` event for both cases, so this is the
// only way to tell them apart.
const RESUME_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Supabase's session cookie can expire while the app is backgrounded for a
 * long time; re-running the session-refresh middleware path on resume
 * (via a full reload of the current route) keeps "session refresh" and
 * "remember login" behavior correct without any bespoke token logic —
 * the existing lib/supabase/middleware.ts already owns that.
 *
 * Only fires after being backgrounded for at least
 * RESUME_REFRESH_THRESHOLD_MS. Previously fired on every resume
 * unconditionally, which included the resume that happens right after
 * Camera.getPhoto() (or any other native activity) hands control back to
 * MainActivity — window.location.reload() on that resume wiped whatever
 * React state was live (an open check-in dialog, a captured-but-not-yet-
 * uploaded selfie) and landed the user back on a fresh render of the
 * current page, which looked exactly like "silently bounced to Dashboard,
 * still logged in, no error, no crash."
 */
export function onAppResume(callback: () => void): () => void {
  let handle: { remove: () => void } | undefined;
  let backgroundedAt: number | null = null;

  App.addListener("appStateChange", (state) => {
    if (!state.isActive) {
      backgroundedAt = Date.now();
      console.warn("[lifecycle] appStateChange -> backgrounded");
      return;
    }

    const backgroundedForMs = backgroundedAt === null ? 0 : Date.now() - backgroundedAt;
    backgroundedAt = null;

    if (backgroundedForMs >= RESUME_REFRESH_THRESHOLD_MS) {
      console.warn(
        `[lifecycle] appStateChange -> resumed after ${Math.round(backgroundedForMs / 1000)}s, ` +
          "refreshing session (window.location.reload)",
      );
      callback();
    } else {
      console.warn(
        `[lifecycle] appStateChange -> resumed after ${Math.round(backgroundedForMs / 1000)}s ` +
          "(brief native activity, e.g. camera/biometric/share) -- skipping reload",
      );
    }
  }).then((h) => {
    handle = h;
  });

  return () => handle?.remove();
}
