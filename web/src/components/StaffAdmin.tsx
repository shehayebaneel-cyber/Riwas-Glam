import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Category, DaySchedule, StaffFull } from "../types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const blankDay = (): DaySchedule => ({ off: false, open: "10:00", close: "19:00", breakStart: "", breakEnd: "" });
const SECTIONS = ["bookings", "waitlist", "calendar", "finances", "inventory", "payouts", "services", "team", "academy", "packages", "loyalty", "marketing", "notifications", "website", "giftcards", "reviews", "reports"];
const PRESETS: Record<string, string[]> = {
  OWNER: SECTIONS,
  MANAGER: ["bookings", "waitlist", "calendar", "finances", "inventory", "payouts", "services", "academy", "packages", "loyalty", "marketing", "notifications", "giftcards", "reviews", "reports"],
  RECEPTIONIST: ["bookings", "waitlist", "calendar", "giftcards", "reviews", "packages", "academy"],
  STAFF: [],
};

export function StaffAdmin({ adminKey }: { adminKey: string }) {
  const H = { "x-admin-key": adminKey };
  const [staff, setStaff] = useState<StaffFull[] | null>(null);
  const [catalog, setCatalog] = useState<Category[]>([]);
  const [newName, setNewName] = useState("");
  const load = () => { api.get<StaffFull[]>("/api/admin/staff", H).then(setStaff).catch(() => setStaff([])); api.get<Category[]>("/api/admin/catalog", H).then(setCatalog).catch(() => {}); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  if (!staff) return <div className="py-10 text-center text-muted">Loading team…</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Each specialist has their own schedule, commission and the services they perform. Customers only see the right specialist for each service.</p>
      {staff.map((s) => <StaffCard key={s.id} s={s} catalog={catalog} H={H} onChange={load} />)}
      <div className="flex gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && newName.trim() && (api.post("/api/admin/staff", { name: newName.trim() }, H).then(() => { setNewName(""); load(); }))} placeholder="+ Add a specialist…" className="flex-1 rounded-lg border border-dashed border-border bg-surface px-3 py-3 text-sm font-semibold outline-none focus:border-brand" />
        <button onClick={() => newName.trim() && api.post("/api/admin/staff", { name: newName.trim() }, H).then(() => { setNewName(""); load(); })} disabled={!newName.trim()} className="btn btn-primary px-4 text-sm disabled:opacity-40">Add</button>
      </div>
    </div>
  );
}

