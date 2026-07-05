import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SITE } from "../config";
import { api, durationLabel, priceLabel } from "../lib/api";
import { useCustomer } from "../context/CustomerAuth";
import { WaitlistForm } from "../components/WaitlistForm";
import { PromoField, type Applied } from "../components/PromoField";
import type { Category, Staff } from "../types";

const ymd = (d: Date) => d.toLocaleDateString("en-CA");
const closedOn = (d: Date) => SITE.hours[d.getDay()]?.value === "Closed";
const prettyDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const nextDays = (n: number) => { const b = new Date(); b.setHours(0, 0, 0, 0); return Array.from({ length: n }, (_, i) => { const d = new Date(b); d.setDate(b.getDate() + i); return d; }); };

const STEPS = ["Category", "Service", "Specialist", "Date & time", "Your details"];

export function Book() {
  const [params] = useSearchParams();
  const { customer, authHeader } = useCustomer();
  const [favIds, setFavIds] = useState<Set<number>>(new Set());
  const [catalog, setCatalog] = useState<Category[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [step, setStep] = useState(0);
  const [catId, setCatId] = useState<number | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [addOnIds, setAddOnIds] = useState<number[]>([]);
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
    api.get<Category[]>("/api/catalog").then((c) => {
      setCatalog(c);
      const pre = Number(params.get("service"));
      const preCat = c.find((cat) => cat.services.some((s) => s.id === pre));
      if (pre && preCat) { setServiceId(pre); setCatId(preCat.id); setStep(1); }
    }).catch(() => {});
    api.get<Staff[]>("/api/staff").then(setStaff).catch(() => {});
    // eslint-disable-next-line
  }, []);

  // Prefill from the logged-in account + load favourites.
  useEffect(() => {
    if (!customer) return;
    setForm((f) => ({ ...f, customerName: f.customerName || customer.name, customerPhone: f.customerPhone || customer.phone, customerEmail: f.customerEmail || customer.email }));
    api.get<{ id: number }[]>("/api/customer/me/favorites", authHeader).then((fs) => setFavIds(new Set(fs.map((x) => x.id)))).catch(() => {});
    // eslint-disable-next-line
  }, [customer]);

  function toggleFav(id: number) {
    if (!customer) return;
    const on = favIds.has(id);
    const n = new Set(favIds); on ? n.delete(id) : n.add(id); setFavIds(n);
    (on ? api.delete(`/api/customer/me/favorites/${id}`, authHeader) : api.post(`/api/customer/me/favorites/${id}`, {}, authHeader)).catch(() => {});
  }

  const service = useMemo(() => catalog.flatMap((c) => c.services).find((s) => s.id === serviceId) ?? null, [catalog, serviceId]);
  const category = useMemo(() => catalog.find((c) => c.id === service?.categoryId) ?? null, [catalog, service]);
  const addOns = category?.addOns ?? [];
  const selectedAddOns = addOns.filter((a) => addOnIds.includes(a.id));
  const total = (service?.price ?? 0) + selectedAddOns.reduce((s, a) => s + a.price, 0);
  const totalMin = (service?.durationMin ?? 0) + selectedAddOns.reduce((s, a) => s + a.durationMin, 0);
  const eligibleStaff: { id: number; name: string; role: string }[] = service?.staff && service.staff.length ? service.staff : staff;
  const chosenCat = useMemo(() => catalog.find((c) => c.id === catId) ?? null, [catalog, catId]);

  useEffect(() => {
    if (step !== 3 || !serviceId || !date) return;
    setSlots(null); setTime("");
    const p = new URLSearchParams({ date, serviceId: String(serviceId) });
    if (staffId) p.set("staffId", String(staffId));
    if (addOnIds.length) p.set("addOns", addOnIds.join(","));
    api.get<{ slots: string[] }>(`/api/availability?${p}`).then((d) => setSlots(d.slots)).catch(() => setSlots([]));
  }, [step, serviceId, date, staffId, addOnIds]);

  function selectService(id: number) { setServiceId(id); setAddOnIds([]); }
  function toggleAddOn(id: number) { setAddOnIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id])); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !serviceId || !date || !time) return;
    if (!form.customerName.trim() || !form.customerPhone.trim()) { setErr("Please enter your name and phone."); return; }
    setBusy(true); setErr("");
    try {
      const r = await api.post<{ appointment: { staffName: string } }>("/api/appointments", { serviceId, staffId, date, time, addOnIds, promoCode: promo?.code, ...form }, authHeader);
      setDone({ date, time, staffName: r.appointment.staffName });
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Couldn't complete the booking."); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-3xl">✓</div>
        <h1 className="mt-4 font-display text-3xl font-extrabold text-ink">You're booked! 🎉</h1>
        <p className="mt-2 text-muted">See you soon at {SITE.name}.</p>
        <div className="card mt-6 p-5 text-left text-sm">
          <Row k="Service" v={`${service?.name ?? ""}${selectedAddOns.length ? ` + ${selectedAddOns.map((a) => a.name).join(", ")}` : ""}`} />
          <Row k="When" v={`${prettyDate(done.date)} at ${done.time}`} />
          <Row k="With" v={done.staffName || "Our team"} />
          <Row k="Total" v={priceLabel(total)} />
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <a href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noreferrer" className="btn btn-primary py-3">💬 Message us on WhatsApp</a>
          <Link to="/" className="btn btn-ghost py-2.5">Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-2">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
          <Link to="/" className="font-display text-lg font-extrabold text-ink">{SITE.name}</Link>
          <Link to="/" className="ml-auto text-sm font-semibold text-muted hover:text-ink">← Home</Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i <= step ? "bg-brand text-white" : "border border-border bg-surface text-muted"}`}>{i + 1}</div>
              <span className={`hidden text-sm font-semibold sm:block ${i === step ? "text-ink" : "text-muted"}`}>{s}</span>
              {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 rounded ${i < step ? "bg-brand" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        <div className="mt-6">
          {/* Step 0 — category */}
          {step === 0 && (
            <div>
              <h2 className="font-display text-xl font-bold text-ink">What are you here for?</h2>
              <p className="mt-1 text-sm text-muted">Choose a category to see our services.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {catalog.map((cat) => (
                  <button key={cat.id} onClick={() => { setCatId(cat.id); setServiceId(null); setStep(1); }} className="lift group overflow-hidden rounded-[1.5rem] border border-border bg-surface text-left">
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <img src={SITE.categoryImages[cat.name] ?? SITE.heroImage} alt={cat.name} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                      <p className="absolute bottom-3 left-4 font-display text-lg font-bold text-white">{cat.emoji} {cat.name}</p>
                    </div>
                    <p className="px-4 py-3 text-sm text-muted">{cat.services.length} service{cat.services.length === 1 ? "" : "s"} <span className="float-right font-semibold text-brand">Choose →</span></p>
                  </button>
                ))}
              </div>
              {!catalog.length && <p className="text-center text-muted">Loading…</p>}
            </div>
          )}

          {/* Step 1 — service (+ add-ons) */}
          {step === 1 && (
            <div className="space-y-6">
              {[chosenCat].filter((c): c is Category => !!c).map((cat) => (
                <div key={cat.id}>
                  <h3 className="mb-2 font-display font-bold text-brand-dark">{cat.emoji} {cat.name}</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {cat.services.map((s) => (
                      <div key={s.id} className="relative">
                        <button onClick={() => selectService(s.id)} className={`card flex w-full items-center justify-between gap-3 p-4 text-left transition hover:border-brand ${serviceId === s.id ? "border-brand ring-1 ring-brand" : ""} ${customer ? "pr-9" : ""}`}>
                          <span><span className="block font-semibold text-ink">{s.name}</span><span className="text-xs text-muted">🕐 {durationLabel(s.durationMin)}</span></span>
                          <span className="shrink-0 font-display font-bold text-brand">{priceLabel(s.price)}</span>
                        </button>
                        {customer && <button onClick={() => toggleFav(s.id)} aria-label="Favourite" className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-lg ${favIds.has(s.id) ? "text-brand" : "text-muted/50 hover:text-brand"}`}>{favIds.has(s.id) ? "♥" : "♡"}</button>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!catalog.length && <p className="text-center text-muted">Loading…</p>}

              {service && addOns.length > 0 && (
                <div className="card p-4">
                  <p className="font-semibold text-ink">Add-ons <span className="font-normal text-muted">(optional)</span></p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {addOns.map((a) => (
                      <button key={a.id} onClick={() => toggleAddOn(a.id)} className={`chip ${addOnIds.includes(a.id) ? "chip-active" : ""}`}>
                        {a.name}{a.price > 0 ? ` +${priceLabel(a.price)}` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => { setStep(0); setServiceId(null); }} className="btn btn-ghost px-5 py-2 text-sm">← Categories</button>

              {service && (
                <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-2xl bg-surface p-3 shadow-lg ring-1 ring-border">
                  <span className="text-sm"><span className="font-semibold text-ink">{service.name}</span> · {durationLabel(totalMin)} · <span className="text-brand">{priceLabel(total)}</span></span>
                  <button onClick={() => setStep(2)} className="btn btn-primary px-6 py-2.5">Continue →</button>
                </div>
              )}
            </div>
          )}

          {/* Step 2 — specialist (only those who perform this service) */}
          {step === 2 && (
            <div>
              <h2 className="font-display text-xl font-bold text-ink">Choose your specialist</h2>
              {eligibleStaff.length > 1 && <p className="mt-1 text-sm text-muted">{service?.name} is done by {eligibleStaff.length} of our specialists.</p>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button onClick={() => { setStaffId(null); setStep(3); }} className={`card p-4 text-left transition hover:border-brand ${staffId === null ? "border-brand" : ""}`}>
                  <p className="font-semibold text-ink">✨ Any available</p>
                  <p className="text-xs text-muted">First free specialist — most flexible times</p>
                </button>
                {eligibleStaff.map((m) => (
                  <button key={m.id} onClick={() => { setStaffId(m.id); setStep(3); }} className={`card flex items-center gap-3 p-4 text-left transition hover:border-brand ${staffId === m.id ? "border-brand" : ""}`}>
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft font-display font-bold text-brand">{m.name.slice(0, 1)}</span>
                    <span><span className="block font-semibold text-ink">{m.name}</span><span className="text-xs text-brand">{m.role}</span></span>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(1)} className="btn btn-ghost mt-5 px-5 py-2 text-sm">← Back</button>
            </div>
          )}

          {/* Step 3 — date & time */}
          {step === 3 && (
            <div>
              <h2 className="font-display text-xl font-bold text-ink">Pick a date & time</h2>
              <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
                {nextDays(21).map((d) => {
                  const val = ymd(d); const closed = closedOn(d);
                  return (
                    <button key={val} disabled={closed} onClick={() => setDate(val)} className={`flex shrink-0 flex-col items-center rounded-2xl border px-3.5 py-2 text-center transition ${date === val ? "border-brand bg-brand text-white" : closed ? "border-border bg-surface text-muted/40" : "border-border bg-surface text-ink hover:border-brand"}`}>
                      <span className="text-[10px] font-semibold uppercase">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                      <span className="font-display text-lg font-bold">{d.getDate()}</span>
                      <span className="text-[10px]">{d.toLocaleDateString(undefined, { month: "short" })}</span>
                    </button>
                  );
                })}
              </div>
              {date && (
                <div className="mt-5">
                  {slots === null ? <p className="text-sm text-muted">Loading times…</p>
                    : slots.length === 0 ? <div className="rounded-xl bg-surface p-4 text-center text-sm text-muted">No open times on {prettyDate(date)}.<br />Try another day, or <button onClick={() => setWaitOpen(true)} className="font-semibold text-brand hover:underline">join the waiting list →</button></div>
                    : <div className="flex flex-wrap gap-2">{slots.map((t) => <button key={t} onClick={() => { setTime(t); setStep(4); }} className={`chip ${time === t ? "chip-active" : ""}`}>{t}</button>)}</div>}
                </div>
              )}
              <button onClick={() => setStep(2)} className="btn btn-ghost mt-6 px-5 py-2 text-sm">← Back</button>
            </div>
          )}

          {/* Step 4 — details */}
          {step === 4 && service && (
            <form onSubmit={submit} className="space-y-4">
              <div className="card p-4 text-sm">
                <p className="font-display text-lg font-bold text-ink">{service.name}{selectedAddOns.length ? ` + ${selectedAddOns.map((a) => a.name).join(", ")}` : ""}</p>
                <p className="mt-1 text-muted">{prettyDate(date)} at {time} · {durationLabel(totalMin)} · {priceLabel(total)}{staffId ? ` · with ${staff.find((s) => s.id === staffId)?.name}` : ""}</p>
              </div>
              <PromoField amount={total} authHeader={authHeader} applied={promo} onApply={setPromo} onClear={() => setPromo(null)} />
              {promo && <p className="text-right text-sm font-semibold text-ink">Total after discount: <span className="text-brand">{priceLabel(Math.max(0, total - promo.discount))}</span></p>}
              <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} required placeholder="Your name *" className="input" />
              <input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} required placeholder="Phone number *" className="input" />
              <input value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} placeholder="Email (optional)" className="input" />
              <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} placeholder="Anything we should know? (optional)" className="input" />
              {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600">{err}</p>}
              <button type="submit" disabled={busy} className="btn btn-primary w-full py-3.5 text-lg disabled:opacity-60">{busy ? "Booking…" : "Confirm booking"}</button>
              <button type="button" onClick={() => setStep(3)} className="btn btn-ghost w-full py-2.5 text-sm">← Back</button>
            </form>
          )}
        </div>
      </div>
      {waitOpen && <WaitlistForm context={{ serviceId: service?.id, serviceName: service?.name, staffId, staffName: staff.find((s) => s.id === staffId)?.name, date }} onClose={() => setWaitOpen(false)} />}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3 border-b border-border py-2 last:border-0"><span className="text-muted">{k}</span><span className="font-semibold text-ink">{v}</span></div>;
}
