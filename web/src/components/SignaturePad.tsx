import { useRef } from "react";

/** Draw-to-sign canvas; emits a PNG data URL on every stroke. */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function pos(e: React.MouseEvent | React.TouchEvent) {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    const t = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) };
  }
  function start(e: React.MouseEvent | React.TouchEvent) {
    drawing.current = true;
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "#4a3330";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    onChange(ref.current!.toDataURL("image/png"));
  }
  function end() {
    drawing.current = false;
  }
  function clear() {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    onChange("");
  }

  return (
    <div>
      <canvas
        ref={ref}
        width={500}
        height={160}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        className="border-border w-full touch-none rounded-xl border bg-white"
        style={{ aspectRatio: "500 / 160" }}
      />
      <button type="button" onClick={clear} className="text-muted mt-1 text-xs">
        Clear signature
      </button>
    </div>
  );
}
