import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

import { isNativePlatform } from "./platform";

export interface NativePosition {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

/** Denied vs. disabled need different user-facing guidance, so the error is classified rather than just surfaced raw. */
export type GeolocationErrorKind = "permission_denied" | "location_disabled" | "unavailable";

export class GeolocationBridgeError extends Error {
  constructor(
    public readonly kind: GeolocationErrorKind,
    message: string,
  ) {
    super(message);
  }
}

const UNAVAILABLE_ERROR = new GeolocationBridgeError("unavailable", "Gagal mendapatkan lokasi. Pastikan GPS aktif.");

/**
 * Native (fused location provider) GPS fix on Android — meaningfully more
 * accurate than the WebView's browser geolocation for geofenced attendance
 * check-in/out. Only called when isNativePlatform() is true; the web app's
 * existing hooks/use-geolocation.ts browser-API path is untouched and keeps
 * working exactly as before for the production website.
 *
 * Every native call below is wrapped in try/catch and defended with an
 * isPluginAvailable() check up front: a release-build R8 stripping bug in
 * the Geolocation plugin's permission handling (see android/app/
 * proguard-rules.pro) turned a bare Geolocation.checkPermissions() call
 * into an app-crashing NullPointerException, not a normal rejected
 * promise. That's fixed at the proguard level, but this function no longer
 * assumes any single native call is safe.
 */
export async function getNativePosition(): Promise<NativePosition> {
  if (!Capacitor.isPluginAvailable("Geolocation")) {
    throw UNAVAILABLE_ERROR;
  }

  try {
    const permission = await Geolocation.checkPermissions();
    if (permission?.location !== "granted" && permission?.coarseLocation !== "granted") {
      const requested = await Geolocation.requestPermissions();
      if (requested?.location !== "granted" && requested?.coarseLocation !== "granted") {
        throw new GeolocationBridgeError(
          "permission_denied",
          "Izin lokasi ditolak. Absensi memerlukan akses lokasi untuk memverifikasi Anda berada di area kantor.",
        );
      }
    }

    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15_000 });
    if (!position?.coords) {
      throw UNAVAILABLE_ERROR;
    }
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? null,
    };
  } catch (error) {
    if (error instanceof GeolocationBridgeError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("location") && message.toLowerCase().includes("disabled")) {
      throw new GeolocationBridgeError(
        "location_disabled",
        "GPS tidak aktif. Aktifkan Lokasi di pengaturan perangkat, lalu coba lagi.",
      );
    }
    throw UNAVAILABLE_ERROR;
  }
}

export { isNativePlatform };
