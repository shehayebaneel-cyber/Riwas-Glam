import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Settings = { events: Record<string, boolean>; channels: { email: boolean; whatsapp: boolean }; emailFrom: string };
type Log = { id: number; channel: string; to: string; event: string; status: string; error: string; createdAt: string };
const EVENTS: [string, string][] = [
  ["confirmation", "Booking confirmation"],
  ["reminder", "Appointment reminder (24h before)"],
  ["cancelled", "Booking cancelled"],
  ["review", "Review request (after visit)"],
  ["giftcard", "Gift card purchased"],
  ["waitlist", "Added to waiting list"],
  ["lowstock", "Low stock alert (to you)"],
];
const BADGE: Record<string, string> = {
  SENT: "bg-emerald-500/15 text-emerald-600",
  SKIPPED: "bg-surface-2 text-muted",
  FAILED: "bg-red-500/15 text-red-500",
  PENDING: "bg-amber-400/15 text-amber-600",
};

export function NotificationsAdmin({ adminKey }: { adminKey: string }) {
  const hdr = { "x-admin-key": adminKey };
  const [s, setS] = useState<Settings | null>(null);
  const [providers, setProviders] = useState({ email: false, whatsapp: false });
  const [log, setLog] = useState<Log[]>([]);
  const [test, setTest] = useState({ email: "", phone: "", lang: "en" });
  const [msg, setMsg] = useState("");
  const loadLog = () =>
    api
      .get<Log[]>("/api/admin/notifications/log", hdr)
      .then(setLog)
      .catch(() => {});
  useEffect(() => {
    api
      .get<{ settings: Settings; providers: { email: boolean; whatsapp: boolean } }>("/api/admin/notifications", hdr)
      .then((d) => {
        setS(d.settings);
        setProviders(d.providers);
      })
      .catch(() => {});
    loadLog(); /* eslint-disable-next-line */
  }, []);
  if (!s) return <p className="card text-muted p-8 text-center">Loading…</p>;

  const save = (next: Settings) => {
    setS(next);
    api.patch("/api/admin/settings/notifications", next, hdr).catch(() => {});
  };
  const toggleEvent = (k: string) => save({ ...s, events: { ...s.events, [k]: !s.events[k] } });
  const toggleChannel = (k: "email" | "whatsapp") => save({ ...s, channels: { ...s.channels, [k]: !s.channels[k] } });
  async function sendTest() {
    setMsg("");
    await api.post("/api/admin/notifications/test", test, hdr);
    setMsg("Test queued — check the log below.");
    loadLog();
  }
  async function runReminders() {
    const r = await api.post<{ sent: number }>("/api/admin/notifications/run-reminders", {}, hdr);
    setMsg(`Reminders run: ${r.sent} appointment(s) tomorrow.`);
    loadLog();
  }

  return (
    <div className="space-y-4">
      {/* Provider status */}
      <div className="card p-5">
        <p className="font-display text-brand-dark font-bold">Delivery providers</p>
        <div className="mt-2 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${providers.email ? "bg-emerald-500" : "bg-amber-400"}`} />
            <b className="text-ink">Email</b>
            <span className="text-muted">{providers.email ? "connected (Resend)" : "not connected — set RESEND_API_KEY in Render to start sending"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${providers.whatsapp ? "bg-emerald-500" : "bg-amber-400"}`} />
            <b className="text-ink">WhatsApp / SMS</b>
            <span className="text-muted">{providers.whatsapp ? "connected (Twilio)" : "not connected — set Twilio keys in Render to start sending"}</span>
          </div>
        </div>
        <p className="bg-surface-2 text-muted mt-3 rounded-xl p-3 text-xs">
          Everything below works now — messages are logged. Until a provider is connected they're marked “skipped” instead of actually sent. Add the provider
          keys when you're ready and they'll go out automatically.
        </p>
      </div>

      {/* Channels */}
      <div className="card p-5">
        <p className="font-display text-brand-dark font-bold">Channels</p>
        <div className="mt-2 space-y-2">
          <label className="flex items-center justify-between">
            <span className="text-ink">Send by email</span>
            <input type="checkbox" checked={s.channels.email} onChange={() => toggleChannel("email")} className="accent-brand h-5 w-5" />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-ink">Send by WhatsApp</span>
            <input type="checkbox" checked={s.channels.whatsapp} onChange={() => toggleChannel("whatsapp")} className="accent-brand h-5 w-5" />
          </label>
          <label className="block">
            <span className="text-muted mb-1 block text-xs font-semibold">Email “from” address</span>
            <input value={s.emailFrom} onChange={(e) => setS({ ...s, emailFrom: e.target.value })} onBlur={() => save(s)} className="input text-sm" />
          </label>
        </div>
      </div>

      {/* Events */}
      <div className="card p-5">
        <p className="font-display text-brand-dark font-bold">Which notifications to send</p>
        <div className="mt-2 space-y-2">
          {EVENTS.map(([k, label]) => (
            <label key={k} className="flex items-center justify-between">
              <span className="text-ink">{label}</span>
              <input type="checkbox" checked={!!s.events[k]} onChange={() => toggleEvent(k)} className="accent-brand h-5 w-5" />
            </label>
          ))}
        </div>
      </div>

      {/* Test + reminders */}
      <div className="card p-5">
        <p className="font-display text-brand-dark font-bold">Test & tools</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <input value={test.email} onChange={(e) => setTest({ ...test, email: e.target.value })} placeholder="Test email" className="input text-sm" />
          <input
            value={test.phone}
            onChange={(e) => setTest({ ...test, phone: e.target.value })}
            placeholder="Test WhatsApp (+961…)"
            className="input text-sm"
          />
          <select value={test.lang} onChange={(e) => setTest({ ...test, lang: e.target.value })} className="input text-sm">
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={sendTest} className="btn btn-primary px-4 py-2 text-sm">
            Send test
          </button>
          <button onClick={runReminders} className="btn btn-ghost px-4 py-2 text-sm">
            Run tomorrow's reminders
          </button>
        </div>
        {msg && <p className="mt-2 text-sm font-semibold text-emerald-600">{msg}</p>}
        <p className="text-muted mt-2 text-xs">
          Reminders should run daily — connect an external scheduler (e.g. a free cron service) to POST to the reminders endpoint each morning.
        </p>
      </div>

      {/* Log */}
      <div className="card p-5">
        <p className="font-display text-brand-dark font-bold">Recent notifications</p>
        <div className="mt-2 space-y-1.5">
          {log.length === 0 ? (
            <p className="text-muted py-4 text-center">Nothing yet.</p>
          ) : (
            log.map((l) => (
              <div key={l.id} className="border-border flex flex-wrap items-center gap-2 border-b pb-1.5 text-sm last:border-0">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE[l.status] ?? "bg-surface-2 text-muted"}`}>{l.status}</span>
                <span className="text-muted text-xs">{l.channel}</span>
                <span className="text-ink">{l.event}</span>
                <span className="text-muted truncate text-xs">{l.to}</span>
                <span className="text-muted ml-auto text-xs">{new Date(l.createdAt).toLocaleString()}</span>
                {l.error && <span className="w-full text-xs text-red-500">{l.error}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
