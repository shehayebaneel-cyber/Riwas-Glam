import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ImageUpload } from "./ImageUpload";
import type { Category } from "../types";

type Content = {
  name: string;
  logo: string;
  tagline: string;
  heroTitle: string;
  heroSub: string;
  heroImage: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  instagram: string;
  mapUrl: string;
  aboutTitle: string;
  about: string;
  why: { icon: string; title: string; text: string }[];
  hours: { day: string; value: string }[];
  categoryImages: Record<string, string>;
  featured: string[];
  galleryCats: string[];
  galleryItems: { src: string; cat: string }[];
};

export function SiteContentAdmin({ adminKey }: { adminKey: string }) {
  const [c, setC] = useState<Content | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .get<Content>("/api/site-content")
      .then(setC)
      .catch(() => setErr("Couldn't load content."));
    api
      .get<Category[]>("/api/catalog")
      .then((cats) => setServices(cats.flatMap((x) => x.services.map((s) => s.name))))
      .catch(() => {});
  }, []);

  if (err && !c) return <p className="card p-6 text-center text-red-600">{err}</p>;
  if (!c) return <p className="card text-muted p-6 text-center">Loading…</p>;

  const set = (patch: Partial<Content>) => {
    setC({ ...c, ...patch });
    setSaved(false);
  };
  const galleryCats = c.galleryCats.filter((x) => x !== "All");

  async function save() {
    setSaving(true);
    setErr("");
    try {
      await api.patch("/api/admin/site-content", c, { "x-admin-key": adminKey });
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const SaveBar = (
    <div className="bg-surface ring-border sticky top-2 z-10 flex items-center gap-3 rounded-2xl p-3 shadow-lg ring-1">
      <button onClick={save} disabled={saving} className="btn btn-primary px-6 py-2.5 disabled:opacity-60">
        {saving ? "Saving…" : "Save changes"}
      </button>
      {saved && <span className="text-sm font-semibold text-emerald-600">✓ Saved — live on the site</span>}
      {err && <span className="text-sm font-medium text-red-600">{err}</span>}
      <span className="text-muted ml-auto text-xs">Changes appear on the site after saving.</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {SaveBar}

      <Section title="Brand & Hero" desc="The top of your homepage — the first thing visitors see.">
        <Field label="Salon name">
          <input className="input" value={c.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Logo (shown in the header)" hint="A logo with a transparent background (PNG) looks crispest. Leave empty to show the salon name as text.">
          <ImageUpload value={c.logo} onChange={(url) => set({ logo: url })} adminKey={adminKey} />
        </Field>
        <Field label="Tagline (small text under the name)">
          <input className="input" value={c.tagline} onChange={(e) => set({ tagline: e.target.value })} />
        </Field>
        <Field label="Hero headline" hint="Put the part you want in pink/italic on a new line.">
          <textarea rows={2} className="input" value={c.heroTitle} onChange={(e) => set({ heroTitle: e.target.value })} />
        </Field>
        <Field label="Hero subtitle">
          <textarea rows={2} className="input" value={c.heroSub} onChange={(e) => set({ heroSub: e.target.value })} />
        </Field>
        <Field label="Hero photo">
          <ImageUpload value={c.heroImage} onChange={(url) => set({ heroImage: url })} adminKey={adminKey} />
        </Field>
      </Section>

      <Section title="About Us">
        <Field label="Title">
          <input className="input" value={c.aboutTitle} onChange={(e) => set({ aboutTitle: e.target.value })} />
        </Field>
        <Field label="Paragraph">
          <textarea rows={4} className="input" value={c.about} onChange={(e) => set({ about: e.target.value })} />
        </Field>
      </Section>

      <Section title="Why Choose Us" desc="The four little cards.">
        <div className="grid gap-3 sm:grid-cols-2">
          {c.why.map((w, i) => (
            <div key={i} className="card space-y-2 p-3">
              <div className="flex gap-2">
                <input
                  className="input !w-16 text-center"
                  value={w.icon}
                  onChange={(e) => set({ why: c.why.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)) })}
                  placeholder="✨"
                />
                <input
                  className="input flex-1"
                  value={w.title}
                  onChange={(e) => set({ why: c.why.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                  placeholder="Title"
                />
              </div>
              <textarea
                rows={2}
                className="input"
                value={w.text}
                onChange={(e) => set({ why: c.why.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                placeholder="Short description"
              />
              <button onClick={() => set({ why: c.why.filter((_, j) => j !== i) })} className="text-xs font-semibold text-red-500">
                Remove
              </button>
            </div>
          ))}
        </div>
        {c.why.length < 8 && (
          <button onClick={() => set({ why: [...c.why, { icon: "✨", title: "", text: "" }] })} className="btn btn-ghost px-4 py-2 text-sm">
            + Add card
          </button>
        )}
      </Section>

      <Section title="Contact & Social">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone">
            <input className="input" value={c.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="WhatsApp number" hint="Digits only, with country code (e.g. 96178910551).">
            <input className="input" value={c.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} />
          </Field>
          <Field label="Instagram handle" hint="Without the @.">
            <input className="input" value={c.instagram} onChange={(e) => set({ instagram: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className="input" value={c.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Address">
            <input className="input" value={c.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <Field label="Google Maps link">
            <input className="input" value={c.mapUrl} onChange={(e) => set({ mapUrl: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section title="Opening Hours" desc="Shown on the site. (Booking availability is set per-staff in the Team tab.)">
        <div className="space-y-2">
          {c.hours.map((h, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-ink w-28 text-sm font-semibold">{h.day}</span>
              <input
                className="input flex-1"
                value={h.value}
                onChange={(e) => set({ hours: c.hours.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                placeholder="10:00 – 19:00 or Closed"
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Category Photos" desc="The photo shown for each category on the Services page and booking.">
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.keys(c.categoryImages).map((cat) => (
            <div key={cat} className="card p-3">
              <p className="text-ink mb-2 text-sm font-semibold">{cat}</p>
              <ImageUpload value={c.categoryImages[cat]} onChange={(url) => set({ categoryImages: { ...c.categoryImages, [cat]: url } })} adminKey={adminKey} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Gallery Photos" desc="Your work, shown on the Gallery page.">
        <div className="border-border mb-3 rounded-2xl border border-dashed p-3">
          <p className="text-ink mb-2 text-sm font-semibold">Add a photo</p>
          <ImageUpload
            value=""
            onChange={(url) => url && set({ galleryItems: [...c.galleryItems, { src: url, cat: galleryCats[0] ?? "Makeup" }] })}
            adminKey={adminKey}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {c.galleryItems.map((g, i) => (
            <div key={i} className="card overflow-hidden p-0">
              <img src={g.src} alt="" className="aspect-square w-full object-cover" />
              <div className="space-y-1 p-2">
                <select
                  className="input !py-1 text-xs"
                  value={g.cat}
                  onChange={(e) => set({ galleryItems: c.galleryItems.map((x, j) => (j === i ? { ...x, cat: e.target.value } : x)) })}
                >
                  {galleryCats.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <button onClick={() => set({ galleryItems: c.galleryItems.filter((_, j) => j !== i) })} className="w-full text-xs font-semibold text-red-500">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Featured Services" desc="Pick which services show in the homepage highlight strip (first 6 are used).">
        <div className="flex flex-wrap gap-2">
          {services.map((name) => {
            const on = c.featured.includes(name);
            return (
              <button
                key={name}
                onClick={() => set({ featured: on ? c.featured.filter((n) => n !== name) : [...c.featured, name] })}
                className={`chip ${on ? "chip-active" : ""}`}
              >
                {on ? "✓ " : ""}
                {name}
              </button>
            );
          })}
          {services.length === 0 && <p className="text-muted text-sm">No services yet — add them in the Services tab.</p>}
        </div>
      </Section>

      {SaveBar}
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="font-display text-brand-dark text-lg font-bold">{title}</h3>
      {desc && <p className="text-muted mb-3 mt-0.5 text-sm">{desc}</p>}
      <div className={desc ? "space-y-3" : "mt-3 space-y-3"}>{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-ink mb-1 block text-sm font-semibold">{label}</span>
      {hint && <span className="text-muted mb-1 block text-xs">{hint}</span>}
      {children}
    </label>
  );
}
