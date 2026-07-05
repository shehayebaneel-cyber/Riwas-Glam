import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Review } from "../types";

const BADGE: Record<string, string> = {
  PENDING: "bg-amber-400/15 text-amber-600", APPROVED: "bg-emerald-500/15 text-emerald-600", HIDDEN: "bg-red-500/15 text-red-500",
};

export function ReviewsAdmin({ adminKey }: { adminKey: string }) {
  const H = { "x-admin-key": adminKey };
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const load = () => api.get<Review[]>("/api/admin/reviews", H).then(setReviews).catch(() => setReviews([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const patch = (id: number, data: Record<string, unknown>) => api.patch(`/api/admin/reviews/${id}`, data, H).then(load);
  if (!reviews) return <div className="py-10 text-center text-muted">Loading reviews…</div>;

  const pending = reviews.filter((r) => r.status === "PENDING").length;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">New reviews stay hidden until you approve them. Featured reviews show first on your site.{pending ? ` · ${pending} awaiting review` : ""}</p>
      {reviews.length === 0 ? (
        <div className="card p-10 text-center text-muted">No reviews yet.</div>
      ) : reviews.map((r) => (
        <div key={r.id} className="card p-4">
          <div className="flex items-center gap-2">
            <span className="text-amber-400">{"★".repeat(r.rating)}<span className="text-border">{"★".repeat(5 - r.rating)}</span></span>
            <span className="font-semibold text-ink">{r.authorName}</span>
            {r.featured && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-600">★ Featured</span>}
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${BADGE[r.status ?? "PENDING"] ?? "bg-surface-2 text-muted"}`}>{(r.status ?? "").toLowerCase()}</span>
          </div>
          {r.comment && <p className="mt-1 text-sm text-muted">“{r.comment}”</p>}
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {r.status !== "APPROVED" && <button onClick={() => patch(r.id, { status: "APPROVED" })} className="btn btn-ghost px-3 py-1 text-emerald-600">Approve</button>}
            {r.status !== "HIDDEN" && <button onClick={() => patch(r.id, { status: "HIDDEN" })} className="btn btn-ghost px-3 py-1 text-muted">Hide</button>}
            <button onClick={() => patch(r.id, { featured: !r.featured })} className={`btn btn-ghost px-3 py-1 ${r.featured ? "text-amber-600" : "text-muted"}`}>{r.featured ? "Unfeature" : "Feature"}</button>
            <button onClick={async () => { if (confirm("Delete this review?")) { await api.delete(`/api/admin/reviews/${r.id}`, H); load(); } }} className="btn btn-ghost px-3 py-1 text-red-500">Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
