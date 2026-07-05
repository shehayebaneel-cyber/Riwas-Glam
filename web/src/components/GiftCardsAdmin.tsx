import { useEffect, useState } from "react";
import { api, money } from "../lib/api";
import type { GiftCard } from "../types";

const BADGE: Record<string, string> = { ACTIVE: "bg-emerald-500/15 text-emerald-600", REDEEMED: "bg-surface-2 text-muted", VOID: "bg-red-500/15 text-red-500" };
interface Summary { count: number; issued: number; outstanding: number; redeemed: number }
interface Cfg { amounts: number[]; min: number; max: number; expiryMonths: number }

export function GiftCardsAdmin({ adminKey }: { adminKey: string }) {
  const H = { "x-admin-key": adminKey };
  const [data, setData] = useState<{ items: GiftCard[]; summary: Summary } | null>(null);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [amounts, setAmounts] = useState("");
  const load = () => {
    api.get<{ items: GiftCard[]; summary: Summary }>("/api/admin/gift-cards", H).then(setData).catch(() => setData(null));
    api.get<Cfg>("/api/admin/settings/giftcard", H).then((c) => { setCfg(c); setAmounts(c.amounts.join(", ")); }).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  if (!data || !cfg) return <div className="py-10 text-center text-muted">Loading…</div>;

  async function redeem(c: GiftCard) {
    const a = prompt(`Redeem how much from ${c.code}? Balance is ${money(c.balance)}.`);
    if (a === null) return;
    await api.post(`/api/admin/gift-cards/${c.id}/redeem`, { amount: Number(a) }, H).catch((e) => alert(e instanceof Error ? e.message : "Failed")); load();
  }
  async function voidCard(c: GiftCard) { if (confirm(`Void gift card ${c.code}?`)) { await api.post(`/api/admin/gift-cards/${c.id}/void`, {}, H); load(); } }
  async function saveCfg() {
    const next = { ...cfg, amounts: amounts.split(",").map((s) => Number(s.trim())).filter((n) => n > 0) };
    await api.patch("/api/admin/settings/giftcard", next, H); load();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Issued", String(data.summary.count)], ["Total value", money(data.summary.issued)], ["Outstanding", money(data.summary.outstanding)], ["Redeemed", money(data.summary.redeemed)]].map(([l, v]) => (
          <div key={l} className="card p-3 text-center"><p className="text-xs text-muted">{l}</p><p className="font-display text-xl font-extrabold text-ink">{v}</p></div>
        ))}
      </div>

      {/* Settings */}
      <div className="card p-4">
        <p className="font-display font-bold text-ink">Gift card settings</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-ink">Suggested amounts <span className="font-normal text-muted">(comma-separated)</span><input value={amounts} onChange={(e) => setAmounts(e.target.value)} className="input mt-1" /></label>
          <label className="text-sm font-semibold text-ink">Expiry (months, 0 = never)<input type="number" value={cfg.expiryMonths} onChange={(e) => setCfg({ ...cfg, expiryMonths: Number(e.target.value) })} className="input mt-1" /></label>
          <label className="text-sm font-semibold text-ink">Min amount<input type="number" value={cfg.min} onChange={(e) => setCfg({ ...cfg, min: Number(e.target.value) })} className="input mt-1" /></label>
          <label className="text-sm font-semibold text-ink">Max amount<input type="number" value={cfg.max} onChange={(e) => setCfg({ ...cfg, max: Number(e.target.value) })} className="input mt-1" /></label>
        </div>
        <button onClick={saveCfg} className="btn btn-primary mt-3 px-4 py-1.5 text-sm">Save settings</button>
      </div>

      {/* Issued cards */}
      <div className="space-y-2">
        {data.items.length === 0 ? <div className="card p-8 text-center text-muted">No gift cards sold yet.</div> : data.items.map((c) => (
          <div key={c.id} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="font-mono font-semibold text-ink">{c.code}</span>
            <span className="text-muted">{money(c.balance)} / {money(c.initialValue ?? 0)}{c.recipientName ? ` · for ${c.recipientName}` : ""}{c.purchaserName ? ` · from ${c.purchaserName}` : ""}</span>
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${BADGE[c.status] ?? "bg-surface-2 text-muted"}`}>{c.status.toLowerCase()}</span>
            {c.status === "ACTIVE" && <button onClick={() => redeem(c)} className="btn btn-ghost px-3 py-1 text-xs text-emerald-600">Redeem</button>}
            {c.status !== "VOID" && <button onClick={() => voidCard(c)} className="btn btn-ghost px-3 py-1 text-xs text-red-500">Void</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
