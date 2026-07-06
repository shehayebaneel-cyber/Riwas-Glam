import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Reveal } from "../components/Reveal";
import { api, durationLabel, priceLabel } from "../lib/api";
import { useI18n } from "../context/I18n";
import { useCustomer } from "../context/CustomerAuth";

type Pkg = { id: number; title: string; image: string; description: string; price: number; durationMin: number; services: string[] };

export function Packages() {
  const { t } = useI18n();
  const { customer, authHeader } = useCustomer();
  const [items, setItems] = useState<Pkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  useEffect(() => { api.get<Pkg[]>("/api/packages").then(setItems).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (customer) api.get<{ PACKAGE: number[] }>("/api/customer/me/wishlist", authHeader).then((w) => setSaved(new Set(w.PACKAGE))).catch(() => {}); /* eslint-disable-next-line */ }, [customer]);
  function toggleSave(id: number) {
    const on = saved.has(id); const n = new Set(saved); on ? n.delete(id) : n.add(id); setSaved(n);
    (on ? api.delete(`/api/customer/me/wishlist/PACKAGE/${id}`, authHeader) : api.post("/api/customer/me/wishlist", { kind: "PACKAGE", itemId: id }, authHeader)).catch(() => {});
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-14 text-center">
        <p className="eyebrow">{t("Save with a bundle")}</p>
        <h1 className="mt-3 font-display text-5xl font-extrabold text-ink">{t("Packages")}</h1>
        <p className="mx-auto mt-3 max-w-lg text-muted">{t("Our favourite services, bundled into one beautiful experience at a special price.")}</p>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-20">
        {loading && <p className="text-center text-muted">Loading…</p>}
        {!loading && items.length === 0 && <p className="text-center text-muted">No packages available right now.</p>}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p, i) => (
            <Reveal key={p.id} delay={(i % 3) * 80}>
              <div className="lift flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-border bg-surface">
                <div className="relative aspect-[4/3] overflow-hidden bg-brand-soft">
                  {p.image ? <img src={p.image} alt={p.title} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-5xl">🎀</div>}
                  <span className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 font-display font-bold text-brand shadow">{priceLabel(p.price)}</span>
                  {customer && <button onClick={() => toggleSave(p.id)} aria-label="Save to wishlist" className={`absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg shadow transition active:scale-90 ${saved.has(p.id) ? "text-brand" : "text-muted hover:text-brand"}`}>{saved.has(p.id) ? "♥" : "♡"}</button>}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="font-display text-xl font-bold text-ink">{p.title}</h2>
                  <p className="mt-1 text-xs text-muted">🕐 {durationLabel(p.durationMin)}</p>
                  {p.description && <p className="mt-2 text-sm leading-relaxed text-muted">{p.description}</p>}
                  {p.services.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {p.services.map((s) => <li key={s} className="flex items-center gap-2 text-sm text-ink"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-xs text-brand">✓</span> {s}</li>)}
                    </ul>
                  )}
                  <Link to={`/book?package=${p.id}`} className="btn btn-primary mt-5 w-full py-3">{t("Book this package")}</Link>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Layout>
  );
}
