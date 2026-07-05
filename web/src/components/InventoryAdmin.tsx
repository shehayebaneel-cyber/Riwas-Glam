import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Product = { id: number; name: string; brand: string; category: string; supplier: string; barcode: string; unit: string; costPrice: number; sellingPrice: number; quantity: number; minQuantity: number; expiryDate: string; location: string; isActive: boolean };
type Summary = { total: number; inStock: number; low: number; out: number; value: number; todayUsage: number; expiringSoon: number; lowItems: { id: number; name: string; quantity: number; minQuantity: number; unit: string }[]; expiringItems: { id: number; name: string; expiryDate: string }[] };
type Movement = { id: number; type: string; quantity: number; note: string; createdAt: string; product: { name: string; unit: string } };
type RecipeItem = { id: number; productId: number; quantity: number; product: { name: string; unit: string; costPrice: number } };
type Cat = { id: number; name: string; emoji: string; services: { id: number; name: string; materialCost: number }[] };

const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const emptyProduct = { name: "", brand: "", category: "", supplier: "", barcode: "", unit: "unit", costPrice: "", sellingPrice: "", quantity: "", minQuantity: "", expiryDate: "", location: "" };

export function InventoryAdmin({ adminKey }: { adminKey: string }) {
  const [view, setView] = useState<"dashboard" | "products" | "recipes" | "history">("dashboard");
  const hdr = { "x-admin-key": adminKey };
  return (
    <div className="space-y-4">
      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-full bg-surface-2 p-1">
        {([["dashboard", "📊 Overview"], ["products", "📦 Products"], ["recipes", "🧪 Recipes"], ["history", "🕑 History"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} className={`flex-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold ${view === v ? "bg-brand text-white" : "text-muted"}`}>{l}</button>
        ))}
      </div>
      {view === "dashboard" && <Overview hdr={hdr} />}
      {view === "products" && <Products hdr={hdr} />}
      {view === "recipes" && <Recipes hdr={hdr} />}
      {view === "history" && <History hdr={hdr} />}
    </div>
  );
}

function Overview({ hdr }: { hdr: Record<string, string> }) {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => { api.get<Summary>("/api/admin/inventory/summary", hdr).then(setS).catch(() => {}); /* eslint-disable-next-line */ }, []);
  if (!s) return <p className="card p-8 text-center text-muted">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Products" value={s.total} />
        <Stat label="In stock" value={s.inStock} tone="good" />
        <Stat label="Low stock" value={s.low} tone={s.low ? "warn" : "ink"} />
        <Stat label="Out of stock" value={s.out} tone={s.out ? "bad" : "ink"} />
        <Stat label="Inventory value" value={money(s.value)} />
        <Stat label="Used today" value={s.todayUsage} />
      </div>
      {s.lowItems.length > 0 && (
        <div className="card border-amber-300 p-4" style={{ borderColor: "#f0c34e" }}>
          <p className="font-display font-bold text-amber-600">⚠️ Low / out of stock</p>
          <div className="mt-2 space-y-1 text-sm">
            {s.lowItems.map((p) => (
              <div key={p.id} className="flex justify-between"><span className="text-ink">{p.name}</span><span className={p.quantity <= 0 ? "font-semibold text-red-500" : "font-semibold text-amber-600"}>{p.quantity} {p.unit} left (min {p.minQuantity})</span></div>
            ))}
          </div>
        </div>
      )}
      {s.expiringItems.length > 0 && (
        <div className="card p-4">
          <p className="font-display font-bold text-brand-dark">Expiring within 30 days</p>
          <div className="mt-2 space-y-1 text-sm">{s.expiringItems.map((p) => <div key={p.id} className="flex justify-between"><span className="text-ink">{p.name}</span><span className="text-muted">{p.expiryDate}</span></div>)}</div>
        </div>
      )}
      <p className="text-center text-xs text-muted">Email/SMS low-stock alerts need a messaging provider — they'll light up here for now, and can be wired to email later.</p>
    </div>
  );
}

