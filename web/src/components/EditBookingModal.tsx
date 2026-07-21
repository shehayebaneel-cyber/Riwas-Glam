import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { timeOptions } from "../lib/time";
import type { Appointment, Staff } from "../types";

export function EditBookingModal({
  adminKey,
  appt,
  onClose,
  onSaved,
}: {
  adminKey: string;
  appt: Appointment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const hdr = { "x-admin-key": adminKey };
  const [staff, setStaff] = useState<Staff[]>([]);
  const [f, setF] = useState({
    date: appt.date,
    time: appt.time,
    staffId: appt.staffId != null ? String(appt.staffId) : "",
    customerName: appt.customerName,
    customerPhone: appt.customerPhone,
    customerEmail: appt.customerEmail ?? "",
    note: appt.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const opts = timeOptions();
  const timeUnlisted = f.time && !opts.some((o) => o.value === f.time);

  useEffect(() => {
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
    setBusy(true);
    setErr("");
    try {
      await api.patch(
        `/api/admin/appointments/${appt.id}`,
        {
          edit: true,
          date: f.date,
          time: f.time,
          staffId: f.staffId ? Number(f.staffId) : null,
          customerName: f.customerName,
          customerPhone: f.customerPhone,
          customerEmail: f.customerEmail,
          note: f.note,
        },
        hdr,
      );
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save the booking.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full max-w-lg rounded-t-[1.5rem] p-5 shadow-2xl sm:rounded-[1.5rem]" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-ink text-lg font-bold">Edit booking</p>
        <p className="text-muted mt-0.5 text-sm">
          {appt.serviceName}
          {appt.groupId ? " · part of a multi-service visit (the whole visit moves together)" : ""}
        </p>

        <div className="mt-3 space-y-3">
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
              <select value={f.time} onChange={(e) => set("time", e.target.value)} className="input">
                {timeUnlisted && <option value={f.time}>{f.time} (current)</option>}
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
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
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button onClick={onClose} className="btn btn-ghost px-5 py-2.5">
            Cancel
          </button>
        </div>
        <p className="text-muted mt-2 text-xs">To change the service itself, cancel this booking and create a new one.</p>
      </div>
    </div>
  );
}
