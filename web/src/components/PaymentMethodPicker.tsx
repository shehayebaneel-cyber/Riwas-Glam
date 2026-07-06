export type PayMethod = "CASH" | "WHISH";

/** Small Whish wordmark badge so the option reads as the real brand. */
function WhishBadge() {
  return <span className="inline-flex items-center rounded-md bg-[#e11d48] px-2 py-0.5 text-sm font-extrabold lowercase tracking-tight text-white">whish</span>;
}

const OPTIONS: { key: PayMethod; title: string; desc: string; icon: React.ReactNode }[] = [
  { key: "CASH", title: "Cash", desc: "Pay at the salon", icon: <span className="text-2xl leading-none">💵</span> },
  { key: "WHISH", title: "Whish", desc: "Pay online with Whish", icon: <WhishBadge /> },
];

/** Cash / Whish selector used at every checkout (booking, gift cards, …). */
export function PaymentMethodPicker({ value, onChange }: { value: PayMethod; onChange: (m: PayMethod) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink">Payment method</p>
      <div className="grid grid-cols-2 gap-3">
        {OPTIONS.map((o) => {
          const active = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              aria-pressed={active}
              className={`flex flex-col gap-1 rounded-2xl border p-4 text-left transition active:scale-[0.98] ${active ? "border-brand bg-brand-soft/40 ring-1 ring-brand" : "border-border bg-surface hover:border-brand"}`}
            >
              <span className="flex h-8 items-center">{o.icon}</span>
              <span className="mt-1 font-semibold text-ink">{o.title}</span>
              <span className="text-xs text-muted">{o.desc}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        {value === "CASH"
          ? "Your spot is reserved now — pay in cash when you arrive."
          : "You'll be taken to Whish to pay securely. Your order is confirmed once payment succeeds."}
      </p>
    </div>
  );
}
