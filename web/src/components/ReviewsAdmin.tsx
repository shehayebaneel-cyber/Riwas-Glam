import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { SITE } from "../config";
import type { Review } from "../types";

const BADGE: Record<string, string> = {
  PENDING: "bg-amber-400/15 text-amber-600",
  APPROVED: "bg-emerald-500/15 text-emerald-600",
  HIDDEN: "bg-red-500/15 text-red-500",
};

export function ReviewsAdmin({ adminKey }: { adminKey: string }) {
  const H = { "x-admin-key": adminKey };
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const load = () =>
    api
      .get<Review[]>("/api/admin/reviews", H)
      .then(setReviews)
      .catch(() => setReviews([]));
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);
  const patch = (id: number, data: Record<string, unknown>) => api.patch(`/api/admin/reviews/${id}`, data, H).then(load);
  if (!reviews) return <div className="text-muted py-10 text-center">Loading reviews…</div>;

  const pending = reviews.filter((r) => r.status === "PENDING").length;
  return (
    <div className="space-y-2">
      <p className="text-muted text-sm">
        New reviews stay hidden until you approve them. Featured reviews show first on your site.{pending ? ` · ${pending} awaiting review` : ""}
      </p>
      {reviews.length === 0 ? (
        <div className="card text-muted p-10 text-center">No reviews yet.</div>
      ) : (
        reviews.map((r) => (
          <ReviewCard
            key={r.id}
            r={r}
            patch={patch}
            onDelete={async () => {
              if (confirm("Delete this review?")) {
                await api.delete(`/api/admin/reviews/${r.id}`, H);
                load();
              }
            }}
          />
        ))
      )}
    </div>
  );
}

function ReviewCard({ r, patch, onDelete }: { r: Review; patch: (id: number, data: Record<string, unknown>) => Promise<unknown>; onDelete: () => void }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [text, setText] = useState(r.reply ?? "");
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <span className="text-amber-400">
          {"★".repeat(r.rating)}
          <span className="text-border">{"★".repeat(5 - r.rating)}</span>
        </span>
        <span className="text-ink font-semibold">{r.authorName}</span>
        {r.featured && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-600">★ Featured</span>}
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${BADGE[r.status ?? "PENDING"] ?? "bg-surface-2 text-muted"}`}>
          {(r.status ?? "").toLowerCase()}
        </span>
      </div>
      {r.comment && <p className="text-muted mt-1 text-sm">“{r.comment}”</p>}
      {r.reply && !replyOpen && (
        <div className="border-brand bg-surface-2 mt-2 rounded-xl border-l-2 p-2.5 text-sm">
          <p className="text-brand text-[11px] font-bold uppercase tracking-wide">Reply from {SITE.name}</p>
          <p className="text-ink mt-0.5">{r.reply}</p>
        </div>
      )}
      {replyOpen && (
        <div className="mt-2">
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a public reply…" className="input text-sm" />
          <div className="mt-1.5 flex gap-2 text-xs">
            <button
              onClick={async () => {
                await patch(r.id, { reply: text });
                setReplyOpen(false);
              }}
              className="btn btn-primary px-3 py-1"
            >
              Save reply
            </button>
            {r.reply && (
              <button
                onClick={async () => {
                  await patch(r.id, { reply: "" });
                  setText("");
                  setReplyOpen(false);
                }}
                className="btn btn-ghost px-3 py-1 text-red-500"
              >
                Remove reply
              </button>
            )}
            <button
              onClick={() => {
                setText(r.reply ?? "");
                setReplyOpen(false);
              }}
              className="btn btn-ghost text-muted px-3 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {r.status !== "APPROVED" && (
          <button onClick={() => patch(r.id, { status: "APPROVED" })} className="btn btn-ghost px-3 py-1 text-emerald-600">
            Approve
          </button>
        )}
        {r.status !== "HIDDEN" && (
          <button onClick={() => patch(r.id, { status: "HIDDEN" })} className="btn btn-ghost text-muted px-3 py-1">
            Hide
          </button>
        )}
        <button onClick={() => patch(r.id, { featured: !r.featured })} className={`btn btn-ghost px-3 py-1 ${r.featured ? "text-amber-600" : "text-muted"}`}>
          {r.featured ? "Unfeature" : "Feature"}
        </button>
        {!replyOpen && (
          <button onClick={() => setReplyOpen(true)} className="btn btn-ghost text-brand px-3 py-1">
            {r.reply ? "Edit reply" : "Reply"}
          </button>
        )}
        <button onClick={onDelete} className="btn btn-ghost px-3 py-1 text-red-500">
          Delete
        </button>
      </div>
    </div>
  );
}
