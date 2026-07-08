import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { waLink, defaultOffer } from "../lib/whatsapp";

type Cust = { id: number; name: string; phone: string; birthday: string | null; visits: number; lastVisit: string };
type Audience = "all" | "visited" | "birthday" | "recent";

const AUDIENCES: { key: Audience; label: string }[] = [
  { key: "all", label: "All customers" },
  { key: "visited", label: "Visited before" },
  { key: "recent", label: "Recent (60 days)" },
  { key: "birthday", label: "Birthday this month" },
];

// Tap-to-send WhatsApp offers. No API/fees: each customer gets a pre-filled WhatsApp
// message the owner sends with one tap. Personalises {name} per recipient.
export function WhatsAppBroadcast({ adminKey }: { adminKey: string }) {
  const [customers, setCustomers] = useState<Cust[]>([]);
  const [msg, setMsg] = useState(defaultOffer());
  const [audience, setAudience] = useState<Audience>("all");
  const [sent, setSent] = useState<Record<number, boolean>>({});

  useEffect(() => { api.get<Cust[]>("/api/admin/customers", { "x-admin-key": adminKey }).then(setCustomers).catch(() => {}); }, [adminKey]);

  const list = useMemo(() => {
    const month = new Date().getMonth() + 1;
    const cut = new Date(); cut.setDate(cut.getDate() - 60);
    const cutStr = cut.toISOString().slice(0, 10);
    return customers.filter((c) => {
      if (!c.phone) return false;
      if (audience === "visited") return c.visits > 0;
      if (audience === "recent") return !!c.lastVisit && c.lastVisit >= cutStr;
      if (audience === "birthday") return !!c.birthday && Number(c.birthday.slice(5, 7)) === month;
      return true;
    });
  }, [customers, audience]);

  const preview = msg.replace(/\{name\}/g, list[0]?.name || "there");
  const sentCount = list.filter((c) => sent[c.id]).length;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <span className="text-xl">📣</span>
        <div>
          <p className="font-display font-bold text-brand-dark">Send an offer on WhatsApp</p>
          <p className="text-xs text-muted">Free — pick who gets it, then tap each “Send”. WhatsApp opens with the message ready.</p>
        </div>
      </div>

      {/* Audience */}
      <div className="mt-4 flex flex-wrap gap-2">
        {AUDIENCES.map((a) => (
          <button key={a.key} onClick={() => setAudience(a.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${audience === a.key ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-brand"}`}>
            {a.label}
          </button>
        ))}
      </div>

      {/* Message */}
      <label className="mt-4 block text-xs font-semibold text-muted">Your message <span className="font-normal">(use <code className="rounded bg-surface-2 px-1">{"{name}"}</code> to greet each customer)</span></label>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} className="input mt-1 w-full text-sm" />
      <div className="mt-2 rounded-xl bg-surface-2 p-3 text-sm text-ink">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted/70">Preview</p>
        {preview}
      </div>

      {/* Recipients */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{list.length} recipient{list.length === 1 ? "" : "s"}</p>
        {sentCount > 0 && <p className="text-xs text-emerald-600">{sentCount} sent</p>}
      </div>
      <div className="no-scrollbar mt-2 max-h-80 space-y-1.5 overflow-y-auto">
        {list.length === 0 ? <p className="py-6 text-center text-sm text-muted">No customers match this filter yet.</p> : list.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{c.name || "Customer"}</p>
              <p className="truncate text-xs text-muted">{c.phone}</p>
            </div>
            <a href={waLink(c.phone, msg.replace(/\{name\}/g, c.name || "there"))} target="_blank" rel="noreferrer"
              onClick={() => setSent((s) => ({ ...s, [c.id]: true }))}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${sent[c.id] ? "bg-emerald-500/15 text-emerald-600" : "bg-[#25D366] text-white hover:brightness-95"}`}>
              {sent[c.id] ? "✓ Sent" : "Send"}
            </a>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted">Tip: WhatsApp opens one chat at a time — tap “Send” down the list. Only message customers who expect to hear from you.</p>
    </div>
  );
}
