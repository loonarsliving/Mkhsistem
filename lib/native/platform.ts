import { Capacitor } from "@capacitor/core";

/** True only inside the Capacitor Android (or iOS) shell — false in every browser, including mobile Chrome/Safari. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function getNativePlatform(): "android" | "ios" | "web" {
  return Capacitor.getPlatform() as "android" | "ios" | "web";
}
