import { NativeBiometric } from "capacitor-native-biometric";
import { Preferences } from "@capacitor/preferences";

import { isNativePlatform } from "./platform";

/** Namespaced key so this never collides with any other Preferences use. capacitor-native-biometric handles the actual secret (Android Keystore-backed), this flag only remembers "has the user opted in." */
const ENABLED_FLAG_KEY = "mkc.biometric_enabled";
const CREDENTIAL_SERVER = "id.haluoleo.mkconnect";

export async function isBiometricAvailable(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const result = await NativeBiometric.isAvailable();
    return result.isAvailable;
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  const { value } = await Preferences.get({ key: ENABLED_FLAG_KEY });
  return value === "true";
}

/** Stores the credential behind the device's Keystore-backed secure storage, gated by the OS biometric prompt on every read. */
export async function enableBiometricLogin(email: string, password: string): Promise<void> {
  await NativeBiometric.setCredentials({ username: email, password, server: CREDENTIAL_SERVER });
  await Preferences.set({ key: ENABLED_FLAG_KEY, value: "true" });
}

export async function disableBiometricLogin(): Promise<void> {
  try {
    await NativeBiometric.deleteCredentials({ server: CREDENTIAL_SERVER });
  } catch {
    // already cleared — fine
  }
  await Preferences.remove({ key: ENABLED_FLAG_KEY });
}

/** Prompts the OS fingerprint/face dialog, then returns the stored credentials for loginAction to verify — the same server-side check every other login goes through, nothing bypassed. */
export async function authenticateWithBiometric(): Promise<{ email: string; password: string }> {
  await NativeBiometric.verifyIdentity({
    reason: "Masuk ke MK Connect",
    title: "Masuk dengan Sidik Jari",
    subtitle: "Verifikasi identitas Anda",
  });
  const credentials = await NativeBiometric.getCredentials({ server: CREDENTIAL_SERVER });
  return { email: credentials.username, password: credentials.password };
}