function Products({ hdr }: { hdr: Record<string, string> }) {
  const [items, setItems] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [stockFor, setStockFor] = useState<Product | null>(null);
  const load = () => api.get<Product[]>("/api/admin/products", hdr).then(setItems).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const badge = (p: Product) => p.quantity <= 0 ? ["Out", "bg-red-500/15 text-red-500"] : p.quantity <= p.minQuantity ? ["Low", "bg-amber-400/15 text-amber-600"] : ["In stock", "bg-emerald-500/15 text-emerald-600"];

  async function del(id: number) { if (!confirm("Delete this product?")) return; await api.delete(`/api/admin/products/${id}`, hdr); load(); }

  return (
    <div className="space-y-3">
      <button onClick={() => setEditing("new")} className="btn btn-primary px-5 py-2">+ Add product</button>
      {items.length === 0 && <p className="card p-8 text-center text-muted">No products yet. Add your first item.</p>}
      {items.map((p) => {
        const [label, cls] = badge(p);
        return (
          <div key={p.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display font-bold text-ink">{p.name}</span>
              {p.brand && <span className="text-xs text-muted">{p.brand}</span>}
              <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              <span><b className="text-ink">{p.quantity}</b> {p.unit} in stock</span>
              <span>min {p.minQuantity}</span>
              <span>cost {money(p.costPrice)}</span>
              <span>value {money(p.quantity * p.costPrice)}</span>
              {p.expiryDate && <span>exp {p.expiryDate}</span>}
              {p.location && <span>📍 {p.location}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setStockFor(p)} className="btn btn-ghost px-3 py-1.5 text-xs text-emerald-600">± Stock</button>
              <button onClick={() => setEditing(p)} className="btn btn-ghost px-3 py-1.5 text-xs">Edit</button>
              <button onClick={() => del(p.id)} className="btn btn-ghost px-3 py-1.5 text-xs text-red-500">Delete</button>
            </div>
          </div>
        );
      })}
      {editing && <ProductForm hdr={hdr} product={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {stockFor && <StockModal hdr={hdr} product={stockFor} onClose={() => setStockFor(null)} onSaved={() => { setStockFor(null); load(); }} />}
    </div>
  );
}

function ProductForm({ hdr, product, onClose, onSaved }: { hdr: Record<string, string>; product: Product | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>(product ? { ...emptyProduct, ...Object.fromEntries(Object.entries(product).map(([k, v]) => [k, String(v ?? "")])) } : { ...emptyProduct });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  async function save() {
    if (!f.name.trim()) return;
    setBusy(true);
    const body = { ...f, costPrice: Number(f.costPrice) || 0, sellingPrice: Number(f.sellingPrice) || 0, minQuantity: Number(f.minQuantity) || 0, ...(product ? {} : { quantity: Number(f.quantity) || 0 }) };
    try {
      if (product) await api.patch(`/api/admin/products/${product.id}`, body, hdr);
      else await api.post("/api/admin/products", body, hdr);
      onSaved();
    } finally { setBusy(false); }
  }
  const F = (k: string, label: string, type = "text") => (
    <label className="block"><span className="mb-1 block text-xs font-semibold text-ink">{label}</span><input type={type} value={f[k]} onChange={(e) => set(k, e.target.value)} className="input !py-2 text-sm" /></label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-[1.5rem] bg-surface p-5 shadow-2xl sm:rounded-[1.5rem]" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-lg font-bold text-ink">{product ? "Edit product" : "Add product"}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {F("name", "Product name")}
          {F("brand", "Brand")}
          {F("category", "Category")}
          {F("supplier", "Supplier")}
          {F("unit", "Unit (unit / ml / g)")}
          {F("location", "Storage location")}
          {F("costPrice", "Cost price $", "number")}
          {F("sellingPrice", "Selling price $", "number")}
          {!product && F("quantity", "Starting quantity", "number")}
          {F("minQuantity", "Low-stock alert at", "number")}
          {F("expiryDate", "Expiry date", "date")}
          {F("barcode", "Barcode (optional)")}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={save} disabled={busy} className="btn btn-primary flex-1 py-2.5 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
          <button onClick={onClose} className="btn btn-ghost px-5 py-2.5">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function StockModal({ hdr, product, onClose, onSaved }: { hdr: Record<string, string>; product: Product; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState("RECEIVE");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!qty) return; setBusy(true);
    try { await api.post(`/api/admin/products/${product.id}/stock`, { type, quantity: Number(qty), note }, hdr); onSaved(); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-[1.5rem] bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-lg font-bold text-ink">{product.name}</p>
        <p className="text-sm text-muted">Currently {product.quantity} {product.unit} in stock.</p>
        <div className="mt-3 flex gap-1 rounded-full bg-surface-2 p-1">
          {[["RECEIVE", "Receive"], ["USE", "Use"], ["ADJUST", "Set to"]].map(([v, l]) => (
            <button key={v} onClick={() => setType(v)} className={`flex-1 rounded-full px-2 py-1.5 text-sm font-semibold ${type === v ? "bg-brand text-white" : "text-muted"}`}>{l}</button>
          ))}
        </div>
        <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={type === "ADJUST" ? "New quantity" : "Quantity"} className="input mt-3" autoFocus />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="input mt-2 text-sm" />
        <div className="mt-4 flex gap-2">
          <button onClick={save} disabled={busy} className="btn btn-primary flex-1 py-2.5 disabled:opacity-60">{busy ? "Saving…" : "Apply"}</button>
          <button onClick={onClose} className="btn btn-ghost px-5 py-2.5">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Recipes({ hdr }: { hdr: Record<string, string> }) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [rows, setRows] = useState<{ productId: number; quantity: number }[]>([]);
  const [cost, setCost] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Cat[]>("/api/admin/catalog", hdr).then(setCats).catch(() => {});
    api.get<Product[]>("/api/admin/products", hdr).then(setProducts).catch(() => {});
    // eslint-disable-next-line
  }, []);
  useEffect(() => {
    if (!serviceId) return; setSaved(false);
    api.get<RecipeItem[]>(`/api/admin/services/${serviceId}/recipe`, hdr).then((r) => setRows(r.map((x) => ({ productId: x.productId, quantity: x.quantity })))).catch(() => setRows([]));
    // eslint-disable-next-line
  }, [serviceId]);

  const estCost = rows.reduce((s, r) => { const p = products.find((x) => x.id === r.productId); return s + (p ? p.costPrice * r.quantity : 0); }, 0);
  async function save() {
    if (!serviceId) return;
    const r = await api.put<{ materialCost: number }>(`/api/admin/services/${serviceId}/recipe`, { items: rows.filter((x) => x.productId && x.quantity > 0) }, hdr);
    setCost(r.materialCost); setSaved(true);
  }

  return (
    <div className="space-y-4">
      <p className="card p-4 text-sm text-muted">Tell the system which products each service uses. When a booking is marked <b>completed</b>, stock is deducted automatically — and each service's <b>material cost</b> (used in Finances) is filled in for you.</p>
      <select value={serviceId ?? ""} onChange={(e) => setServiceId(Number(e.target.value) || null)} className="input">
        <option value="">Choose a service…</option>
        {cats.map((c) => <optgroup key={c.id} label={`${c.emoji} ${c.name}`}>{c.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
      </select>

      {serviceId && (
        <div className="card p-4">
          {products.length === 0 ? <p className="text-sm text-muted">Add some products first (Products tab).</p> : (
            <>
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select value={r.productId} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, productId: Number(e.target.value) } : x))} className="input flex-1 !py-2 text-sm">
                      <option value={0}>Select product…</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                    </select>
                    <input type="number" value={r.quantity} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} className="input !w-24 !py-2 text-sm" placeholder="Qty" />
                    <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-lg text-red-500">✕</button>
                  </div>
                ))}
              </div>
              <button onClick={() => setRows([...rows, { productId: 0, quantity: 1 }])} className="btn btn-ghost mt-2 px-4 py-1.5 text-sm">+ Add product</button>
              <div className="mt-4 flex items-center gap-3 border-t border-border pt-3">
                <span className="text-sm text-muted">Est. material cost: <b className="text-ink">{money(estCost)}</b></span>
                <button onClick={save} className="btn btn-primary ml-auto px-5 py-2">Save recipe</button>
              </div>
              {saved && cost !== null && <p className="mt-2 text-sm font-semibold text-emerald-600">✓ Saved — material cost set to {money(cost)}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function History({ hdr }: { hdr: Record<string, string> }) {
  const [items, setItems] = useState<Movement[]>([]);
  useEffect(() => { api.get<Movement[]>("/api/admin/movements", hdr).then(setItems).catch(() => {}); /* eslint-disable-next-line */ }, []);
  const badge = (t: string) => t === "RECEIVE" ? "bg-emerald-500/15 text-emerald-600" : t === "USE" ? "bg-brand-soft text-brand-dark" : "bg-surface-2 text-muted";
  return (
    <div className="card p-4">
      <p className="font-display font-bold text-brand-dark">Stock movements</p>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? <p className="py-6 text-center text-muted">No movements yet.</p> : items.map((m) => (
          <div key={m.id} className="flex items-center gap-2 border-b border-border pb-2 text-sm last:border-0">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge(m.type)}`}>{m.type}</span>
            <span className="font-semibold text-ink">{m.product?.name ?? "—"}</span>
            <span className={m.quantity < 0 ? "text-red-500" : "text-emerald-600"}>{m.quantity > 0 ? "+" : ""}{m.quantity} {m.product?.unit}</span>
            {m.note && <span className="truncate text-xs text-muted">{m.note}</span>}
            <span className="ml-auto shrink-0 text-xs text-muted">{new Date(m.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "ink" }: { label: string; value: string | number; tone?: "ink" | "good" | "warn" | "bad" }) {
  const c = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "bad" ? "text-red-500" : "text-ink";
  return <div className="card p-4"><p className="text-xs text-muted">{label}</p><p className={`font-display text-2xl font-extrabold ${c}`}>{value}</p></div>;
}
