"use client";

import * as React from "react";
import { Camera, RefreshCw, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCamera } from "@/hooks/use-camera";

interface CameraCaptureProps {
  onCapture: (blob: Blob | null, previewUrl: string | null) => void;
}

export function CameraCapture({ onCapture }: CameraCaptureProps) {
  const { videoRef, isActive, error, start, stop, capture } = useCamera();
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCapture() {
    const blob = await capture();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    onCapture(blob, url);
    stop();
  }

  function handleRetake() {
    setPreviewUrl(null);
    onCapture(null, null);
    start();
  }

  return (
    <div className="space-y-3">
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-black">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Selfie" className="h-full w-full object-cover" />
        ) : (
          <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
        )}
        {!isActive && !previewUrl && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            <Video className="mr-2 h-4 w-4 animate-pulse" /> Mengaktifkan kamera...
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4 text-center text-sm text-white">
            {error}
          </div>
        )}
      </div>
      <div className="flex justify-center">
        {previewUrl ? (
          <Button type="button" variant="outline" onClick={handleRetake}>
            <RefreshCw className="h-4 w-4" /> Ambil Ulang
          </Button>
        ) : (
          <Button type="button" onClick={handleCapture} disabled={!isActive}>
            <Camera className="h-4 w-4" /> Ambil Foto
          </Button>
        )}
      </div>
    </div>
  );
}
