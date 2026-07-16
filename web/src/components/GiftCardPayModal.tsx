import { useState } from "react";
import { api, money } from "../lib/api";

type Appt = { id: number; price: number; serviceName: string; customerName: string };
type Done = { giftApplied: number; cashRemainder: number; cardBalance: number };

// Pay a booking with a gift card: look up the card, show what it covers, then apply.
export function GiftCardPayModal({ adminKey, appointment, onClose, onPaid }: { adminKey: string; appointment: Appt; onClose: () => void; onPaid: () => void }) {
  const [code, setCode] = useState("");
  const [card, setCard] = useState<{ balance: number; status: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  async function check() {
    const c = code.trim().toUpperCase();
    setErr("");
    setCard(null);
    if (!c) return;
    setChecking(true);
    try {
      const g = await api.get<{ balance: number; status: string }>(`/api/gift-cards/${encodeURIComponent(c)}`);
      if (g.status === "EXPIRED" || g.status === "VOID" || g.status === "PENDING") setErr(`This card is ${g.status.toLowerCase()}.`);
      else if (g.balance <= 0) setErr("This card has no balance left.");
      else setCard(g);
    } catch {
      setErr("No gift card with that code.");
    } finally {
      setChecking(false);
    }
  }
  async function pay() {
    setBusy(true);
    setErr("");
    try {
      const r = await api.post<Done>(
        `/api/admin/appointments/${appointment.id}/pay-giftcard`,
        { code: code.trim().toUpperCase() },
        { "x-admin-key": adminKey },
      );
      setDone(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't apply the gift card.");
    } finally {
      setBusy(false);
    }
  }

  const covers = card ? Math.min(card.balance, appointment.price) : 0;
  const remainder = card ? Math.max(0, appointment.price - card.balance) : 0;

  return (
    <div className="bg-ink/40 fixed inset-0 z-[60] flex items-end justify-center p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full max-w-sm rounded-t-3xl p-6 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <p className="text-center text-3xl">🎀</p>
            <p className="font-display text-ink mt-2 text-center text-lg font-bold">Gift card applied</p>
            <div className="bg-surface-2 mt-4 space-y-1.5 rounded-2xl p-4 text-sm">
              <p className="flex justify-between">
                <span className="text-muted">Paid by gift card</span>
                <span className="font-bold text-emerald-600">{money(done.giftApplied)}</span>
              </p>
              {done.cashRemainder > 0 && (
                <p className="flex justify-between">
                  <span className="text-muted">Collect in cash</span>
                  <span className="font-bold text-amber-600">{money(done.cashRemainder)}</span>
                </p>
              )}
              <p className="border-border flex justify-between border-t pt-1.5">
                <span className="text-muted">Card balance left</span>
                <span className="text-ink font-bold">{money(done.cardBalance)}</span>
              </p>
            </div>
            {done.cashRemainder > 0 && (
              <p className="mt-3 rounded-xl bg-amber-400/15 p-2.5 text-center text-xs font-semibold text-amber-700">
                💵 Remember to collect {money(done.cashRemainder)} in cash.
              </p>
            )}
            <button onClick={onPaid} className="btn btn-primary mt-4 w-full py-2.5">
              Done
            </button>
          </>
        ) : (
          <>
            <p className="font-display text-ink text-lg font-bold">Pay with gift card</p>
            <p className="text-muted mt-0.5 text-sm">
              {appointment.serviceName} · <b className="text-ink">{money(appointment.price)}</b> · {appointment.customerName}
            </p>
            <div className="mt-4 flex gap-2">
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCard(null);
                  setErr("");
                }}
                onBlur={check}
                placeholder="Gift card code"
                className="input flex-1 uppercase"
                autoFocus
              />
              <button onClick={check} disabled={checking} className="btn btn-ghost px-4">
                {checking ? "…" : "Check"}
              </button>
            </div>
            {card && (
              <div className="bg-surface-2 mt-3 space-y-1.5 rounded-2xl p-4 text-sm">
                <p className="flex justify-between">
                  <span className="text-muted">Card balance</span>
                  <span className="text-ink font-bold">{money(card.balance)}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-muted">Covers this booking</span>
                  <span className="font-bold text-emerald-600">{money(covers)}</span>
                </p>
                {remainder > 0 && (
                  <p className="border-border flex justify-between border-t pt-1.5">
                    <span className="text-muted">Remaining (cash)</span>
                    <span className="font-bold text-amber-600">{money(remainder)}</span>
                  </p>
                )}
              </div>
            )}
            {err && <p className="mt-3 text-sm font-medium text-red-600">{err}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={pay} disabled={busy || !card} className="btn btn-primary flex-1 py-2.5 disabled:opacity-60">
                {busy ? "Applying…" : "Apply gift card"}
              </button>
              <button onClick={onClose} className="btn btn-ghost px-5 py-2.5">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