function StaffCard({ s, catalog, H, onChange }: { s: StaffFull; catalog: Category[]; H: Record<string, string>; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [sched, setSched] = useState<DaySchedule[]>(s.schedule.length === 7 ? s.schedule : DAYS.map(blankDay));
  const [blocked, setBlocked] = useState<string[]>(s.blockedDates);
  const [newBlock, setNewBlock] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState(s.accessRole ?? "STAFF");
  const [perms, setPerms] = useState<string[]>(s.permissions ?? []);
  const patch = (data: Record<string, unknown>) => api.patch(`/api/admin/staff/${s.id}`, data, H).then(onChange);
  const svcIds = new Set(s.serviceIds);
  const upd = (i: number, p: Partial<DaySchedule>) => setSched((x) => x.map((d, idx) => (idx === i ? { ...d, ...p } : d)));

  return (
    <div className={`card p-4 ${s.isActive ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft font-display font-bold text-brand">{s.name.slice(0, 1)}</span>
        <input defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && patch({ name: e.target.value.trim() })} className="min-w-[6rem] rounded-lg border border-transparent px-2 py-1 font-display font-bold text-ink hover:border-border focus:border-brand focus:bg-surface" />
        <input defaultValue={s.role} onBlur={(e) => e.target.value !== s.role && patch({ role: e.target.value })} placeholder="Role" className="min-w-[8rem] flex-1 rounded-lg border border-transparent px-2 py-1 text-sm text-muted hover:border-border focus:border-brand focus:bg-surface" />
        <label className="flex items-center gap-1 text-xs text-muted">Commission<input type="number" defaultValue={s.commissionPct} onBlur={(e) => Number(e.target.value) !== s.commissionPct && patch({ commissionPct: Number(e.target.value) })} className="w-16 rounded-md border border-border px-2 py-1" />%</label>
        <div className="ml-auto flex items-center gap-1 text-xs">
          <button onClick={() => setOpen((o) => !o)} className="rounded border border-border px-2 py-1 font-semibold text-ink hover:bg-surface-2">{open ? "Close" : "Schedule & services"}</button>
          <button onClick={() => patch({ isActive: !s.isActive })} className="rounded px-2 py-1 font-semibold text-muted hover:text-ink">{s.isActive ? "Hide" : "Show"}</button>
          <button onClick={async () => { if (confirm(`Remove ${s.name}?`)) { await api.delete(`/api/admin/staff/${s.id}`, H); onChange(); } }} className="rounded px-2 py-1 font-semibold text-red-500">Delete</button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-5 border-t border-border pt-4">
          {/* Schedule */}
          <div>
            <p className="text-sm font-bold text-ink">Working hours</p>
            <div className="mt-2 space-y-1.5">
              {DAYS.map((d, i) => (
                <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="flex w-24 items-center gap-2"><input type="checkbox" checked={!sched[i].off} onChange={(e) => upd(i, { off: !e.target.checked })} /><span className="font-semibold">{d}</span></label>
                  {sched[i].off ? <span className="text-xs text-muted">Day off</span> : (
                    <>
                      <input type="time" value={sched[i].open} onChange={(e) => upd(i, { open: e.target.value })} className="rounded-md border border-border px-2 py-1" />
                      <span className="text-muted">–</span>
                      <input type="time" value={sched[i].close} onChange={(e) => upd(i, { close: e.target.value })} className="rounded-md border border-border px-2 py-1" />
                      <span className="ml-2 text-xs text-muted">break</span>
                      <input type="time" value={sched[i].breakStart} onChange={(e) => upd(i, { breakStart: e.target.value })} className="rounded-md border border-border px-2 py-1" />
                      <span className="text-muted">–</span>
                      <input type="time" value={sched[i].breakEnd} onChange={(e) => upd(i, { breakEnd: e.target.value })} className="rounded-md border border-border px-2 py-1" />
                    </>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => patch({ schedule: sched })} className="btn btn-primary mt-2 px-4 py-1.5 text-sm">Save hours</button>
          </div>

          {/* Blocked dates */}
          <div>
            <p className="text-sm font-bold text-ink">Days off / blocked dates</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {blocked.map((d) => <span key={d} className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold">{d}<button onClick={() => { const n = blocked.filter((x) => x !== d); setBlocked(n); patch({ blockedDates: n }); }} className="text-red-500">✕</button></span>)}
              <input type="date" value={newBlock} onChange={(e) => setNewBlock(e.target.value)} className="rounded-md border border-border px-2 py-1 text-sm" />
              <button onClick={() => { if (newBlock && !blocked.includes(newBlock)) { const n = [...blocked, newBlock].sort(); setBlocked(n); patch({ blockedDates: n }); setNewBlock(""); } }} className="btn btn-ghost px-3 py-1 text-xs">Add</button>
            </div>
          </div>

          {/* Services */}
          <div>
            <p className="text-sm font-bold text-ink">Services {s.name} performs</p>
            <div className="mt-2 space-y-3">
              {catalog.map((cat) => (
                <div key={cat.id}>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">{cat.emoji} {cat.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {cat.services.map((svc) => {
                      const on = svcIds.has(svc.id);
                      return <button key={svc.id} onClick={() => { const n = new Set(svcIds); on ? n.delete(svc.id) : n.add(svc.id); patch({ serviceIds: [...n] }); }} className={`chip !py-1 !text-xs ${on ? "chip-active" : ""}`}>{svc.name}</button>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Login */}
          <div>
            <p className="text-sm font-bold text-ink">Staff login</p>
            <p className="text-xs text-muted">{s.hasLogin ? "✓ Login set — they can sign in at /staff to see their own calendar." : "No login yet — set one so they can see their own calendar."}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input defaultValue={s.loginEmail ?? ""} onBlur={(e) => e.target.value !== (s.loginEmail ?? "") && patch({ loginEmail: e.target.value })} placeholder="email or username" className="rounded-md border border-border px-2 py-1 text-sm" />
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="new password" className="rounded-md border border-border px-2 py-1 text-sm" />
              <button onClick={() => { if (pw.trim()) { patch({ password: pw.trim() }); setPw(""); } }} disabled={!pw.trim()} className="btn btn-ghost px-3 py-1 text-xs disabled:opacity-40">Set password</button>
            </div>
          </div>

          {/* Access role & permissions */}
          <div>
            <p className="text-sm font-bold text-ink">Admin access</p>
            <p className="text-xs text-muted">Controls what they can see if they sign in to the admin dashboard.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {(["STAFF", "RECEPTIONIST", "MANAGER", "OWNER"] as const).map((r) => (
                <button key={r} onClick={() => { setRole(r); setPerms(PRESETS[r]); patch({ accessRole: r, permissions: PRESETS[r] }); }} className={`chip !text-xs ${role === r ? "chip-active" : ""}`}>{r.charAt(0) + r.slice(1).toLowerCase()}</button>
              ))}
            </div>
            {role === "STAFF" && <p className="mt-2 text-xs text-muted">Staff-only: no admin dashboard — they use the /staff portal for their own calendar.</p>}
            {role === "OWNER" && <p className="mt-2 text-xs text-muted">Full access to everything.</p>}
            {(role === "MANAGER" || role === "RECEPTIONIST") && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SECTIONS.map((k) => {
                  const on = perms.includes(k);
                  return <button key={k} onClick={() => { const n = on ? perms.filter((x) => x !== k) : [...perms, k]; setPerms(n); patch({ permissions: n }); }} className={`chip !py-1 !text-xs ${on ? "chip-active" : ""}`}>{on ? "✓ " : ""}{k}</button>;
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
