import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { SignaturePad } from "./SignaturePad";

type Consent = { id: string; formType: string; customerName: string; signatureUrl: string; body: string; signedAt: string };
const FORM_TYPES = ["Tattoo", "Botox", "Filler", "Facial", "Skin treatment"];
const template = (t: string, name: string) => `I, ${name || "the client"}, confirm I have been informed about the ${t.toLowerCase()} procedure, its risks, benefits and aftercare, that I have disclosed any relevant medical conditions or allergies, and I give my informed consent to proceed at Riwa's Glam.`;

/** Consent-forms section for a customer: list signed forms + capture a new one. */
export function ConsentForms({ id, customerName, hdr }: { id: number; customerName: string; hdr: Record<string, string> }) {
  const [list, setList] = useState<Consent[]>([]);
  const [open, setOpen] = useState(false);
  const load = () => api.get<Consent[]>(`/api/admin/customers/${id}/consents`, hdr).then(setList).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  async function del(cid: string) { if (confirm("Delete this consent form?")) { await api.delete(`/api/admin/customers/${id}/consents/${cid}`, hdr); load(); } }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Consent forms</p>
        <button onClick={() => setOpen(true)} className="btn btn-ghost px-3 py-1.5 text-xs text-brand">+ New consent</button>
      </div>
      {list.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {list.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-xl bg-surface-2 p-2 text-sm">
              <img src={c.signatureUrl} alt="signature" className="h-8 w-16 shrink-0 rounded bg-white object-contain" />
              <span className="min-w-0 flex-1"><span className="font-semibold text-ink">{c.formType || "Consent"}</span> <span className="text-xs text-muted">· {new Date(c.signedAt).toLocaleDateString()}</span></span>
              <button onClick={() => del(c.id)} className="text-xs text-red-400">Delete</button>
            </div>
          ))}
        </div>
      )}
      {open && <ConsentModal id={id} customerName={customerName} hdr={hdr} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </div>
  );
}

function ConsentModal({ id, customerName, hdr, onClose, onSaved }: { id: number; customerName: string; hdr: Record<string, string>; onClose: () => void; onSaved: () => void }) {
  const [formType, setFormType] = useState(FORM_TYPES[0]);
  const [body, setBody] = useState(template(FORM_TYPES[0], customerName));
  const [sig, setSig] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    if (!sig) { setErr("Please sign in the box."); return; }
    setBusy(true); setErr("");
    try { await api.post(`/api/admin/customers/${id}/consents`, { formType, customerName, body, signatureUrl: sig }, hdr); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save."); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl sm:my-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><p className="font-display text-lg font-bold text-ink">New consent form</p><button onClick={onClose} className="text-xl text-muted">✕</button></div>
        <select value={formType} onChange={(e) => { setFormType(e.target.value); setBody(template(e.target.value, customerName)); }} className="input mt-3 !py-2 text-sm">
          {FORM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} className="input mt-2 text-sm" />
        <p className="mt-3 mb-1 text-xs font-semibold text-ink">Signature</p>
        <SignaturePad onChange={setSig} />
        {err && <p className="mt-2 text-sm font-medium text-red-600">{err}</p>}
        <button onClick={save} disabled={busy} className="btn btn-primary mt-3 w-full py-2.5 disabled:opacity-60">{busy ? "Saving…" : "Save signed consent"}</button>
      </div>
    </div>
  );
}
