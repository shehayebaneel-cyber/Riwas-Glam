import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { SITE } from "../config";
import { api, durationLabel, priceLabel } from "../lib/api";
import { track } from "../lib/track";
import { useCustomer } from "../context/CustomerAuth";
import { useI18n } from "../context/I18n";
import { WaitlistForm } from "../components/WaitlistForm";
import { PromoField, type Applied } from "../components/PromoField";
import { PaymentMethodPicker, type PayMethod } from "../components/PaymentMethodPicker";
import type { Category, Staff } from "../types";

import { ymd, nextDays } from "../lib/time";

const closedOn = (d: Date) => SITE.hours[d.getDay()]?.value === "Closed";
const prettyDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

const STEPS = ["Category", "Service", "Specialist", "Date & time", "Your details"];

export function Book() {
  const [params] = useSearchParams();
  const { customer, authHeader } = useCustomer();
  const { t } = useI18n();
  const [favIds, setFavIds] = useState<Set<number>>(new Set());
  const [catalog, setCatalog] = useState<Category[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [step, setStep] = useState(0);
  const [catId, setCatId] = useState<number | null>(null);
  const [serviceIds, setServiceIds] = useState<number[]>([]); // pick as many as you like — booked back-to-back
  const [addOnIds, setAddOnIds] = useState<number[]>([]);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [form, setForm] = useState({ customerName: "", customerPhone: "", customerEmail: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ date: string; time: string; staffName: string; method: PayMethod } | null>(null);
  const [waitOpen, setWaitOpen] = useState(false);
  const [promo, setPromo] = useState<Applied | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>("CASH");
  const navigate = useNavigate();

  useEffect(() => {
    track("BOOKING_STARTED");
    api
      .get<Category[]>("/api/catalog")
      .then((c) => {
        setCatalog(c);
        const pre = Number(params.get("service"));
        const preCat = c.find((cat) => cat.services.some((s) => s.id === pre));
        if (pre && preCat) {
          setServiceIds([pre]);
          setCatId(preCat.id);
          setStep(1);
        }
      })
      .catch(() => {});
    api
      .get<Staff[]>("/api/staff")
      .then(setStaff)
      .catch(() => {});
    // eslint-disable-next-line
  }, []);

  // Prefill from the logged-in account + load favourites.
  useEffect(() => {
    if (!customer) return;
    setForm((f) => ({
      ...f,
      customerName: f.customerName || customer.name,
      customerPhone: f.customerPhone || customer.phone,
      customerEmail: f.customerEmail || customer.email,
    }));
    api
      .get<{ id: number }[]>("/api/customer/me/favorites", authHeader)
      .then((fs) => setFavIds(new Set(fs.map((x) => x.id))))
      .catch(() => {});
    // eslint-disable-next-line
  }, [customer]);

  function toggleFav(id: number) {
    if (!customer) return;
    const on = favIds.has(id);
    const n = new Set(favIds);
    on ? n.delete(id) : n.add(id);
    setFavIds(n);
    (on ? api.delete(`/api/customer/me/favorites/${id}`, authHeader) : api.post(`/api/customer/me/favorites/${id}`, {}, authHeader)).catch(() => {});
  }

  const allServices = useMemo(() => catalog.flatMap((c) => c.services), [catalog]);
  const selectedServices = useMemo(
    () => serviceIds.map((id) => allServices.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s),
    [allServices, serviceIds],
  );
  const service = selectedServices[0] ?? null; // first pick (waitlist context, back-compat)
  const serviceLabel = selectedServices.map((s) => s.name).join(" + ");
  // Add-ons of every selected service's category.
  const addOns = useMemo(() => {
    const catsOf = new Set(selectedServices.map((s) => s.categoryId));
    return catalog.filter((c) => catsOf.has(c.id)).flatMap((c) => c.addOns);
  }, [catalog, selectedServices]);
  const selectedAddOns = addOns.filter((a) => addOnIds.includes(a.id));
  const total = selectedServices.reduce((s, x) => s + x.price, 0) + selectedAddOns.reduce((s, a) => s + a.price, 0);
  const totalMin = selectedServices.reduce((s, x) => s + x.durationMin, 0) + selectedAddOns.reduce((s, a) => s + a.durationMin, 0);
  // Specialists able to do ALL selected services (a service with no assigned staff = anyone).
  const eligibleStaff: { id: number; name: string; role: string }[] = useMemo(() => {
    let pool = staff;
    for (const s of selectedServices)
      if (s.staff && s.staff.length) {
        const ok = new Set(s.staff.map((x) => x.id));
        pool = pool.filter((x) => ok.has(x.id));
      }
    return pool;
  }, [staff, selectedServices]);
  const chosenCat = useMemo(() => catalog.find((c) => c.id === catId) ?? null, [catalog, catId]);

  useEffect(() => {
    if (step !== 3 || !serviceIds.length || !date) return;
    setSlots(null);
    setTime("");
    const p = new URLSearchParams({ date, serviceIds: serviceIds.join(",") });
    if (staffId) p.set("staffId", String(staffId));
    if (addOnIds.length) p.set("addOns", addOnIds.join(","));
    api
      .get<{ slots: string[] }>(`/api/availability?${p}`)
      .then((d) => setSlots(d.slots))
      .catch(() => setSlots([]));
    // eslint-disable-next-line
  }, [step, serviceIds.join(","), date, staffId, addOnIds]);

  function toggleService(id: number) {
    setServiceIds((x) => {
      const next = x.includes(id) ? x.filter((i) => i !== id) : [...x, id];
      // Drop add-ons whose category no longer has a selected service.
      const cats = new Set(next.map((sid) => allServices.find((s) => s.id === sid)?.categoryId));
      setAddOnIds((a) => a.filter((aid) => cats.has(addOns.find((ad) => ad.id === aid)?.categoryId)));
      return next;
    });
  }
  function toggleAddOn(id: number) {
    setAddOnIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !serviceIds.length || !date || !time) return;
    if (!form.customerName.trim() || !form.customerPhone.trim()) {
      setErr("Please enter your name and phone.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await api.post<{ appointment?: { staffName: string }; paymentPending?: boolean; redirectUrl?: string | null; reference?: string }>(
        "/api/appointments",
        { serviceIds, staffId, date, time, addOnIds, promoCode: promo?.code, paymentMethod: payMethod, ...form },
        authHeader,
      );
      if (r.paymentPending) {
        // Whish: go to the gateway if available, else our status page to await confirmation.
        if (r.redirectUrl) {
          window.location.href = r.redirectUrl;
          return;
        }
        navigate(`/payment/${r.reference}`);
        return;
      }
      track("BOOKING_COMPLETED", payMethod);
      setDone({ date, time, staffName: r.appointment?.staffName ?? "", method: payMethod });
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
          <Row
            k={selectedServices.length > 1 ? "Services" : "Service"}
            v={`${serviceLabel}${selectedAddOns.length ? ` + ${selectedAddOns.map((a) => a.name).join(", ")}` : ""}`}
          />
          <Row k="When" v={`${prettyDate(done.date)} at ${done.time}`} />
          <Row k="With" v={done.staffName || "Our team"} />
          <Row k="Total" v={priceLabel(total)} />
          <Row k="Payment" v={done.method === "CASH" ? "Cash — pay on arrival" : "Whish"} />
        </div>
        {done.method === "CASH" && (
          <p className="bg-brand-soft/50 text-ink mt-3 rounded-xl px-4 py-2.5 text-sm">Please bring {priceLabel(total)} in cash to your appointment.</p>
        )}
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

  return (
    <div className="bg-surface-2 min-h-screen">
      <header className="border-border bg-surface border-b">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
          <Link to="/" className="font-display text-ink text-lg font-extrabold">
            {SITE.name}
          </Link>
          <Link to="/" className="text-muted hover:text-ink ml-auto text-sm font-semibold">
            ← Home
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${i < step ? "bg-brand text-white" : i === step ? "bg-brand ring-brand-soft text-white ring-4" : "border-border bg-surface text-muted border"}`}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <span className={`hidden text-sm font-semibold sm:block ${i === step ? "text-ink" : "text-muted"}`}>{t(s)}</span>
              {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 rounded ${i < step ? "bg-brand" : "bg-border"}`} />}
            </div>
          ))}
        </div>
        <p className="text-ink mt-2 text-sm font-semibold sm:hidden">
          Step {step + 1} of {STEPS.length} · <span className="text-brand">{t(STEPS[step])}</span>
        </p>

        <div className="mt-6">
          {/* Step 0 — category */}
          {step === 0 && (
            <div>
              <h2 className="font-display text-ink text-xl font-bold">{t("What are you here for?")}</h2>
              <p className="text-muted mt-1 text-sm">{t("Choose a category to see our services.")}</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {catalog.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setCatId(cat.id);
                      setStep(1);
                    }}
                    className="lift border-border bg-surface group relative overflow-hidden rounded-[1.5rem] border text-left"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <img
                        src={SITE.categoryImages[cat.name] ?? SITE.heroImage}
                        alt={cat.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                      <p className="font-display absolute bottom-3 left-4 text-lg font-bold text-white">
                        {cat.emoji} {cat.name}
                      </p>
                    </div>
                    <p className="text-muted px-4 py-3 text-sm">
                      {cat.services.length} service{cat.services.length === 1 ? "" : "s"} <span className="text-brand float-right font-semibold">Choose →</span>
                    </p>
                  </button>
                ))}
              </div>
              {!catalog.length && <p className="text-muted text-center">Loading…</p>}
            </div>
          )}

          {/* Step 1 — service (+ add-ons) */}
          {step === 1 && (
            <div className="space-y-6">
              {[chosenCat]
                .filter((c): c is Category => !!c)
                .map((cat) => (
                  <div key={cat.id}>
                    <h3 className="font-display text-brand-dark mb-2 font-bold">
                      {cat.emoji} {cat.name}
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {cat.services.map((s) => (
                        <div key={s.id} className="relative">
                          <button
                            onClick={() => toggleService(s.id)}
                            className={`card hover:border-brand flex w-full items-center justify-between gap-3 p-4 text-left transition ${serviceIds.includes(s.id) ? "border-brand ring-brand ring-1" : ""} ${customer ? "pr-9" : ""}`}
                          >
                            <span className="flex items-center gap-2.5">
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold transition ${serviceIds.includes(s.id) ? "border-brand bg-brand text-white" : "border-border bg-surface text-transparent"}`}
                              >
                                ✓
                              </span>
                              <span>
                                <span className="text-ink block font-semibold">{s.name}</span>
                                <span className="text-muted text-xs">🕐 {durationLabel(s.durationMin)}</span>
                              </span>
                            </span>
                            <span className="font-display text-brand shrink-0 font-bold">{priceLabel(s.price)}</span>
                          </button>
                          {customer && (
                            <button
                              onClick={() => toggleFav(s.id)}
                              aria-label="Favourite"
                              className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-lg ${favIds.has(s.id) ? "text-brand" : "text-muted/50 hover:text-brand"}`}
                            >
                              {favIds.has(s.id) ? "♥" : "♡"}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              {!catalog.length && <p className="text-muted text-center">Loading…</p>}

              {selectedServices.length > 0 && (
                <p className="bg-brand-soft/40 text-ink rounded-xl px-4 py-2.5 text-sm">
                  💡 {t("You can pick more than one service")} — {t("they'll be booked back-to-back in one visit.")}{" "}
                  <button
                    onClick={() => {
                      setCatId(null);
                      setStep(0);
                    }}
                    className="text-brand font-semibold hover:underline"
                  >
                    {t("Add from another category →")}
                  </button>
                </p>
              )}

              {selectedServices.length > 0 && addOns.length > 0 && (
                <div className="card p-4">
                  <p className="text-ink font-semibold">
                    Add-ons <span className="text-muted font-normal">(optional)</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {addOns.map((a) => (
                      <button key={a.id} onClick={() => toggleAddOn(a.id)} className={`chip ${addOnIds.includes(a.id) ? "chip-active" : ""}`}>
                        {a.name}
                        {a.price > 0 ? ` +${priceLabel(a.price)}` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => setStep(0)} className="btn btn-ghost px-5 py-2 text-sm">
                {t("← Categories")}
              </button>

              {selectedServices.length > 0 && (
                <div className="bg-surface ring-border sticky bottom-4 flex items-center justify-between gap-3 rounded-2xl p-3 shadow-lg ring-1">
                  <span className="min-w-0 text-sm">
                    <span className="text-ink block truncate font-semibold">{serviceLabel}</span>
                    <span className="text-muted">
                      {selectedServices.length > 1 ? `${selectedServices.length} services · ` : ""}
                      {durationLabel(totalMin)} · <span className="text-brand font-semibold">{priceLabel(total)}</span>
                    </span>
                  </span>
                  <button onClick={() => setStep(2)} className="btn btn-primary shrink-0 px-6 py-2.5">
                    {t("Continue →")}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 2 — specialist (only those who perform this service) */}
          {step === 2 && (
            <div>
              <h2 className="font-display text-ink text-xl font-bold">{t("Choose your specialist")}</h2>
              {eligibleStaff.length > 1 && (
                <p className="text-muted mt-1 text-sm">
                  {serviceLabel} {selectedServices.length > 1 ? "are" : "is"} done by {eligibleStaff.length} of our specialists.
                </p>
              )}
              {selectedServices.length > 1 && eligibleStaff.length === 0 && (
                <div className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
                  No single specialist offers all of those services together — please book them as separate visits.
                  <button onClick={() => setStep(1)} className="text-brand ml-1 font-semibold hover:underline">
                    {t("← Change services")}
                  </button>
                </div>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  disabled={selectedServices.length > 1 && eligibleStaff.length === 0}
                  onClick={() => {
                    setStaffId(null);
                    setStep(3);
                  }}
                  className={`card hover:border-brand p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${staffId === null ? "border-brand" : ""}`}
                >
                  <p className="text-ink font-semibold">✨ Any available</p>
                  <p className="text-muted text-xs">First free specialist — most flexible times</p>
                </button>
                {eligibleStaff.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setStaffId(m.id);
                      setStep(3);
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
              <button onClick={() => setStep(1)} className="btn btn-ghost mt-5 px-5 py-2 text-sm">
                {t("← Back")}
              </button>
            </div>
          )}

          {/* Step 3 — date & time */}
          {step === 3 && (
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
                        {t("join the waiting list →")}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {slots.map((t) => (
                          <button
                            key={t}
                            onClick={() => {
                              setTime(t);
                              setStep(4);
                            }}
                            className={`chip ${time === t ? "chip-active" : ""}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      <p className="text-muted mt-3 text-center text-sm">
                        {t("Don't see a time that works?")}{" "}
                        <button onClick={() => setWaitOpen(true)} className="text-brand font-semibold hover:underline">
                          {t("join the waiting list →")}
                        </button>
                      </p>
                    </>
                  )}
                </div>
              )}
              <button onClick={() => setStep(2)} className="btn btn-ghost mt-6 px-5 py-2 text-sm">
                {t("← Back")}
              </button>
            </div>
          )}

          {/* Step 4 — details */}
          {step === 4 && service && (
            <form onSubmit={submit} className="space-y-4">
              <div className="card p-4 text-sm">
                <p className="font-display text-ink text-lg font-bold">
                  {serviceLabel}
                  {selectedAddOns.length ? ` + ${selectedAddOns.map((a) => a.name).join(", ")}` : ""}
                </p>
                <p className="text-muted mt-1">
                  {prettyDate(date)} at {time} · {durationLabel(totalMin)} · {priceLabel(total)}
                  {staffId ? ` · with ${staff.find((s) => s.id === staffId)?.name}` : ""}
                </p>
                {selectedServices.length > 1 && (
                  <p className="text-muted mt-1 text-xs">{selectedServices.length} services, one after the other in the same visit.</p>
                )}
              </div>
              <PromoField amount={total} authHeader={authHeader} applied={promo} onApply={setPromo} onClear={() => setPromo(null)} />
              {promo && (
                <p className="text-ink text-right text-sm font-semibold">
                  Total after discount: <span className="text-brand">{priceLabel(Math.max(0, total - promo.discount))}</span>
                </p>
              )}
              <input
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                required
                placeholder={t("Your name *")}
                className="input"
              />
              <input
                value={form.customerPhone}
                onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                required
                placeholder={t("Phone number *")}
                className="input"
              />
              <input
                value={form.customerEmail}
                onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                placeholder={t("Email (optional)")}
                className="input"
              />
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                placeholder={t("Anything we should know? (optional)")}
                className="input"
              />
              <PaymentMethodPicker value={payMethod} onChange={setPayMethod} />
              {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600">{err}</p>}
              <button type="submit" disabled={busy} className="btn btn-primary w-full py-3.5 text-lg disabled:opacity-60">
                {busy ? t("Booking…") : payMethod === "WHISH" ? t("Continue to payment") : t("Confirm booking")}
              </button>
              <button type="button" onClick={() => setStep(3)} className="btn btn-ghost w-full py-2.5 text-sm">
                {t("← Back")}
              </button>
            </form>
          )}
        </div>
      </div>
      {waitOpen && (
        <WaitlistForm
          context={{ serviceId: service?.id, serviceName: service?.name, staffId, staffName: staff.find((s) => s.id === staffId)?.name, date }}
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
