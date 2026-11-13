"use client";

import * as React from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/** Pecah teks menjadi awalan + SATU bilangan bulat + akhiran, atau null bila tidak cocok. */
export function splitNumber(text: string): { prefix: string; value: number; suffix: string; grouped: boolean } | null {
  const matches = text.match(/\d+(?:\.\d{3})*/g);
  // Lebih dari satu kelompok angka ("12/15", "Rp 1,2 jt", "12,5%") tidak
  // dianimasikan: menebak bentuknya berisiko menampilkan angka yang keliru.
  if (!matches || matches.length !== 1) return null;
  const raw = matches[0];
  const at = text.indexOf(raw);
  const value = Number(raw.replace(/\./g, ""));
  if (!Number.isSafeInteger(value)) return null;
  return { prefix: text.slice(0, at), value, suffix: text.slice(at + raw.length), grouped: raw.includes(".") };
}

/**
 * Nilai kartu statistik yang "berhitung" menuju angkanya saat muncul.
 * Bingkai TERAKHIR selalu teks asli dari pemanggil -- animasi hanya hiasan
 * dan tidak pernah mengubah angka akhir yang dibaca pengguna.
 */
export function AnimatedValue({ value, duration = 750 }: { value: string; duration?: number }) {
  const [shown, setShown] = React.useState(value);
  const previous = React.useRef(0);

  useIsoLayoutEffect(() => {
    const parts = splitNumber(value);
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!parts || reduce || parts.value === previous.current) {
      setShown(value);
      if (parts) previous.current = parts.value;
      return;
    }
    const from = previous.current;
    const to = parts.value;
    previous.current = to;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      if (t >= 1) {
        setShown(value);
        return;
      }
      const n = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      setShown(`${parts.prefix}${parts.grouped ? n.toLocaleString("id-ID") : String(n)}${parts.suffix}`);
      raf = requestAnimationFrame(step);
    };
    step(start);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className="tabular-nums">{shown}</span>;
}
