import { useState } from "react";

// A draggable before/after image comparison slider.
export function BeforeAfter({ before, after, className = "" }: { before: string; after: string; className?: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className={`relative aspect-[4/3] w-full select-none overflow-hidden rounded-2xl ${className}`}>
      <img src={after} alt="After" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <img
        src={before}
        alt="Before"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        draggable={false}
      />
      <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white">BEFORE</span>
      <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white">AFTER</span>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }}>
        <div className="text-brand absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-lg">
          ↔
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Compare before and after"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
