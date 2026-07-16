import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SITE } from "../config";
import { api, durationLabel, priceLabel } from "../lib/api";
import { useCustomer } from "../context/CustomerAuth";
import { useI18n } from "../context/I18n";
import { WaitlistForm } from "../components/WaitlistForm";
import { PromoField, type Applied } from "../components/PromoField";
import type { Staff } from "../types";

type Pkg = { id: number; title: string; image: string; description: string; price: number; durationMin: number; services: string[] };

import { ymd, nextDays } from "../lib/time";

const closedOn = (d: Date) => SITE.hours[d.getDay()]?.value === "Closed";
const prettyDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const STEPS = ["Specialist", "Date & time", "Your details"];

export function BookPackage({ packageId }: { packageId: number }) {
  const { customer, authHeader } = useCustomer();
  const { t } = useI18n();
  const [pkg, setPkg] = useState<Pkg | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [step, setStep] = useState(0);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [form, setForm] = useState({ customerName: "", customerPhone: "", customerEmail: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ date: string; time: string; staffName: string } | null>(null);
  const [waitOpen, setWaitOpen] = useState(false);
  const [promo, setPromo] = useState<Applied | null>(null);

  useEffect(() => {
    api
      .get<Pkg[]>("/api/packages")
      .then((ps) => setPkg(ps.find((p) => p.id === packageId) ?? null))
      .catch(() => {});
    api
      .get<Staff[]>("/api/staff")
      .then(setStaff)
      .catch(() => {});
  }, [packageId]);
  useEffect(() => {
    if (!customer) return;
    setForm((f) => ({
      ...f,
      customerName: f.customerName || customer.name,
      customerPhone: f.customerPhone || customer.phone,
      customerEmail: f.customerEmail || customer.email,
    }));
  }, [customer]);
  useEffect(() => {
    if (step !== 1 || !date) return;
    setSlots(null);
    setTime("");
    const p = new URLSearchParams({ date, packageId: String(packageId) });
    if (staffId) p.set("staffId", String(staffId));
    api
      .get<{ slots: string[] }>(`/api/availability?${p}`)
      .then((d) => setSlots(d.slots))
      .catch(() => setSlots([]));
  }, [step, date, staffId, packageId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !date || !time) return;
    if (!form.customerName.trim() || !form.customerPhone.trim()) {
      setErr("Please enter your name and phone.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await api.post<{ appointment: { staffName: string } }>(
        "/api/appointments",
        { packageId, staffId, date, time, promoCode: promo?.code, ...form },
        authHeader,
      );
      setDone({ date, time, staffName: r.appointment.staffName });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn't complete the booking.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="bg-brand-soft mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl">✓</div>
        <h1 className="font-display text-ink mt-4 text-3xl font-extrabold">You're booked! 🎉</h1>
        <p className="text-muted mt-2">See you soon at {SITE.name}.</p>
        <div className="card mt-6 p-5 text-left text-sm">
          <Row k="Package" v={pkg?.title ?? ""} />
          <Row k="When" v={`${prettyDate(done.date)} at ${done.time}`} />
          <Row k="With" v={done.staffName || "Our team"} />
          <Row k="Total" v={priceLabel(pkg?.price ?? 0)} />
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <a href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noreferrer" className="btn btn-primary py-3">
            💬 Message us on WhatsApp
          </a>
          <Link to="/" className="btn btn-ghost py-2.5">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (!pkg) return <div className="text-muted p-16 text-center">Loading package…</div>;

  return (
    <div className="bg-surface-2 min-h-screen">
      <header className="border-border bg-surface border-b">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
          <Link to="/" className="font-display text-ink text-lg font-extrabold">
            {SITE.name}
          </Link>
          <Link to="/packages" className="text-muted hover:text-ink ml-auto text-sm font-semibold">
            ← Packages
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Package summary */}
        <div className="card mb-5 flex items-center gap-4 p-4">
          <div className="bg-brand-soft h-16 w-16 shrink-0 overflow-hidden rounded-xl">
            {pkg.image ? (
              <img src={pkg.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl">🎀</div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-display text-ink font-bold">{pkg.title}</p>
            <p className="text-muted text-sm">
              {durationLabel(pkg.durationMin)} · <span className="text-brand font-semibold">{priceLabel(pkg.price)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i <= step ? "bg-brand text-white" : "border-border bg-surface text-muted border"}`}
              >
                {i + 1}
              </div>
              <span className={`hidden text-sm font-semibold sm:block ${i === step ? "text-ink" : "text-muted"}`}>{t(s)}</span>
              {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 rounded ${i < step ? "bg-brand" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        <div className="mt-6">
          {step === 0 && (
            <div>
              <h2 className="font-display text-ink text-xl font-bold">{t("Choose your specialist")}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => {
                    setStaffId(null);
                    setStep(1);
                  }}
                  className={`card hover:border-brand p-4 text-left transition ${staffId === null ? "border-brand" : ""}`}
                >
                  <p className="text-ink font-semibold">✨ Any available</p>
                  <p className="text-muted text-xs">First free specialist — most flexible times</p>
                </button>
                {staff.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setStaffId(m.id);
                      setStep(1);
                    }}
                    className={`card hover:border-brand flex items-center gap-3 p-4 text-left transition ${staffId === m.id ? "border-brand" : ""}`}
                  >
                    <span className="bg-brand-soft font-display text-brand flex h-11 w-11 items-center justify-center rounded-full font-bold">
                      {m.name.slice(0, 1)}
                    </span>
                    <span>
                      <span className="text-ink block font-semibold">{m.name}</span>
                      <span className="text-brand text-xs">{m.role}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="font-display text-ink text-xl font-bold">{t("Pick a date & time")}</h2>
              <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
                {nextDays(21).map((d) => {
                  const val = ymd(d);
                  const closed = closedOn(d);
                  return (
                    <button
                      key={val}
                      disabled={closed}
                      onClick={() => setDate(val)}
                      className={`flex shrink-0 flex-col items-center rounded-2xl border px-3.5 py-2 text-center transition ${date === val ? "border-brand bg-brand text-white" : closed ? "border-border bg-surface text-muted/40" : "border-border bg-surface text-ink hover:border-brand"}`}
                    >
                      <span className="text-[10px] font-semibold uppercase">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                      <span className="font-display text-lg font-bold">{d.getDate()}</span>
                      <span className="text-[10px]">{d.toLocaleDateString(undefined, { month: "short" })}</span>
                    </button>
                  );
                })}
              </div>
              {date && (
                <div className="mt-5">
                  {slots === null ? (
                    <p className="text-muted text-sm">Loading times…</p>
                  ) : slots.length === 0 ? (
                    <div className="bg-surface text-muted rounded-xl p-4 text-center text-sm">
                      No open times on {prettyDate(date)}.<br />
                      Try another day, or{" "}
                      <button onClick={() => setWaitOpen(true)} className="text-brand font-semibold hover:underline">
                        join the waiting list →
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {slots.map((t) => (
                        <button
                          key={t}
                          onClick={() => {
                            setTime(t);
                            setStep(2);
                          }}
                          className={`chip ${time === t ? "chip-active" : ""}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button onClick={() => setStep(0)} className="btn btn-ghost mt-6 px-5 py-2 text-sm">
                {t("← Back")}
              </button>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={submit} className="space-y-4">
              <div className="card p-4 text-sm">
                <p className="font-display text-ink text-lg font-bold">{pkg.title}</p>
                <p className="text-muted mt-1">
                  {prettyDate(date)} at {time} · {durationLabel(pkg.durationMin)} · {priceLabel(pkg.price)}
                  {staffId ? ` · with ${staff.find((s) => s.id === staffId)?.name}` : ""}
                </p>
              </div>
              <PromoField amount={pkg.price} authHeader={authHeader} applied={promo} onApply={setPromo} onClear={() => setPromo(null)} />
              {promo && (
                <p className="text-ink text-right text-sm font-semibold">
                  Total after discount: <span className="text-brand">{priceLabel(Math.max(0, pkg.price - promo.discount))}</span>
                </p>
              )}
              <input
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                required
                placeholder="Your name *"
                className="input"
              />
              <input
                value={form.customerPhone}
                onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                required
                placeholder="Phone number *"
                className="input"
              />
              <input
                value={form.customerEmail}
                onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                placeholder="Email (optional)"
                className="input"
              />
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                placeholder="Anything we should know? (optional)"
                className="input"
              />
              {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600">{err}</p>}
              <button type="submit" disabled={busy} className="btn btn-primary w-full py-3.5 text-lg disabled:opacity-60">
                {busy ? t("Booking…") : t("Confirm booking")}
              </button>
              <button type="button" onClick={() => setStep(1)} className="btn btn-ghost w-full py-2.5 text-sm">
                ← Back
              </button>
            </form>
          )}
        </div>
      </div>
      {waitOpen && (
        <WaitlistForm
          context={{ serviceName: pkg.title, staffId, staffName: staff.find((s) => s.id === staffId)?.name, date }}
          onClose={() => setWaitOpen(false)}
        />
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="border-border flex justify-between gap-3 border-b py-2 last:border-0">
      <span className="text-muted">{k}</span>
      <span className="text-ink font-semibold">{v}</span>
    </div>
  );
}
