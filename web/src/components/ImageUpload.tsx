import { useRef, useState } from "react";
import { api } from "../lib/api";

// Reads a picked image, shrinks it in the browser (so uploads stay small), sends
// it to the backend, and returns the hosted URL via onChange. Also allows pasting
// an image link directly.
async function shrinkToDataUrl(file: File): Promise<string> {
  const readAs = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("decode failed"));
    i.src = readAs;
  });
  const MAX = 1400;
  let { width, height } = img;
  if (width > MAX || height > MAX) {
    const s = Math.min(MAX / width, MAX / height);
    width = Math.round(width * s);
    height = Math.round(height * s);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
  // Preserve transparency for PNG/WebP (logos, graphics); compress photos as JPEG.
  const keepAlpha = file.type === "image/png" || file.type === "image/webp";
  return canvas.toDataURL(keepAlpha ? "image/png" : "image/jpeg", 0.82);
}

export function ImageUpload({
  value,
  onChange,
  adminKey,
  className = "",
}: {
  value: string;
  onChange: (url: string) => void;
  adminKey: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const dataUrl = await shrinkToDataUrl(file);
      const r = await api.post<{ url: string }>("/api/admin/images", { dataUrl }, { "x-admin-key": adminKey });
      onChange(r.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="border-border bg-surface-2 h-16 w-16 shrink-0 overflow-hidden rounded-xl border">
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="text-muted flex h-full w-full items-center justify-center text-xl">🖼️</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn btn-ghost px-3 py-1.5 text-xs disabled:opacity-60">
            {busy ? "Uploading…" : "📤 Upload photo"}
          </button>
          {value && (
            <button type="button" onClick={() => onChange("")} className="btn btn-ghost px-3 py-1.5 text-xs text-red-500">
              Remove
            </button>
          )}
        </div>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="…or paste an image link" className="input mt-2 !py-1.5 text-xs" />
        {err && <p className="mt-1 text-xs font-medium text-red-600">{err}</p>}
      </div>
    </div>
  );
}
