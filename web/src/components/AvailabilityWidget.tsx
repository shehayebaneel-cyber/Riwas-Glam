import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { todayIso, parseDay } from "../lib/time";

type Avail = { closed: boolean; today: boolean; tomorrow: boolean; next: { date: string; time: string } | null };

function pretty(d: string) {
  const t = new Date(d + "T00:00:00");
  const today = parseDay(todayIso());
  const diff = Math.round((t.getTime() - today.getTime()) / 86400000);
  return diff === 0 ? "today" : diff === 1 ? "tomorrow" : t.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Slim "next opening" pill for the homepage hero — one tap to book. */
export function AvailabilityWidget() {
  const [a, setA] = useState<Avail | null>(null);
  useEffect(() => {
    api
      .get<Avail>("/api/next-availability")
      .then(setA)
      .catch(() => {});
  }, []);
  if (!a || a.closed || !a.next) return null;
  return (
    <Link
      to="/book"
      className="border-border bg-surface hover:border-brand mt-5 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm shadow-sm transition active:scale-[0.98]"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="text-ink font-semibold">
        Next opening {pretty(a.next.date)} at {a.next.time}
      </span>
      <span className="text-brand font-semibold">Book →</span>
    </Link>
  );
}
