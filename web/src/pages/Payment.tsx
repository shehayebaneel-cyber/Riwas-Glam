import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { api, money } from "../lib/api";
import { SITE } from "../config";

type PayStatus = {
  reference: string;
  kind: "BOOKING" | "GIFTCARD";
  method: "CASH" | "WHISH";
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
  amount: number;
  currency: string;
  giftCard?: { code: string; balance: number; expiresAt: string | null };
  booking?: { serviceName: string; date: string; time: string; staffName: string };
};

const prettyDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

export function Payment() {
  const { reference = "" } = useParams();
  const [p, setP] = useState<PayStatus | null>(null);
  const [err, setErr] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const d = await api.get<PayStatus>(`/api/payments/${encodeURIComponent(reference)}`);
        if (!alive) return;
        setP(d);
        if (d.status === "PENDING") timer.current = window.setTimeout(poll, 3000); // reflect webhook confirmation live
      } catch {
        if (alive) setErr("We couldn't find that order.");
      }
    }
    poll();
    return () => { alive = false; if (timer.current) clearTimeout(timer.current); };
  }, [reference]);

  const wa = `https://wa.me/${SITE.whatsapp}`;

  return (
    <Layout>
      <div className="mx-auto max-w-md px-5 py-14">
        {err && (
          <div className="card p-8 text-center">
            <div className="text-4xl">🔍</div>
            <p className="mt-3 font-display text-xl font-bold text-ink">Order not found</p>
            <p className="mt-1 text-sm text-muted">{err}</p>
            <Link to="/" className="btn btn-ghost mt-5 px-6 py-2.5">Back to home</Link>
          </div>
        )}

        {!err && !p && <p className="py-10 text-center text-muted">Loading…</p>}

        {p && (
          <div className="card p-7 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Reference</p>
            <p className="font-mono text-sm font-bold text-ink">{p.reference}</p>

            {/* PAID */}
            {p.status === "PAID" && (
              <>
                <div className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-3xl text-emerald-600">✓</div>
                <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">Payment confirmed</h1>
                {p.kind === "GIFTCARD" && p.giftCard && (
                  <>
                    <p className="mt-1 text-sm text-muted">Your {money(p.amount)} gift card is ready 🎁</p>
                    <div className="mt-4 rounded-2xl bg-brand-soft p-4">
                      <p className="text-xs uppercase tracking-wide text-muted">Gift card code</p>
                      <p className="mt-1 font-mono text-lg font-bold text-brand-dark">{p.giftCard.code}</p>
                    </div>
                    <p className="mt-3 text-sm text-muted">Present this code at the salon to redeem.</p>
                  </>
                )}
                {p.kind === "BOOKING" && p.booking && (
                  <>
                    <p className="mt-1 text-sm text-muted">You're all booked — see you soon!</p>
                    <div className="mt-4 rounded-2xl bg-surface-2 p-4 text-left text-sm">
                      <Row k="Service" v={p.booking.serviceName} />
                      <Row k="When" v={`${prettyDate(p.booking.date)} at ${p.booking.time}`} />
                      <Row k="With" v={p.booking.staffName || "Our team"} />
                      <Row k="Paid" v={money(p.amount)} />
                    </div>
                  </>
                )}
                <Link to="/" className="btn btn-primary mt-6 w-full py-3">Back to home</Link>
              </>
            )}

            {/* PENDING */}
            {p.status === "PENDING" && (
              <>
                <div className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-3xl">⏳</div>
                <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">Awaiting payment</h1>
                <p className="mt-1 text-sm text-muted">
                  Your {p.kind === "GIFTCARD" ? "gift card" : "booking"} of {money(p.amount)} is reserved. Online Whish payment is being set up — we'll reach out to finish it, or you can pay us directly.
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <a href={wa} target="_blank" rel="noreferrer" className="btn btn-primary py-3">Message us to pay</a>
                  <Link to="/" className="btn btn-ghost py-2.5">Back to home</Link>
                </div>
                <p className="mt-3 text-xs text-muted">This page updates automatically once payment is confirmed.</p>
              </>
            )}

            {/* FAILED / CANCELLED */}
            {(p.status === "FAILED" || p.status === "CANCELLED") && (
              <>
                <div className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 text-3xl text-red-600">✕</div>
                <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">Payment {p.status.toLowerCase()}</h1>
                <p className="mt-1 text-sm text-muted">This order wasn't completed. You can try again or reach out and we'll help.</p>
                <div className="mt-5 flex flex-col gap-2">
                  <Link to={p.kind === "GIFTCARD" ? "/gift-cards" : "/book"} className="btn btn-primary py-3">Try again</Link>
                  <a href={wa} target="_blank" rel="noreferrer" className="btn btn-ghost py-2.5">Message us</a>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3 border-b border-border py-2 last:border-0"><span className="text-muted">{k}</span><span className="font-semibold text-ink">{v}</span></div>;
}
