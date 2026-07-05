import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Reveal } from "../components/Reveal";
import { ServiceCard } from "../components/ServiceCard";
import { SITE } from "../config";
import { api, durationLabel, priceLabel } from "../lib/api";
import type { Category, Service } from "../types";

export function Services() {
  const [catalog, setCatalog] = useState<Category[]>([]);
  const [active, setActive] = useState("All");
  const [modal, setModal] = useState<{ service: Service; catName: string } | null>(null);
  useEffect(() => { api.get<Category[]>("/api/catalog").then(setCatalog).catch(() => {}); }, []);

  const chips = ["All", ...catalog.map((c) => `${c.emoji} ${c.name}`)];
  const shown = active === "All" ? catalog : catalog.filter((c) => `${c.emoji} ${c.name}` === active);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-14 text-center">
        <p className="eyebrow">Our menu</p>
        <h1 className="mt-3 font-display text-5xl font-extrabold text-ink">Services</h1>
        <p className="mx-auto mt-3 max-w-lg text-muted">Explore our full menu of beauty services. Tap any service for details, then book your specialist in seconds.</p>
      </div>

      {/* Category filters */}
      <div className="sticky top-[68px] z-30 glass border-y border-border/60">
        <div className="no-scrollbar mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-3">
          {chips.map((c) => (
            <button key={c} onClick={() => setActive(c)} className={`chip whitespace-nowrap ${active === c ? "chip-active" : ""}`}>{c}</button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-12">
        {shown.map((cat) => (
          <div key={cat.id}>
            <h2 className="font-display text-2xl font-bold text-brand-dark">{cat.emoji} {cat.name}</h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {cat.services.map((s, i) => (
                <Reveal key={s.id} delay={(i % 3) * 70}>
                  <ServiceCard service={s} catName={cat.name} onClick={() => setModal({ service: s, catName: cat.name })} />
                </Reveal>
              ))}
            </div>
          </div>
        ))}
        {!catalog.length && <p className="text-center text-muted">Loading…</p>}
      </div>

      {modal && <ServiceModal service={modal.service} catName={modal.catName} onClose={() => setModal(null)} />}
    </Layout>
  );
}

function ServiceModal({ service, catName, onClose }: { service: Service; catName: string; onClose: () => void }) {
  const img = SITE.categoryImages[catName] ?? SITE.heroImage;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-t-[1.75rem] bg-surface shadow-2xl sm:rounded-[1.75rem]" onClick={(e) => e.stopPropagation()}>
        <div className="relative aspect-[16/9]">
          <img src={img} alt={service.name} className="h-full w-full object-cover" />
          <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg text-ink shadow">✕</button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-6">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-2xl font-bold text-ink">{service.name}</h3>
            <span className="shrink-0 text-right"><span className="block text-[10px] uppercase tracking-wide text-muted">from</span><span className="font-display text-xl font-bold text-brand">{priceLabel(service.price)}</span></span>
          </div>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted">{catName} · {durationLabel(service.durationMin)}</p>
          {service.description && <p className="mt-3 text-sm leading-relaxed text-muted">{service.description}</p>}

          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-muted">Before & after</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {["Before", "After"].map((l) => (
              <div key={l} className="relative aspect-square overflow-hidden rounded-2xl">
                <img src={img} alt={l} className="h-full w-full object-cover" />
                <span className="absolute bottom-2 left-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-bold text-ink">{l}</span>
              </div>
            ))}
          </div>

          {!!service.staff?.length && (
            <>
              <p className="mt-5 text-xs font-bold uppercase tracking-wide text-muted">Available specialists</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{service.staff.map((st) => <span key={st.id} className="chip !py-1 !text-xs">{st.name}</span>)}</div>
            </>
          )}

          <Link to={`/book?service=${service.id}`} className="btn btn-primary mt-6 w-full py-3.5 text-lg">Book Now</Link>
        </div>
      </div>
    </div>
  );
}
