import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { api, money } from "../lib/api";
import { useCustomer } from "../context/CustomerAuth";
import { PaymentMethodPicker, type PayMethod } from "../components/PaymentMethodPicker";
import { QRCode } from "../components/QRCode";
import { SITE } from "../config";
import type { GiftCard } from "../types";

export function GiftCards() {
  const { customer, authHeader } = useCustomer();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<{ amounts: number[]; min: number; max: number } | null>(null);
  const [amount, setAmount] = useState(50);
  const [f, setF] = useState({ purchaserName: "", purchaserPhone: "", purchaserEmail: "", recipientName: "", message: "" });
  const [payMethod, setPayMethod] = useState<PayMethod>("CASH");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [checkCode, setCheckCode] = useState("");
  const [checkResult, setCheckResult] = useState<GiftCard | null>(null);
  const [checkErr, setCheckErr] = useState("");

  useEffect(() => {
    api
      .get<{ amounts: number[]; min: number; max: number }>("/api/gift-cards/config")
      .then((c) => {
        setCfg(c);
        setAmount(c.amounts[1] ?? c.amounts[0] ?? 50);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (customer)
      setF((x) => ({
        ...x,
        purchaserName: x.purchaserName || customer.name,
        purchaserPhone: x.purchaserPhone || customer.phone,
        purchaserEmail: x.purchaserEmail || customer.email,
      }));
  }, [customer]);

  async function buy() {
    if (cfg && (amount < cfg.min || amount > cfg.max)) {
      setErr(`Amount must be between ${money(cfg.min)} and ${money(cfg.max)}.`);
      return;
    }
    if (!f.purchaserName.trim() || !f.purchaserPhone.trim()) {
      setErr("Please enter your name and phone.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      // The code is delivered only after payment — go to the gateway (Whish) or our
      // status page, which reveals the code once the payment is confirmed.
      const r = await api.post<{ redirectUrl?: string | null; reference: string }>(
        "/api/gift-cards/buy",
        { amount, paymentMethod: payMethod, ...f },
        authHeader,
      );
      if (r.redirectUrl) {
        window.location.href = r.redirectUrl;
        return;
      }
      navigate(`/payment/${r.reference}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't complete the purchase.");
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setCheckErr("");
    setCheckResult(null);
    try {
      setCheckResult(await api.get<GiftCard>(`/api/gift-cards/${encodeURIComponent(checkCode.trim().toUpperCase())}`));
    } catch {
      setCheckErr("Gift card not found. Check the code and try again.");
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="text-center">
          <p className="eyebrow">The perfect gift</p>
          <h1 className="font-display text-ink mt-2 text-4xl font-extrabold">Gift Cards</h1>
          <p className="text-muted mt-2">Treat someone to a Riwa's Glam experience. Buy a digital gift card and share the code — they redeem it in-salon.</p>
        </div>

        <div className="card mt-8 space-y-4 p-6">
          <div>
            <p className="text-ink text-sm font-semibold">Amount</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(cfg?.amounts ?? [25, 50, 100]).map((v) => (
                <button key={v} onClick={() => setAmount(v)} className={`chip ${amount === v ? "chip-active" : ""}`}>
                  {money(v)}
                </button>
              ))}
              <input
                type="number"
                min={cfg?.min ?? 10}
                max={cfg?.max ?? 500}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="input w-28 !py-1.5 text-sm"
              />
            </div>
          </div>
          <input value={f.recipientName} onChange={(e) => setF({ ...f, recipientName: e.target.value })} placeholder="Recipient's name" className="input" />
          <textarea
            value={f.message}
            onChange={(e) => setF({ ...f, message: e.target.value })}
            rows={2}
            placeholder="Personal message (optional)"
            className="input"
          />
          <input value={f.purchaserName} onChange={(e) => setF({ ...f, purchaserName: e.target.value })} placeholder="Your name *" className="input" />
          <div className="grid grid-cols-2 gap-3">
            <input value={f.purchaserPhone} onChange={(e) => setF({ ...f, purchaserPhone: e.target.value })} placeholder="Your phone *" className="input" />
            <input value={f.purchaserEmail} onChange={(e) => setF({ ...f, purchaserEmail: e.target.value })} placeholder="Email (optional)" className="input" />
          </div>
          <PaymentMethodPicker value={payMethod} onChange={setPayMethod} />
          {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600">{err}</p>}
          <p className="text-muted text-xs">The gift card code is delivered once your payment is confirmed.</p>
          <button onClick={buy} disabled={busy} className="btn btn-primary w-full py-3 text-lg disabled:opacity-60">
            {busy ? "Processing…" : payMethod === "WHISH" ? `Pay ${money(amount || 0)} with Whish` : `Buy ${money(amount || 0)} gift card`}
          </button>
        </div>

        {/* Check balance */}
        <div className="card mt-6 p-6">
          <p className="font-display text-ink font-bold">Check a gift card balance</p>
          <div className="mt-3 flex gap-2">
            <input
              value={checkCode}
              onChange={(e) => setCheckCode(e.target.value.toUpperCase())}
              placeholder="GC-XXXX-XXXX-XXXX"
              className="input flex-1 font-mono text-sm"
            />
            <button onClick={check} disabled={!checkCode.trim()} className="btn btn-ghost px-4 disabled:opacity-40">
              Check
            </button>
          </div>
          {checkErr && <p className="mt-2 text-sm font-medium text-red-600">{checkErr}</p>}
          {checkResult && (
            <div className="bg-surface-2 mt-3 flex items-center gap-3 rounded-xl p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-ink font-bold">
                  Balance: {money(checkResult.balance)}{" "}
                  <span className="text-muted font-normal">/ {money(checkResult.initialValue ?? checkResult.balance)}</span>
                </p>
                <p className="text-muted">
                  Status: {checkResult.status.toLowerCase()}
                  {checkResult.expiresAt ? ` · expires ${new Date(checkResult.expiresAt).toLocaleDateString()}` : ""}
                </p>
                <p className="text-muted mt-0.5 font-mono text-xs">{checkResult.code}</p>
              </div>
              <QRCode value={checkResult.code} size={84} className="shrink-0" />
            </div>
          )}
        </div>

        <p className="text-muted mt-6 text-center text-sm">
          Questions?{" "}
          <a href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noreferrer" className="text-brand font-semibold">
            Message us on WhatsApp
          </a>
        </p>
      </div>
    </Layout>
  );
}
