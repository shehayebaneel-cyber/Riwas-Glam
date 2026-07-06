import { useState } from "react";
import { api, priceLabel } from "../lib/api";
import { useI18n } from "../context/I18n";

export type Applied = { code: string; discount: number; label: string };

export function PromoField({ amount, authHeader, applied, onApply, onClear }: {
  amount: number; authHeader: Record<string, string>;
  applied: Applied | null; onApply: (a: Applied) => void; onClear: () => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function apply() {
    if (!code.trim()) return;
    setBusy(true); setErr("");
    try { const r = await api.post<Applied>("/api/promo/validate", { code, amount }, authHeader); onApply(r); setCode(""); }
    catch (e) { setErr(e instanceof Error ? e.message : "Invalid code."); } finally { setBusy(false); }
  }
  if (applied) return (
    <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 px-3 py-2 text-sm">
      <span className="font-semibold text-emerald-700">✓ {applied.code} — {applied.label} (−{priceLabel(applied.discount)})</span>
      <button type="button" onClick={onClear} className="text-xs font-semibold text-red-500">Remove</button>
    </div>
  );
  return (
    <div>
      <div className="flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t("Promo code")} className="input flex-1" />
        <button type="button" onClick={apply} disabled={busy} className="btn btn-ghost px-4 disabled:opacity-50">{t("Apply")}</button>
      </div>
      {err && <p className="mt-1 text-xs font-medium text-red-600">{err}</p>}
    </div>
  );
}
