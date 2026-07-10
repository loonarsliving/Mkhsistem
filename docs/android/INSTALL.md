# MK Connect Android — Installation Guide

For PT Maha Karya Haluoleo employees installing the app outside the Play
Store (sideloading), until the app is published there.

## 1. Get the APK

Download `app-release.apk` (or `app-debug.apk` for internal testing builds)
from the latest successful run of the **Android Build** workflow:
GitHub → this repository → Actions → Android Build → pick the latest green
run → Artifacts.

## 2. Allow installs from this source

Android blocks installing APKs from outside the Play Store by default.

- **Android 8+**: when you open the downloaded APK, Android will prompt
  *"For your security, your phone is not allowed to install unknown apps
  from this source"* — tap **Settings**, enable **Allow from this source**
  for whichever app you downloaded it with (Chrome, Files, etc.), then go
  back and open the APK again.
- **Android 7 and earlier**: Settings → Security → enable **Unknown
  sources**.

## 3. Install

Tap the downloaded `app-release.apk` → **Install**. The app requests these
permissions the first time each is actually needed (not all at install
time):

| Permission | Requested when | Why |
|---|---|---|
| Camera | Attendance check-in/out | Selfie verification |
| Location | Attendance check-in/out | Geofencing — confirms you're at a company branch |
| Photos/Media | Uploading a memo/announcement attachment | Picking an existing image |
| Notifications | First app launch (Android 13+) | Memo/announcement/registration alerts |
| Fingerprint/biometric | Opt-in, after your first password login | Faster subsequent logins |

## 4. First launch

1. Log in with your existing MK Connect email and password — the same
   account as the web app, nothing separate to register.
2. If prompted, allow location access when you first use Attendance — if
   you deny it, the app explains that check-in requires location and lets
   you try again later from the same screen.
3. Optional: after logging in, tap **"Aktifkan sidik jari"** on the
   success toast to enable fingerprint login for next time. You can turn
   this off later in Profile → Perangkat.

## Updating

New builds must be signed with the **same** release key as your currently
installed version, or Android will refuse the update (you'd need to
uninstall the old one first, losing anything stored only on-device — there
isn't much, since almost all state lives in Supabase). This is why the
release keystore described in `BUILD.md` must be kept and reused for every
release, not regenerated per version.

## Troubleshooting

- **"App not installed"** — usually a signature mismatch with an existing
  install (see *Updating* above), or a corrupted download; re-download and
  retry.
- **Blank white screen on launch** — the app loads the live production site
  over HTTPS; this means the device has no internet connectivity at that
  moment. The app shows an offline banner once it detects this.
- **Location/GPS says "GPS tidak aktif"** — the device's system Location
  toggle is off (Settings → Location), not just the app's permission;
  enable it and retry.
- **Fingerprint option doesn't appear on the login screen** — either the
  device has no enrolled fingerprint/face unlock, or you haven't opted in
  yet (see step 4 above; it only appears after enabling it once).
