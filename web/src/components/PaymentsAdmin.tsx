import { useEffect, useState } from "react";
import { api, money } from "../lib/api";

interface Payment {
  id: string;
  reference: string;
  kind: "BOOKING" | "GIFTCARD";
  method: "CASH" | "WHISH";
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
  amount: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  providerTxnId: string;
  createdAt: string;
  paidAt: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  PAID: "bg-emerald-500/15 text-emerald-600",
  PENDING: "bg-amber-400/15 text-amber-600",
  FAILED: "bg-red-500/15 text-red-500",
  CANCELLED: "bg-surface-2 text-muted",
  REFUNDED: "bg-brand-soft text-brand-dark",
};
const FILTERS: [string, string][] = [["ALL", "All"], ["PENDING", "Pending"], ["PAID", "Paid"], ["FAILED", "Failed"], ["CANCELLED", "Cancelled"]];

function MethodBadge({ method }: { method: string }) {
  return method === "WHISH"
    ? <span className="inline-flex items-center rounded-md bg-[#e11d48] px-1.5 py-0.5 text-[10px] font-extrabold lowercase text-white">whish</span>
    : <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-ink">💵 Cash</span>;
}

export function PaymentsAdmin({ adminKey }: { adminKey: string }) {
  const H = { "x-admin-key": adminKey };
  const [items, setItems] = useState<Payment[] | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.get<Payment[]>("/api/admin/payments", H).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  if (!items) return <div className="py-10 text-center text-muted">Loading…</div>;

  async function act(p: Payment, path: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(p.id);
    try { await api.post(`/api/admin/payments/${p.id}/${path}`, {}, H); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(null); }
  }

  const paidTotal = items.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
  const pending = items.filter((p) => p.status === "PENDING");
  const pendingTotal = pending.reduce((s, p) => s + p.amount, 0);
  const shown = filter === "ALL" ? items : items.filter((p) => p.status === filter);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 text-center"><p className="text-xs text-muted">Collected</p><p className="font-display text-xl font-extrabold text-ink">{money(paidTotal)}</p></div>
        <div className="card p-3 text-center"><p className="text-xs text-muted">Pending</p><p className="font-display text-xl font-extrabold text-amber-600">{money(pendingTotal)}</p></div>
        <div className="card p-3 text-center"><p className="text-xs text-muted">Payments</p><p className="font-display text-xl font-extrabold text-ink">{items.length}</p></div>
      </div>

      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-full bg-surface-2 p-1">
        {FILTERS.map(([v, label]) => {
          const n = v === "ALL" ? items.length : items.filter((p) => p.status === v).length;
          return <button key={v} onClick={() => setFilter(v)} className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${filter === v ? "bg-brand text-white" : "text-muted"}`}>{label}{n ? ` (${n})` : ""}</button>;
        })}
      </div>

      <div className="space-y-2">
        {shown.length === 0 ? <div className="card p-8 text-center text-muted">No payments here yet.</div> : shown.map((p) => (
          <div key={p.id} className="card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <MethodBadge method={p.method} />
              <span className="font-display font-bold text-ink">{money(p.amount)}</span>
              <span className="text-xs text-muted">{p.kind === "GIFTCARD" ? "Gift card" : "Booking"}</span>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[p.status] ?? "bg-surface-2 text-muted"}`}>{p.status.toLowerCase()}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              <span className="font-mono">{p.reference}</span>
              {p.customerName ? ` · ${p.customerName}` : ""}
              {p.customerPhone ? <> · <a href={`tel:${p.customerPhone}`} className="text-brand">{p.customerPhone}</a></> : ""}
              {` · ${new Date(p.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
              {p.providerTxnId ? ` · txn ${p.providerTxnId}` : ""}
              {" · "}<a href={`/receipt/${p.reference}`} target="_blank" rel="noreferrer" className="font-semibold text-brand">Receipt ↗</a>
            </p>
            {p.status === "PENDING" && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {p.method === "CASH" && <button disabled={busy === p.id} onClick={() => act(p, "mark-paid")} className="btn btn-ghost px-3 py-1.5 text-xs font-semibold text-emerald-600 disabled:opacity-50">Mark as paid</button>}
                <button disabled={busy === p.id} onClick={() => act(p, "cancel", `Cancel this ${p.kind === "GIFTCARD" ? "gift card" : "booking"} payment?`)} className="btn btn-ghost px-3 py-1.5 text-xs font-semibold text-red-500 disabled:opacity-50">Cancel</button>
                {p.method === "WHISH" && <span className="self-center text-[11px] text-muted">Confirmed automatically by Whish</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
