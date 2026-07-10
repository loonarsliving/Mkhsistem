"use client";

import * as React from "react";

import { GeolocationBridgeError, getNativePosition, isNativePlatform } from "@/lib/native/geolocation";

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
}

/** Wraps the browser Geolocation API with loading/error state for attendance check-in/out. */
export function useGeolocation() {
  const [state, setState] = React.useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    loading: false,
  });

  const request = React.useCallback(() => {
    if (isNativePlatform()) {
      setState((s) => ({ ...s, loading: true, error: null }));
      getNativePosition()
        .then((position) => setState({ ...position, error: null, loading: false }))
        .catch((error: unknown) => {
          const message = error instanceof GeolocationBridgeError ? error.message : "Gagal mendapatkan lokasi. Pastikan GPS aktif.";
          setState((s) => ({ ...s, loading: false, error: message }));
        });
      return;
    }

    if (!("geolocation" in navigator)) {
      setState((s) => ({ ...s, error: "Perangkat tidak mendukung geolocation" }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          error: null,
          loading: false,
        });
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Aktifkan akses lokasi untuk melakukan absensi."
            : "Gagal mendapatkan lokasi. Pastikan GPS aktif.";
        setState((s) => ({ ...s, loading: false, error: message }));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }, []);

  return { ...state, request };
}
