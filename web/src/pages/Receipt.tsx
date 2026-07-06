import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCode } from "../components/QRCode";
import { api } from "../lib/api";

const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
type Receipt = {
  reference: string; kind: string; method: string; status: string; amount: number; currency: string;
  createdAt: string; paidAt: string | null; customerName: string;
  salon: { name: string; address: string; phone: string; logo: string; instagram: string; whatsapp: string };
  booking?: { serviceName: string; date: string; time: string; staffName: string; addOns: { name: string; price: number }[]; price: number };
  giftCard?: { code: string; initialValue: number };
};

export function Receipt() {
  const { reference = "" } = useParams();
  const [r, setR] = useState<Receipt | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { api.get<Receipt>(`/api/receipts/${encodeURIComponent(reference)}`).then(setR).catch(() => setErr(true)); }, [reference]);
  const url = typeof window !== "undefined" ? window.location.href : "";
  if (err) return <div className="p-16 text-center text-muted">Receipt not found.</div>;
  if (!r) return <div className="p-16 text-center text-muted">Loading…</div>;
  const waShare = `https://wa.me/?text=${encodeURIComponent(`Your ${r.salon.name} receipt: ${url}`)}`;
  const mailShare = `mailto:?subject=${encodeURIComponent(`${r.salon.name} receipt ${r.reference}`)}&body=${encodeURIComponent(`View your receipt: ${url}`)}`;
  const base = r.booking ? r.booking.price - r.booking.addOns.reduce((s, a) => s + a.price, 0) : 0;
  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <div className="printable rounded-2xl border border-border bg-white p-6">
        <div className="text-center">
          {r.salon.logo ? <img src={r.salon.logo} alt={r.salon.name} className="mx-auto h-14 w-auto" /> : <p className="font-display text-2xl font-extrabold text-ink">{r.salon.name}</p>}
          {r.salon.address && <p className="mt-1 text-xs text-muted">{r.salon.address}</p>}
          <p className="text-xs text-muted">{r.salon.phone}{r.salon.instagram ? ` · @${r.salon.instagram}` : ""}</p>
        </div>
        <div className="my-4 border-t border-dashed border-border" />
        <div className="flex justify-between text-xs text-muted"><span>Receipt</span><span className="font-mono">{r.reference}</span></div>
        <div className="flex justify-between text-xs text-muted"><span>Date</span><span>{new Date(r.paidAt ?? r.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span></div>
        {r.customerName && <div className="flex justify-between text-xs text-muted"><span>Customer</span><span>{r.customerName}</span></div>}
        <div className="my-4 border-t border-dashed border-border" />
        {r.booking && (
          <>
            <Line label={r.booking.serviceName} value={money(base)} />
            {r.booking.addOns.map((a) => <Line key={a.name} label={`+ ${a.name}`} value={money(a.price)} sub />)}
            <p className="mt-1 text-xs text-muted">{new Date(r.booking.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at {r.booking.time}{r.booking.staffName ? ` · ${r.booking.staffName}` : ""}</p>
          </>
        )}
        {r.giftCard && <Line label={`Gift card ${r.giftCard.code}`} value={money(r.giftCard.initialValue)} />}
        <div className="my-4 border-t border-dashed border-border" />
        <div className="flex justify-between text-lg font-bold text-ink"><span>Total</span><span>{money(r.amount)}</span></div>
        <div className="mt-1 flex justify-between text-xs"><span className="text-muted">Payment</span><span className="font-semibold text-ink">{r.method === "WHISH" ? "Whish" : "Cash"} · {r.status.toLowerCase()}</span></div>
        <div className="mt-5 flex flex-col items-center gap-1">
          <QRCode value={url} size={110} />
          <p className="text-[10px] text-muted">Scan to view online</p>
        </div>
        <p className="mt-4 text-center text-[11px] text-muted">Thank you for visiting {r.salon.name} 💗</p>
      </div>
      <div className="no-print mt-4 grid grid-cols-3 gap-2">
        <button onClick={() => window.print()} className="btn btn-primary py-2.5 text-sm">Print / PDF</button>
        <a href={waShare} target="_blank" rel="noreferrer" className="btn btn-ghost py-2.5 text-sm">WhatsApp</a>
        <a href={mailShare} className="btn btn-ghost py-2.5 text-sm">Email</a>
      </div>
    </div>
  );
}
function Line({ label, value, sub }: { label: string; value: string; sub?: boolean }) {
  return <div className={`flex justify-between py-0.5 text-sm ${sub ? "text-muted" : "text-ink"}`}><span>{label}</span><span>{value}</span></div>;
}
