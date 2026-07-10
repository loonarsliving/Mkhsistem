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

/**
 * Supabase's session cookie can expire while the app is backgrounded for a
 * long time; re-running the session-refresh middleware path on resume
 * (via a full reload of the current route) keeps "session refresh" and
 * "remember login" behavior correct without any bespoke token logic —
 * the existing lib/supabase/middleware.ts already owns that.
 */
export function onAppResume(callback: () => void): () => void {
  let handle: { remove: () => void } | undefined;
  App.addListener("appStateChange", (state) => {
    if (state.isActive) callback();
  }).then((h) => {
    handle = h;
  });
  return () => handle?.remove();
}
