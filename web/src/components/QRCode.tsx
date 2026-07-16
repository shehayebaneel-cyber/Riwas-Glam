import { useEffect, useState } from "react";
import QR from "qrcode";

/** Renders a QR code for any string (a code, a URL, an order reference…). */
export function QRCode({ value, size = 132, className = "" }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    QR.toDataURL(value, { margin: 1, width: size * 2, color: { dark: "#4a3330", light: "#ffffff" } })
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value, size]);
  if (!src) return <div style={{ width: size, height: size }} className={`bg-surface-2 rounded-xl ${className}`} />;
  return <img src={src} alt="QR code" width={size} height={size} className={`rounded-xl ${className}`} />;
}
