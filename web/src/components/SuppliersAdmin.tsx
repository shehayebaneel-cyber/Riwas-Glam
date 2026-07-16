import { useEffect, useState } from "react";
import { api } from "../lib/api";

const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
type Supplier = {
  id: number;
  name: string;
  phone: string;
  email: string;
  website: string;
  note: string;
  isActive: boolean;
  lastPurchase: string | null;
  totalSpent: number;
  orderCount: number;
};
type Product = { id: number; name: string; costPrice: number };
type POItem = { productId: number; name: string; qty: number; price: number };
type PO = {
  id: number;
  supplierId: number | null;
  supplierName: string;
  status: string;
  items: POItem[];
  total: number;
  note: string;
  receivedAt: string | null;
  createdAt: string;
};
const PO_BADGE: Record<string, string> = {
  DRAFT: "bg-surface-2 text-muted",
  ORDERED: "bg-amber-400/15 text-amber-600",
  RECEIVED: "bg-emerald-500/15 text-emerald-600",
  CANCELLED: "bg-red-500/15 text-red-500",
};

export function SuppliersAdmin({ adminKey }: { adminKey: string }) {
  const H = { "x-admin-key": adminKey };
  const [sub, setSub] = useState<"suppliers" | "orders">("suppliers");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<PO[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", email: "", website: "" });
  // new-PO builder
  const [poSupplier, setPoSupplier] = useState("");
  const [poItems, setPoItems] = useState<POItem[]>([]);
  const [pick, setPick] = useState({ productId: "", qty: "1", price: "" });

  const load = () => {
    api
      .get<Supplier[]>("/api/admin/suppliers", H)
      .then(setSuppliers)
      .catch(() => {});
    api
      .get<Product[]>("/api/admin/products", H)
      .then(setProducts)
      .catch(() => {});
    api
      .get<PO[]>("/api/admin/purchase-orders", H)
      .then(setOrders)
      .catch(() => {});
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);

  async function addSupplier() {
    if (!form.name.trim()) return;
    await api.post("/api/admin/suppliers", form, H).catch((e) => alert(e instanceof Error ? e.message : "Failed"));
    setForm({ name: "", phone: "", email: "", website: "" });
    load();
  }
  async function delSupplier(id: number) {
    if (confirm("Delete this supplier?")) {
      await api.delete(`/api/admin/suppliers/${id}`, H);
      load();
    }
  }

  function addItem() {
    const p = products.find((x) => x.id === Number(pick.productId));
    if (!p || Number(pick.qty) <= 0) return;
    setPoItems([...poItems, { productId: p.id, name: p.name, qty: Number(pick.qty), price: Number(pick.price) || p.costPrice || 0 }]);
    setPick({ productId: "", qty: "1", price: "" });
  }
  async function createPO(markOrdered: boolean) {
    if (!poItems.length) return;
    await api
      .post("/api/admin/purchase-orders", { supplierId: poSupplier ? Number(poSupplier) : null, items: poItems, status: markOrdered ? "ORDERED" : "DRAFT" }, H)
      .catch((e) => alert(e instanceof Error ? e.message : "Failed"));
    setPoItems([]);
    setPoSupplier("");
    load();
  }
  async function receivePO(id: number) {
    if (confirm("Mark received? This adds the items to stock.")) {
      await api.post(`/api/admin/purchase-orders/${id}/receive`, {}, H);
      load();
    }
  }
  async function setPOStatus(id: number, status: string) {
    await api.post(`/api/admin/purchase-orders/${id}/status`, { status }, H);
    load();
  }

  const poTotal = poItems.reduce((s, i) => s + i.qty * i.price, 0);

  return (
    <div className="space-y-4">
      <div className="bg-surface-2 flex gap-1 rounded-full p-1">
        {(["suppliers", "orders"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSub(s)}
            className={`flex-1 rounded-full py-1.5 text-sm font-semibold ${sub === s ? "bg-brand text-white" : "text-muted"}`}
          >
            {s === "suppliers" ? "Suppliers" : "Purchase orders"}
          </button>
        ))}
      </div>

      {sub === "suppliers" && (
        <>
          <div className="card p-4">
            <p className="font-display text-ink font-bold">Add supplier</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name *" className="input !py-2 text-sm" />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="input !py-2 text-sm" />
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="input !py-2 text-sm" />
              <input
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder="Website"
                className="input !py-2 text-sm"
              />
            </div>
            <button onClick={addSupplier} className="btn btn-primary mt-2 px-4 py-1.5 text-sm">
              Add supplier
            </button>
          </div>
          {suppliers.length === 0 ? (
            <div className="card text-muted p-8 text-center">No suppliers yet.</div>
          ) : (
            suppliers.map((s) => (
              <div key={s.id} className="card p-4 text-sm">
                <div className="flex items-center justify-between">
                  <p className="text-ink font-semibold">{s.name}</p>
                  <button onClick={() => delSupplier(s.id)} className="text-xs text-red-500">
                    Delete
                  </button>
                </div>
                <p className="text-muted mt-0.5 text-xs">
                  {[
                    s.phone && (
                      <a key="p" href={`tel:${s.phone}`} className="text-brand">
                        {s.phone}
                      </a>
                    ),
                    s.email,
                    s.website,
                  ]
                    .filter(Boolean)
                    .map((x, i) => (
                      <span key={i}>
                        {i > 0 && " · "}
                        {x}
                      </span>
                    ))}
                </p>
                <p className="text-muted mt-1 text-xs">
                  {s.orderCount} order{s.orderCount === 1 ? "" : "s"} · spent {money(s.totalSpent)}
                  {s.lastPurchase ? ` · last ${new Date(s.lastPurchase).toLocaleDateString()}` : ""}
                </p>
              </div>
            ))
          )}
        </>
      )}

      {sub === "orders" && (
        <>
          <div className="card p-4">
            <p className="font-display text-ink font-bold">New purchase order</p>
            <select value={poSupplier} onChange={(e) => setPoSupplier(e.target.value)} className="input mt-2 !py-2 text-sm">
              <option value="">— Supplier (optional) —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                value={pick.productId}
                onChange={(e) => {
                  const p = products.find((x) => x.id === Number(e.target.value));
                  setPick({ ...pick, productId: e.target.value, price: p ? String(p.costPrice) : "" });
                }}
                className="input !w-auto flex-1 !py-2 text-sm"
              >
                <option value="">Product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={pick.qty}
                onChange={(e) => setPick({ ...pick, qty: e.target.value })}
                placeholder="Qty"
                className="input !w-20 !py-2 text-sm"
              />
              <input
                type="number"
                value={pick.price}
                onChange={(e) => setPick({ ...pick, price: e.target.value })}
                placeholder="Unit $"
                className="input !w-24 !py-2 text-sm"
              />
              <button onClick={addItem} className="btn btn-ghost px-3 py-2 text-sm">
                + Add
              </button>
            </div>
            {poItems.length > 0 && (
              <div className="mt-2 space-y-1">
                {poItems.map((it, i) => (
                  <div key={i} className="bg-surface-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-sm">
                    <span className="text-ink">
                      {it.name} × {it.qty}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted">{money(it.qty * it.price)}</span>
                      <button onClick={() => setPoItems(poItems.filter((_, j) => j !== i))} className="text-red-400">
                        ✕
                      </button>
                    </span>
                  </div>
                ))}
                <p className="text-ink pt-1 text-right text-sm font-bold">Total: {money(poTotal)}</p>
                <div className="flex gap-2">
                  <button onClick={() => createPO(false)} className="btn btn-ghost px-4 py-1.5 text-sm">
                    Save draft
                  </button>
                  <button onClick={() => createPO(true)} className="btn btn-primary px-4 py-1.5 text-sm">
                    Create & mark ordered
                  </button>
                </div>
              </div>
            )}
          </div>
          {orders.length === 0 ? (
            <div className="card text-muted p-8 text-center">No purchase orders yet.</div>
          ) : (
            orders.map((o) => (
              <div key={o.id} className="card p-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-ink font-semibold">PO #{o.id}</span>
                  {o.supplierName && <span className="text-muted">· {o.supplierName}</span>}
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${PO_BADGE[o.status] ?? "bg-surface-2 text-muted"}`}>
                    {o.status.toLowerCase()}
                  </span>
                </div>
                <p className="text-muted mt-1 text-xs">
                  {o.items.map((i) => `${i.name}×${i.qty}`).join(", ")} · {money(o.total)}
                </p>
                {o.status !== "RECEIVED" && o.status !== "CANCELLED" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => receivePO(o.id)} className="btn btn-ghost px-3 py-1 text-xs text-emerald-600">
                      Receive → stock
                    </button>
                    {o.status === "DRAFT" && (
                      <button onClick={() => setPOStatus(o.id, "ORDERED")} className="btn btn-ghost px-3 py-1 text-xs text-amber-600">
                        Mark ordered
                      </button>
                    )}
                    <button onClick={() => setPOStatus(o.id, "CANCELLED")} className="btn btn-ghost px-3 py-1 text-xs text-red-500">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
