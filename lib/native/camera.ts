import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

/**
 * Launches the OS camera app (native intent, not an in-page video stream)
 * and returns the captured photo as a JPEG blob — front camera, matching
 * the web app's selfie-style attendance capture. Only called when
 * isNativePlatform() is true.
 */
export async function takeNativePhoto(): Promise<Blob | null> {
  const permission = await Camera.checkPermissions();
  if (permission.camera !== "granted") {
    const requested = await Camera.requestPermissions({ permissions: ["camera"] });
    if (requested.camera !== "granted") return null;
  }

  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera,
    direction: "FRONT" as never,
    quality: 85,
    allowEditing: false,
    correctOrientation: true,
  });

  if (!photo.base64String) return null;
  const byteChars = atob(photo.base64String);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: `image/${photo.format || "jpeg"}` });
}

/** Gallery picker for memo/announcement attachment uploads — returns a blob + suggested filename. */
export async function pickFromGallery(): Promise<{ blob: Blob; fileName: string } | null> {
  const permission = await Camera.checkPermissions();
  if (permission.photos !== "granted" && permission.photos !== "limited") {
    const requested = await Camera.requestPermissions({ permissions: ["photos"] });
    if (requested.photos !== "granted" && requested.photos !== "limited") return null;
  }

  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Base64,
    source: CameraSource.Photos,
    quality: 90,
  });

  if (!photo.base64String) return null;
  const byteChars = atob(photo.base64String);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const format = photo.format || "jpeg";
  return { blob: new Blob([bytes], { type: `image/${format}` }), fileName: `photo-${Date.now()}.${format}` };
}
