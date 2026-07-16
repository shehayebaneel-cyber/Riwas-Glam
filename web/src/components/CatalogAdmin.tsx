import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AddOn, Category, Service } from "../types";

/** Full manager control — edit names, prices, durations & descriptions inline;
 *  add, hide, delete and reorder categories, services & add-ons. No developer. */
export function CatalogAdmin({ adminKey }: { adminKey: string }) {
  const H = { "x-admin-key": adminKey };
  const [cats, setCats] = useState<Category[] | null>(null);
  const load = () =>
    api
      .get<Category[]>("/api/admin/catalog", H)
      .then(setCats)
      .catch(() => setCats([]));
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);
  const reorder = (type: string, id: number, direction: "up" | "down") => api.post("/api/admin/reorder", { type, id, direction }, H).then(load);

  if (!cats) return <div className="text-muted py-10 text-center">Loading catalog…</div>;

  return (
    <div className="space-y-5">
      <p className="text-muted text-sm">
        Tap any field to edit — changes save automatically and update the live site. Use ↑ ↓ to reorder, and the buttons to hide, add or delete.
      </p>

      {cats.map((cat, ci) => (
        <div key={cat.id} className={`card p-4 ${cat.isActive ? "" : "opacity-60"}`}>
          {/* Category header */}
          <div className="flex flex-wrap items-center gap-2">
            <Inline
              value={cat.emoji}
              onSave={(v) => api.patch(`/api/admin/categories/${cat.id}`, { emoji: v }, H).then(load)}
              className="w-11 text-center text-lg"
            />
            <Inline
              value={cat.name}
              onSave={(v) => api.patch(`/api/admin/categories/${cat.id}`, { name: v }, H).then(load)}
              className="font-display text-ink min-w-[8rem] flex-1 text-lg font-bold"
            />
            {!cat.isActive && <span className="bg-surface-2 text-muted rounded-full px-2 py-0.5 text-[10px] font-bold">Hidden</span>}
            <div className="ml-auto flex items-center gap-1">
              <IconBtn label="↑" disabled={ci === 0} onClick={() => reorder("category", cat.id, "up")} />
              <IconBtn label="↓" disabled={ci === cats.length - 1} onClick={() => reorder("category", cat.id, "down")} />
              <TextBtn onClick={() => api.patch(`/api/admin/categories/${cat.id}`, { isActive: !cat.isActive }, H).then(load)}>
                {cat.isActive ? "Hide" : "Show"}
              </TextBtn>
              <TextBtn
                danger
                onClick={async () => {
                  if (confirm(`Delete "${cat.name}" and all its services?`)) {
                    await api.delete(`/api/admin/categories/${cat.id}`, H);
                    load();
                  }
                }}
              >
                Delete
              </TextBtn>
            </div>
          </div>

          {/* Services */}
          <div className="mt-3 space-y-1.5">
            {cat.services.map((s, si) => (
              <ItemRow
                key={s.id}
                kind="services"
                item={s}
                first={si === 0}
                last={si === cat.services.length - 1}
                H={H}
                onChange={load}
                onReorder={(d) => reorder("service", s.id, d)}
                withDescription
              />
            ))}
            <AddRow
              placeholder="+ Add a service…"
              onAdd={async (name) => {
                await api.post("/api/admin/services", { categoryId: cat.id, name, durationMin: 30, price: 0 }, H);
                load();
              }}
            />
          </div>

          {/* Add-ons */}
          <div className="bg-surface-2 mt-4 rounded-xl p-3">
            <p className="text-muted text-xs font-bold uppercase tracking-wide">Add-ons</p>
            <div className="mt-2 space-y-1.5">
              {cat.addOns.map((a, ai) => (
                <ItemRow
                  key={a.id}
                  kind="addons"
                  item={a}
                  first={ai === 0}
                  last={ai === cat.addOns.length - 1}
                  H={H}
                  onChange={load}
                  onReorder={(d) => reorder("addon", a.id, d)}
                />
              ))}
              <AddRow
                placeholder="+ Add an add-on…"
                onAdd={async (name) => {
                  await api.post("/api/admin/addons", { categoryId: cat.id, name, durationMin: 0, price: 0 }, H);
                  load();
                }}
              />
            </div>
          </div>
        </div>
      ))}

      <AddRow
        placeholder="+ Add a new category…"
        big
        onAdd={async (name) => {
          await api.post("/api/admin/categories", { name }, H);
          load();
        }}
      />
    </div>
  );
}

