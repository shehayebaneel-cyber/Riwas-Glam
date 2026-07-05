import { useState } from "react";
import { api } from "../lib/api";
import { useCustomer } from "../context/CustomerAuth";

export type WaitContext = { serviceId?: number | null; serviceName?: string; staffId?: number | null; staffName?: string; date?: string };

export function WaitlistForm({ context, onClose }: { context: WaitContext; onClose: () => void }) {
  const { customer, authHeader } = useCustomer();
  const [f, setF] = useState({ name: customer?.name ?? "", phone: customer?.phone ?? "", preferredTime: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    if (!f.name.trim() || !f.phone.trim()) { setErr("Please enter your name and phone."); return; }
    setBusy(true); setErr("");
    try {
      await api.post("/api/waitlist", { ...context, preferredDate: context.date, name: f.name, phone: f.phone, preferredTime: f.preferredTime, note: f.note }, authHeader);
      setDone(true);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't join the list."); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-[1.5rem] bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-2xl">✓</div>
            <h3 className="mt-3 font-display text-xl font-bold text-ink">You're on the list!</h3>
            <p className="mt-1 text-sm text-muted">We'll reach out if a spot opens up.</p>
            <button onClick={onClose} className="btn btn-primary mt-4 w-full py-2.5">Done</button>
          </div>
        ) : (
          <>
            <h3 className="font-display text-xl font-bold text-ink">Join the waiting list</h3>
            <p className="mt-1 text-sm text-muted">Fully booked? We'll contact you if an earlier spot frees up.</p>
            <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-muted">
              {context.serviceName && <p><b className="text-ink">{context.serviceName}</b></p>}
              <p>{context.date ? new Date(context.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Any day"}{context.staffName ? ` · with ${context.staffName}` : ""}</p>
            </div>
            <div className="mt-3 space-y-2">
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Your name *" className="input" />
              <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone number *" className="input" />
              <input value={f.preferredTime} onChange={(e) => setF({ ...f, preferredTime: e.target.value })} placeholder="Preferred time (e.g. morning, after 5pm)" className="input" />
              <textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} placeholder="Anything else? (optional)" className="input" />
            </div>
            {err && <p className="mt-2 text-sm font-medium text-red-600">{err}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={submit} disabled={busy} className="btn btn-primary flex-1 py-2.5 disabled:opacity-60">{busy ? "Joining…" : "Join the list"}</button>
              <button onClick={onClose} className="btn btn-ghost px-5 py-2.5">Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
