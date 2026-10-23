"use client";

/** Hospitality runs on WIB (the villa's own timezone; department default in 0291). */
export const CHAT_TZ = "Asia/Jakarta";

export function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CHAT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: CHAT_TZ });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: CHAT_TZ });
}

export function formatListStamp(iso: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const key = dayKey(iso);
  if (key === today) return formatTime(iso);
  if (key === yesterday) return "Kemarin";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", timeZone: CHAT_TZ });
}

export function formatDaySeparator(iso: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const key = dayKey(iso);
  if (key === today) return "Hari ini";
  if (key === yesterday) return "Kemarin";
  return new Date(iso).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: CHAT_TZ });
}

/** "2 j 15 m" style age since an ISO time. */
export function formatAge(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${mins} m`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h} j ${mins % 60} m`;
  return `${Math.floor(h / 24)} hari`;
}

export function isOverdue(targetAt: string | null, now = Date.now()): boolean {
  return !!targetAt && Date.parse(targetAt) < now;
}

const AVATAR_COLORS = ["bg-emerald-600", "bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-teal-600", "bg-indigo-600"];

export function avatarColor(name: string): string {
  return AVATAR_COLORS[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z\s]/g, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? name[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}

const PHOTO_MAX_SIDE = 1600;

/** Phone photos are 5-12MB; shrink to 1600px JPEG in the browser so uploads work on a weak signal. */
export function shrinkPhoto(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(src);
      const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Browser tidak bisa memproses foto"));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(new File([blob], "foto.jpg", { type: "image/jpeg" })) : reject(new Error("Foto gagal diproses"))),
        "image/jpeg",
        0.82,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error("File ini bukan foto yang bisa dibuka"));
    };
    img.src = src;
  });
}
