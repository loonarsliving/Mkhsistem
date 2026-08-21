# MOBILE BUILD

## Status: IMPLEMENTED (Android only)

Android is a real, CI-verified, actively built target. **No `ios/`
directory exists in the repo** and no iOS-specific Capacitor config was
found — treat iOS as **NOT IMPLEMENTED**.

## Architecture

The Android app is a **Capacitor thin native shell**, not a separate
codebase — `capacitor.config.ts`'s own code comment states this explicitly:
the WebView always loads the live production site
(`server.url: "https://mkh.haluoleo.id"`), so auth, RLS, Realtime, Storage,
Server Actions, and every business rule live in exactly one place (the
Next.js app). The native project (`android/`) only adds native chrome
(icon, splash screen, permissions) and bridges (`lib/native/*.ts`) that web
pages opt into.

- **Package / Application ID**: `id.haluoleo.mkconnect`
  (`capacitor.config.ts` `appId`, confirmed matching
  `android/app/build.gradle` `applicationId`).
- **App name**: "MK Connect" (`capacitor.config.ts` `appName`).
- **Web dir**: `public` (per `capacitor.config.ts`, though since
  `server.url` is set, the app loads the remote URL rather than bundled
  static files — `webDir` mainly matters for `npx cap sync`'s asset
  copying step).
- Native plugins configured: SplashScreen (600ms, `#1e40af` background),
  PushNotifications (badge/sound/alert), StatusBar (dark style, white
  background).
- Capacitor plugin dependencies present: `@capacitor/{android, app, camera,
  clipboard, core, filesystem, geolocation, keyboard, network, preferences,
  push-notifications, share, splash-screen, status-bar}` plus
  `capacitor-native-biometric`.

## Web build

There is no separate "mobile web build" step — the app always points at
production. `npx cap sync android` re-copies `capacitor.config.ts` and any
plugin config changes into the native `android/` project; it does not build
the Next.js app itself (that's the normal `npm run build` / Vercel deploy,
independent of mobile).

## Capacitor sync

```bash
npx cap sync android   # copies config + plugins into android/
npx cap open android   # opens Android Studio
```

## Android build

Documented in detail in the existing `docs/android/BUILD.md` (verified
current against `android-build.yml`):

```bash
cd android
./gradlew assembleDebug      # → app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease    # → app/build/outputs/apk/release/app-release.apk (or -unsigned.apk)
```

- **Prerequisites**: Android Studio (Hedgehog+), Android SDK Platform 34+,
  JDK 21 (bundled with Android Studio), Node.js 22+.
- **Debug build**: signed with Android's standard non-secret debug
  keystore (Gradle auto-generates it) — fine for internal testing only.
- **Release build without a configured keystore**: still succeeds and
  produces a real, installable **unsigned** APK — useful for verifying the
  release build (which runs R8/resource shrinking, a genuinely different
  code path than debug) works, but cannot receive signed updates and
  should not be distributed as final.

## Signing / keystore (no passwords recorded here, per instructions)

`android/app/build.gradle` reads release signing config entirely from
environment variables — **no keystore file and no passwords are ever
committed to the repo**:

| Variable | Purpose |
|---|---|
| `MKC_RELEASE_KEYSTORE_PATH` | path to the `.keystore`/`.jks` file |
| `MKC_RELEASE_KEYSTORE_PASSWORD` | keystore password |
| `MKC_RELEASE_KEY_ALIAS` | key alias inside the keystore |
| `MKC_RELEASE_KEY_PASSWORD` | password for that key |

In CI (`.github/workflows/android-build.yml`), the equivalent GitHub repo
secrets are `ANDROID_RELEASE_KEYSTORE_BASE64`,
`ANDROID_RELEASE_KEYSTORE_PASSWORD`, `ANDROID_RELEASE_KEY_ALIAS`,
`ANDROID_RELEASE_KEY_PASSWORD`. CI checks whether
`ANDROID_RELEASE_KEYSTORE_BASE64` is set and, if so, decodes it, builds a
**signed** release APK, and **cryptographically verifies the signature**
with `apksigner verify` (failing the job if verification doesn't pass — no
`continue-on-error` on that step). Whether these secrets are currently
configured on the live repo is `UNKNOWN — NEEDS CONFIRMATION`.

`docs/android/BUILD.md` documents generating a real release keystore once
via `keytool -genkeypair`, and explicitly warns: losing the keystore means
every future release must ship as a brand-new, separate Android app
(Android permanently ties updates to the signing key) — store it and both
passwords in a password manager, not chat/email.

## Dev vs. production build

There is effectively **one build lane**, not separate dev/prod Capacitor
configs — the app always loads `https://mkh.haluoleo.id` regardless of
debug/release APK type (per `capacitor.config.ts`; no environment
switching logic was found in the Capacitor config itself). The
debug/release distinction is about **Android signing and code shrinking**
(R8), not about which backend/environment the WebView talks to. If a
developer needs to point the app at a local dev server instead, that would
require locally editing `capacitor.config.ts`'s `server.url` — no such
alternate config profile exists in the repo today.

## Testing device / emulation

CI (`android-build.yml`) runs a **real emulator boot smoke test**
(`reactivecircus/android-emulator-runner`, API 33, Pixel 6 profile,
`google_apis` target): installs and launches both the debug and (if signed)
release APK, watches `logcat` for `FATAL EXCEPTION`, and fails the job if
either APK crashes on launch or isn't running after 15 seconds. This step
is `continue-on-error: true` at the job level (so a flaky/slow hosted
emulator never blocks the actual APK artifacts, which are the real
deliverable), but still surfaces real crash evidence via the uploaded
logcat artifact when it does run.

## Distribution

- Every push to `main`/`claude/**` touching Android-relevant paths
  (`android/**`, `capacitor.config.ts`, `lib/native/**`, `package.json`,
  `package-lock.json`) uploads debug + release APKs as **workflow
  artifacts** (visible on the Actions run page).
- Pushing a tag matching `android-v*` additionally publishes a **GitHub
  Release** named `MK Connect Android v<version>` with both APKs attached
  (release-asset retention doesn't expire, unlike the 90-day workflow
  artifact limit).
- Installation steps for end users are documented separately in
  `docs/android/INSTALL.md` (not duplicated here — read that file directly
  for the current, authoritative install instructions).

## Known constraints / recent history

Git log shows a real Android bring-up debugging arc on 2026-07-10 — several
same-day commits fixing a release-build crash (`NPE in
Geolocation.checkPermissions()`), a missing Firebase classpath, an AAPT
resource-linking failure (`Theme.AppCompat.Translucent` doesn't exist), and
adding an on-device crash screen + `crash.txt` specifically so future
native crashes are self-diagnosing without needing `adb` access. This
indicates the Android build has already been through at least one real
stabilization pass, not just an initial scaffold.
