import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Result = { type: string; label: string; detail: string; tab: string };

/** One search box across customers, bookings, gift cards, services, staff, payments… */
export function GlobalSearch({ adminKey, onGo }: { adminKey: string; onGo: (tab: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      api
        .get<{ results: Result[] }>(`/api/admin/search?q=${encodeURIComponent(q.trim())}`, { "x-admin-key": adminKey })
        .then((d) => {
          setResults(d.results);
          setOpen(true);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(id);
  }, [q, adminKey]);

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder="Search customers, gift cards, payments…"
        className="input !py-2 text-sm"
      />
      {open && results.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="border-border bg-surface absolute left-0 right-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-2xl border p-1.5 shadow-xl">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => {
                  onGo(r.tab);
                  setOpen(false);
                  setQ("");
                }}
                className="hover:bg-surface-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition"
              >
                <span className="bg-brand-soft text-brand-dark shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold">{r.type}</span>
                <span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">{r.label}</span>
                {r.detail && <span className="text-muted shrink-0 text-xs">{r.detail}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
