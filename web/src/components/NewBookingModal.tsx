import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { todayIso } from "../lib/time";
import type { Category, Staff } from "../types";

type Pkg = { id: number; title: string };

export function NewBookingModal({
  adminKey,
  onClose,
  onCreated,
  defaultDate,
  defaultTime,
  defaultStaffId,
}: {
  adminKey: string;
  onClose: () => void;
  onCreated: () => void;
  defaultDate?: string;
  defaultTime?: string;
  defaultStaffId?: string;
}) {
  const hdr = { "x-admin-key": adminKey };
  const [catalog, setCatalog] = useState<Category[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const today = todayIso();
  const [f, setF] = useState({
    kind: "service",
    packageId: "",
    staffId: defaultStaffId ?? "",
    date: defaultDate || today,
    time: defaultTime || "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    note: "",
  });
  const [serviceIds, setServiceIds] = useState<number[]>([]); // one or more — booked back-to-back
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const allServices = catalog.flatMap((c) => c.services);

  useEffect(() => {
    api
      .get<Category[]>("/api/catalog")
      .then(setCatalog)
      .catch(() => {});
    api
      .get<Pkg[]>("/api/packages")
      .then(setPackages)
      .catch(() => {});
    api
      .get<Staff[]>("/api/staff")
      .then(setStaff)
      .catch(() => {});
  }, []);

  async function save() {
    if (!f.customerName.trim() || !f.customerPhone.trim()) {
      setErr("Enter the customer's name and phone.");
      return;
    }
    if (!f.time) {
      setErr("Pick a time.");
      return;
    }
    if (f.kind === "service" && !serviceIds.length) {
      setErr("Choose at least one service.");
      return;
    }
    if (f.kind === "package" && !f.packageId) {
      setErr("Choose a package.");
      return;
    }
    setBusy(true);
    setErr("");
    const body = {
      ...(f.kind === "package" ? { packageId: Number(f.packageId) } : { serviceIds }),
      staffId: f.staffId ? Number(f.staffId) : null,
      date: f.date,
      time: f.time,
      customerName: f.customerName,
      customerPhone: f.customerPhone,
      customerEmail: f.customerEmail,
      note: f.note,
    };
    try {
      await api.post("/api/admin/appointments/new", body, hdr);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create the booking.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full max-w-lg rounded-t-[1.5rem] p-5 shadow-2xl sm:rounded-[1.5rem]" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-ink text-lg font-bold">New booking (phone / walk-in)</p>

        <div className="bg-surface-2 mt-3 flex gap-1 rounded-full p-1">
          {[
            ["service", "Service"],
            ["package", "Package"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => set("kind", v)}
              className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold ${f.kind === v ? "bg-brand text-white" : "text-muted"}`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-3">
          {f.kind === "service" ? (
            <div className="space-y-2">
              <select
                value=""
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id && !serviceIds.includes(id)) setServiceIds([...serviceIds, id]);
                }}
                className="input"
              >
                <option value="">{serviceIds.length ? "Add another service…" : "Choose a service…"}</option>
                {catalog.map((c) => (
                  <optgroup key={c.id} label={`${c.emoji} ${c.name}`}>
                    {c.services
                      .filter((s) => !serviceIds.includes(s.id))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              {serviceIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {serviceIds.map((id) => {
                    const s = allServices.find((x) => x.id === id);
                    return (
                      <span key={id} className="bg-brand-soft text-ink inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
                        {s?.name ?? id}
                        <button onClick={() => setServiceIds(serviceIds.filter((x) => x !== id))} aria-label="Remove" className="text-muted hover:text-ink">
                          ✕
                        </button>
                      </span>
                    );
                  })}
                  {serviceIds.length > 1 && <span className="text-muted self-center text-xs">booked back-to-back</span>}
                </div>
              )}
            </div>
          ) : (
            <select value={f.packageId} onChange={(e) => set("packageId", e.target.value)} className="input">
              <option value="">Choose a package…</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}
          <select value={f.staffId} onChange={(e) => set("staffId", e.target.value)} className="input">
            <option value="">Any available specialist</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.role ? ` — ${s.role}` : ""}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-muted mb-1 block text-xs font-semibold">Date</span>
              <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="text-muted mb-1 block text-xs font-semibold">Time</span>
              <input type="time" value={f.time} onChange={(e) => set("time", e.target.value)} className="input" />
            </label>
          </div>
          <input value={f.customerName} onChange={(e) => set("customerName", e.target.value)} placeholder="Customer name *" className="input" />
          <input value={f.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} placeholder="Phone *" className="input" />
          <input value={f.customerEmail} onChange={(e) => set("customerEmail", e.target.value)} placeholder="Email (optional)" className="input" />
          <textarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="Note (optional)" className="input" />
          {err && <p className="text-sm font-medium text-red-600">{err}</p>}
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={save} disabled={busy} className="btn btn-primary flex-1 py-2.5 disabled:opacity-60">
            {busy ? "Saving…" : "Create booking"}
          </button>
          <button onClick={onClose} className="btn btn-ghost px-5 py-2.5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
