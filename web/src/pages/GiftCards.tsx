import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { api, money } from "../lib/api";
import { useCustomer } from "../context/CustomerAuth";
import { SITE } from "../config";
import type { GiftCard } from "../types";

export function GiftCards() {
  const { customer, authHeader } = useCustomer();
  const [cfg, setCfg] = useState<{ amounts: number[]; min: number; max: number } | null>(null);
  const [amount, setAmount] = useState(50);
  const [f, setF] = useState({ purchaserName: "", purchaserEmail: "", recipientName: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<GiftCard | null>(null);
  const [checkCode, setCheckCode] = useState("");
  const [checkResult, setCheckResult] = useState<GiftCard | null>(null);
  const [checkErr, setCheckErr] = useState("");

  useEffect(() => { api.get<{ amounts: number[]; min: number; max: number }>("/api/gift-cards/config").then((c) => { setCfg(c); setAmount(c.amounts[1] ?? c.amounts[0] ?? 50); }).catch(() => {}); }, []);
  useEffect(() => { if (customer) setF((x) => ({ ...x, purchaserName: x.purchaserName || customer.name, purchaserEmail: x.purchaserEmail || customer.email })); }, [customer]);

  async function buy() {
    if (cfg && (amount < cfg.min || amount > cfg.max)) { setErr(`Amount must be between ${money(cfg.min)} and ${money(cfg.max)}.`); return; }
    setBusy(true); setErr("");
    try { setDone(await api.post<GiftCard>("/api/gift-cards/buy", { amount, ...f }, authHeader)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't complete the purchase."); } finally { setBusy(false); }
  }
  async function check() {
    setCheckErr(""); setCheckResult(null);
    try { setCheckResult(await api.get<GiftCard>(`/api/gift-cards/${encodeURIComponent(checkCode.trim().toUpperCase())}`)); }
    catch { setCheckErr("Gift card not found. Check the code and try again."); }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="text-center">
          <p className="eyebrow">The perfect gift</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold text-ink">Gift Cards</h1>
          <p className="mt-2 text-muted">Treat someone to a Riwa's Glam experience. Buy a digital gift card and share the code — they redeem it in-salon.</p>
        </div>

        {done ? (
          <div className="card mt-8 p-8 text-center">
            <div className="text-4xl">🎁</div>
            <p className="mt-2 font-display text-xl font-bold text-ink">Gift card ready!</p>
            <p className="mt-1 text-muted">{money(done.balance)} for {f.recipientName || "your recipient"}.</p>
            <div className="mt-4 rounded-2xl bg-brand-soft p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Gift card code</p>
              <p className="mt-1 font-mono text-lg font-bold text-brand-dark">{done.code}</p>
            </div>
            <p className="mt-3 text-sm text-muted">Share this code with {f.recipientName || "them"}. They present it at the salon to redeem.</p>
            <button onClick={() => { setDone(null); setF({ purchaserName: customer?.name ?? "", purchaserEmail: customer?.email ?? "", recipientName: "", message: "" }); }} className="btn btn-ghost mt-5 px-5 py-2.5">Buy another</button>
          </div>
        ) : (
          <div className="card mt-8 space-y-4 p-6">
            <div>
              <p className="text-sm font-semibold text-ink">Amount</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(cfg?.amounts ?? [25, 50, 100]).map((v) => <button key={v} onClick={() => setAmount(v)} className={`chip ${amount === v ? "chip-active" : ""}`}>{money(v)}</button>)}
                <input type="number" min={cfg?.min ?? 10} max={cfg?.max ?? 500} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input w-28 !py-1.5 text-sm" />
              </div>
            </div>
            <input value={f.recipientName} onChange={(e) => setF({ ...f, recipientName: e.target.value })} placeholder="Recipient's name" className="input" />
            <textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} rows={2} placeholder="Personal message (optional)" className="input" />
            <div className="grid grid-cols-2 gap-3">
              <input value={f.purchaserName} onChange={(e) => setF({ ...f, purchaserName: e.target.value })} placeholder="Your name" className="input" />
              <input value={f.purchaserEmail} onChange={(e) => setF({ ...f, purchaserEmail: e.target.value })} placeholder="Your email" className="input" />
            </div>
            {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600">{err}</p>}
            <div className="rounded-xl border border-border p-3 text-xs text-muted">💳 Demo checkout — no real payment is taken. The gift card is issued instantly with a code.</div>
            <button onClick={buy} disabled={busy} className="btn btn-primary w-full py-3 text-lg disabled:opacity-60">{busy ? "Processing…" : `Buy ${money(amount || 0)} gift card`}</button>
          </div>
        )}

        {/* Check balance */}
        <div className="card mt-6 p-6">
          <p className="font-display font-bold text-ink">Check a gift card balance</p>
          <div className="mt-3 flex gap-2">
            <input value={checkCode} onChange={(e) => setCheckCode(e.target.value.toUpperCase())} placeholder="GC-XXXX-XXXX-XXXX" className="input flex-1 font-mono text-sm" />
            <button onClick={check} disabled={!checkCode.trim()} className="btn btn-ghost px-4 disabled:opacity-40">Check</button>
          </div>
          {checkErr && <p className="mt-2 text-sm font-medium text-red-600">{checkErr}</p>}
          {checkResult && (
            <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
              <p className="font-bold text-ink">Balance: {money(checkResult.balance)} <span className="font-normal text-muted">/ {money(checkResult.initialValue ?? checkResult.balance)}</span></p>
              <p className="text-muted">Status: {checkResult.status.toLowerCase()}{checkResult.expiresAt ? ` · expires ${new Date(checkResult.expiresAt).toLocaleDateString()}` : ""}</p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted">Questions? <a href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noreferrer" className="font-semibold text-brand">Message us on WhatsApp</a></p>
      </div>
    </Layout>
  );
}
