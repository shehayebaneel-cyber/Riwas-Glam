import { SITE } from "../config";
import { durationLabel, priceLabel } from "../lib/api";
import type { Service } from "../types";

/** Elegant image service card used on the homepage + Services page. */
export function ServiceCard({ service, catName, onClick }: { service: Service; catName: string; onClick: () => void }) {
  const img = SITE.categoryImages[catName] ?? SITE.heroImage;
  return (
    <button onClick={onClick} className="lift group block w-full overflow-hidden rounded-[1.75rem] border border-border bg-surface text-left transition active:scale-[0.98]" style={{ boxShadow: "0 18px 46px -24px rgba(176,104,127,0.32)" }}>
      <div className="aspect-[4/3] overflow-hidden">
        <img src={img} alt={service.name} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h4 className="font-display text-lg font-bold text-ink">{service.name}</h4>
          <span className="shrink-0 text-right">
            <span className="block text-[10px] uppercase tracking-wide text-muted">from</span>
            <span className="font-display text-lg font-bold text-brand">{priceLabel(service.price)}</span>
          </span>
        </div>
        {service.description && <p className="mt-1 line-clamp-1 text-sm text-muted">{service.description}</p>}
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3.5">
          <span className="text-xs uppercase tracking-wide text-muted">{durationLabel(service.durationMin)}</span>
          <span className="text-sm font-semibold text-brand transition group-hover:translate-x-0.5">View →</span>
        </div>
      </div>
    </button>
  );
}