// A service or add-on row with inline-editable name / duration / price (+ description).
function ItemRow({
  kind,
  item,
  first,
  last,
  H,
  onChange,
  onReorder,
  withDescription,
}: {
  kind: "services" | "addons";
  item: Service | AddOn;
  first: boolean;
  last: boolean;
  H: Record<string, string>;
  onChange: () => void;
  onReorder: (d: "up" | "down") => void;
  withDescription?: boolean;
}) {
  const [showDesc, setShowDesc] = useState(false);
  const patch = (data: Record<string, unknown>) => api.patch(`/api/admin/${kind}/${item.id}`, data, H).then(onChange);
  const desc = (item as Service).description ?? "";
  return (
    <div className={`border-border bg-surface rounded-lg border ${item.isActive ? "" : "opacity-50"}`}>
      <div className="flex flex-wrap items-center gap-2 p-2">
        <Inline value={item.name} onSave={(v) => patch({ name: v })} className="text-ink min-w-[7rem] flex-1 font-semibold" />
        <label className="text-muted flex items-center gap-1 text-xs">
          min
          <NumBox value={item.durationMin} onSave={(v) => patch({ durationMin: v })} />
        </label>
        <label className="text-muted flex items-center gap-1 text-xs">
          $<NumBox value={item.price} onSave={(v) => patch({ price: v })} />
        </label>
        <div className="ml-auto flex items-center gap-1">
          {withDescription && <IconBtn label="✎" onClick={() => setShowDesc((x) => !x)} title="Description" />}
          <IconBtn label="↑" disabled={first} onClick={() => onReorder("up")} />
          <IconBtn label="↓" disabled={last} onClick={() => onReorder("down")} />
          <TextBtn onClick={() => patch({ isActive: !item.isActive })}>{item.isActive ? "Hide" : "Show"}</TextBtn>
          <TextBtn
            danger
            onClick={async () => {
              if (confirm(`Delete "${item.name}"?`)) {
                await api.delete(`/api/admin/${kind}/${item.id}`, H);
                onChange();
              }
            }}
          >
            ✕
          </TextBtn>
        </div>
      </div>
      {withDescription && showDesc && (
        <div className="border-border border-t p-2">
          <textarea
            defaultValue={desc}
            onBlur={(e) => {
              if (e.target.value !== desc) patch({ description: e.target.value });
            }}
            rows={3}
            placeholder="Service description (shown on the site)…"
            className="border-border bg-surface focus:border-brand w-full rounded-lg border px-3 py-2 text-sm outline-none"
          />
        </div>
      )}
    </div>
  );
}

// Click-to-edit text field that saves on blur / Enter.
function Inline({ value, onSave, className = "" }: { value: string; onSave: (v: string) => void; className?: string }) {
  return (
    <input
      defaultValue={value}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v && v !== value) onSave(v);
        else e.target.value = value;
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`hover:border-border focus:border-brand focus:bg-surface rounded-lg border border-transparent bg-transparent px-2 py-1.5 outline-none ${className}`}
    />
  );
}
function NumBox({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  return (
    <input
      type="number"
      defaultValue={value}
      onBlur={(e) => {
        const v = Number(e.target.value);
        if (v !== value) onSave(v);
      }}
      className="border-border focus:border-brand w-16 rounded-md border px-2 py-1 text-sm outline-none"
    />
  );
}

function AddRow({ placeholder, onAdd, big }: { placeholder: string; onAdd: (name: string) => void; big?: boolean }) {
  const [v, setV] = useState("");
  const add = () => {
    if (v.trim()) {
      onAdd(v.trim());
      setV("");
    }
  };
  return (
    <div className="flex gap-2">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder={placeholder}
        className={`border-border bg-surface focus:border-brand flex-1 rounded-lg border border-dashed px-3 text-sm outline-none ${big ? "py-3 font-semibold" : "py-2"}`}
      />
      <button onClick={add} disabled={!v.trim()} className="btn btn-primary px-4 py-1.5 text-sm disabled:opacity-40">
        Add
      </button>
    </div>
  );
}
function IconBtn({ label, onClick, disabled, title }: { label: string; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="border-border text-ink hover:bg-surface-2 flex h-6 w-6 items-center justify-center rounded border disabled:opacity-30"
    >
      {label}
    </button>
  );
}
function TextBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`hover:bg-surface-2 rounded px-2 py-1 text-xs font-semibold ${danger ? "text-red-500" : "text-muted hover:text-ink"}`}>
      {children}
    </button>
  );
}
