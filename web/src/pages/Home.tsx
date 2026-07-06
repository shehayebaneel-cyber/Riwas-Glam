import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { ServiceCard } from "../components/ServiceCard";
import { InstagramIcon, PhoneIcon, PinIcon, WhatsAppIcon } from "../components/Icons";
import { SITE } from "../config";
import { api } from "../lib/api";
import { useI18n } from "../context/I18n";
import type { Category, Review, Service, Staff } from "../types";

export function Home() {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<Category[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [reviews, setReviews] = useState<{ avg: number; count: number; items: Review[] } | null>(null);
  const [gallery, setGallery] = useState<string[]>([]);
  useEffect(() => {
    api.get<Category[]>("/api/catalog").then(setCatalog).catch(() => {});
    api.get<Staff[]>("/api/staff").then(setStaff).catch(() => {});
    api.get<{ avg: number; count: number; items: Review[] }>("/api/reviews").then(setReviews).catch(() => {});
    api.get<{ type: string; url: string; beforeUrl: string }[]>("/api/gallery").then((g) => setGallery(g.map((x) => x.type === "BEFOREAFTER" ? x.beforeUrl : x.url).filter(Boolean))).catch(() => {});
  }, []);
  const galleryImgs = gallery.length ? gallery : SITE.galleryItems.map((i) => i.src);
  const wa = `https://wa.me/${SITE.whatsapp}`;
  const navigate = useNavigate();
  const allSvc = catalog.flatMap((c) => c.services.map((s) => ({ s, cat: c.name })));
  const featured = (() => { const p = SITE.featured.map((n) => allSvc.find((x) => x.s.name === n)).filter(Boolean) as { s: Service; cat: string }[]; return (p.length >= 6 ? p : allSvc).slice(0, 6); })();

  return (
    <Layout>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-24 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand-soft blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-11 pt-9 sm:px-4 sm:py-24 lg:grid-cols-2">
          <div>
            <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.26em] text-brand sm:text-sm sm:tracking-[0.28em]"><span className="h-px w-7 bg-accent sm:w-10" /> {SITE.tagline}</p>
            <h1 className="mt-5 font-display text-[2.7rem] font-extrabold leading-[1.04] text-ink sm:mt-6 sm:text-6xl">
              {SITE.heroTitle.split("\n").map((ln, i, arr) => (
                <span key={i}>{i > 0 && <br />}<span className={i === arr.length - 1 ? "italic text-brand" : ""}>{ln}</span></span>
              ))}
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted sm:mt-6 sm:text-lg">{SITE.heroSub}</p>
            <div className="mt-6 flex items-stretch gap-2.5 sm:mt-9 sm:gap-3">
              <Link to="/book" className="btn btn-primary flex-1 px-5 py-4 text-center text-base leading-tight sm:flex-initial sm:px-8 sm:text-lg">{t("Book Appointment")}</Link>
              <a href={wa} target="_blank" rel="noreferrer" className="btn btn-ghost shrink-0 gap-2 px-5 py-4 sm:px-7"><WhatsAppIcon className="h-5 w-5 text-[#25D366]" /> {t("WhatsApp")}</a>
            </div>
            {reviews && reviews.count > 0 && <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted sm:mt-8"><span className="tracking-[0.15em] text-accent">★★★★★</span> <span><span className="font-semibold text-ink">{reviews.avg.toFixed(1)}</span> {t("from")} {reviews.count} {t("happy clients")}</span></p>}
          </div>
          <div className="relative hidden lg:block">
            <div className="absolute -inset-4 rounded-[2.75rem] bg-gradient-to-br from-brand-soft via-brand-soft/60 to-accent/25 blur-xl" />
            <img src={SITE.heroImage} alt="Riwa's Glam" className="relative h-[24rem] w-full rounded-[2.25rem] object-cover shadow-xl ring-4 ring-white/70 sm:h-[32rem]" />
            <div className="absolute -bottom-5 -left-5 rounded-2xl bg-surface px-5 py-3 shadow-lg">
              <p className="font-display text-lg font-bold text-brand">Riwa's Glam</p>
              <p className="text-xs text-muted">{SITE.tagline}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured services — swipeable on mobile, grid on larger screens */}
      <section id="services" className="py-16 sm:py-28">
        <div className="mx-auto max-w-6xl px-5 text-center sm:px-4">
          <p className="eyebrow">{t("Signature")}</p>
          <h2 className="mt-2 font-display text-[1.9rem] font-extrabold text-ink sm:text-4xl">{t("Featured services")}</h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted">{t("A taste of what we do. Explore the full menu for everything from makeup to nails, lashes and more.")}</p>
        </div>
        <div className="no-scrollbar mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-3 sm:mx-auto sm:mt-12 sm:grid sm:max-w-6xl sm:snap-none sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-4 sm:pb-0 lg:grid-cols-3">
          {featured.map(({ s, cat }) => (
            <div key={s.id} className="w-[78%] max-w-[300px] shrink-0 snap-start sm:w-auto sm:max-w-none">
              <ServiceCard service={s} catName={cat} onClick={() => navigate(`/book?service=${s.id}`)} />
            </div>
          ))}
        </div>
        <div className="mx-auto mt-9 max-w-6xl px-5 text-center sm:mt-12 sm:px-4">
          <Link to="/services" className="btn btn-ghost px-8 py-3.5 text-base">{t("View all services →")}</Link>
        </div>
      </section>

      {/* Why choose us */}
      <section className="section !pt-0">
        <div className="text-center">
          <p className="eyebrow">{t("Why Riwa's Glam")}</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">{t("Why choose us")}</h2>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SITE.why.map((w) => (
            <div key={w.title} className="card p-5 text-center">
              <div className="text-3xl">{w.icon}</div>
              <p className="mt-2 font-display font-bold text-ink">{w.title}</p>
              <p className="mt-1 text-sm text-muted">{w.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Gallery */}
      <section id="gallery" className="bg-surface-2">
        <div className="section">
          <div className="text-center">
            <p className="eyebrow">{t("Our work")}</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">{t("Gallery")}</h2>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {galleryImgs.slice(0, 6).map((src, i) => (
              <Link key={i} to="/gallery" className="lift group aspect-square overflow-hidden rounded-2xl bg-surface">
                <img src={src} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
              </Link>
            ))}
          </div>
          <div className="mt-8 text-center"><Link to="/gallery" className="btn btn-ghost px-8 py-3">{t("View full gallery →")}</Link></div>
        </div>
      </section>

      {/* Testimonials */}
      {reviews && reviews.items.length > 0 && (
        <section className="section">
          <div className="text-center">
            <p className="eyebrow">{t("Loved by our clients")}</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">{t("What our clients say")}</h2>
            {reviews.count > 0 && <p className="mt-2 text-muted"><span className="font-bold text-ink">{reviews.avg.toFixed(1)}</span> <span className="text-accent">★</span> from {reviews.count} review{reviews.count === 1 ? "" : "s"}</p>}
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.items.slice(0, 6).map((r) => (
              <div key={r.id} className="card p-6">
                <div className="text-lg tracking-[0.15em] text-accent">{"★".repeat(r.rating)}<span className="text-border">{"★".repeat(5 - r.rating)}</span></div>
                {r.comment && <p className="mt-2 text-sm leading-relaxed text-muted">“{r.comment}”</p>}
                <p className="mt-3 font-semibold text-ink">— {r.authorName}</p>
                {r.reply && (
                  <div className="mt-3 rounded-xl border-l-2 border-brand bg-surface-2 p-3 text-left">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-brand">Reply from {SITE.name}</p>
                    <p className="mt-0.5 text-sm text-ink">{r.reply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* About / Team */}
      <section id="about" className="section">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="eyebrow">{t("About us")}</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">{SITE.aboutTitle}</h2>
            <p className="mt-4 leading-relaxed text-muted">{SITE.about}</p>
            <Link to="/book" className="btn btn-primary mt-6 px-6 py-3">{t("Book your visit")}</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {staff.map((m) => (
              <div key={m.id} className="card p-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft font-display text-2xl font-bold text-brand">{m.name.slice(0, 1)}</div>
                <p className="mt-2 font-semibold text-ink">{m.name}</p>
                <p className="text-xs text-brand">{m.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Instagram */}
      <section className="section !pt-0">
        <div className="text-center">
          <p className="eyebrow">@{SITE.instagram}</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold text-ink sm:text-4xl">{t("Follow the glow")}</h2>
        </div>
        <div className="mt-10 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {SITE.galleryItems.slice(0, 6).map((it, i) => (
            <a key={i} href={`https://instagram.com/${SITE.instagram}`} target="_blank" rel="noreferrer" className="lift group aspect-square overflow-hidden rounded-2xl">
              <img src={it.src} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
            </a>
          ))}
        </div>
        <div className="mt-8 text-center"><a href={`https://instagram.com/${SITE.instagram}`} target="_blank" rel="noreferrer" className="btn btn-ghost gap-2 px-8 py-3"><InstagramIcon className="h-5 w-5" /> Follow @{SITE.instagram}</a></div>
      </section>

      {/* Contact / Hours */}
      <section id="contact" className="bg-surface-2">
        <div className="section grid gap-10 lg:grid-cols-2">
          <div>
            <p className="eyebrow">{t("Visit us")}</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">{t("Hours & Contact")}</h2>
            <div className="mt-6 space-y-3 text-sm">
              <p className="flex items-center gap-3"><PinIcon className="h-[18px] w-[18px] shrink-0 text-brand" /> <a href={SITE.mapUrl} target="_blank" rel="noreferrer" className="font-semibold text-ink hover:text-brand">{SITE.address}</a></p>
              <p className="flex items-center gap-3"><PhoneIcon className="h-[18px] w-[18px] shrink-0 text-brand" /> <a href={`tel:${SITE.phone}`} className="font-semibold text-ink hover:text-brand">{SITE.phone}</a></p>
              <p className="flex items-center gap-3"><WhatsAppIcon className="h-[18px] w-[18px] shrink-0 text-[#25D366]" /> <a href={wa} target="_blank" rel="noreferrer" className="font-semibold text-ink hover:text-brand">{t("WhatsApp us")}</a></p>
              <p className="flex items-center gap-3"><InstagramIcon className="h-[18px] w-[18px] shrink-0" /> <a href={`https://instagram.com/${SITE.instagram}`} target="_blank" rel="noreferrer" className="font-semibold text-ink hover:text-brand">@{SITE.instagram}</a></p>
            </div>
          </div>
          <div className="card p-6">
            <h3 className="font-display text-lg font-bold text-ink">{t("Opening hours")}</h3>
            <ul className="mt-3 divide-y divide-border text-sm">
              {SITE.hours.map((h) => (
                <li key={h.day} className="flex justify-between py-2">
                  <span className="text-muted">{h.day}</span>
                  <span className={`font-semibold ${h.value === "Closed" ? "text-muted" : "text-ink"}`}>{h.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-16">
          <iframe title="Map to Riwa's Glam" src="https://maps.google.com/maps?q=33.804211,35.606533&z=16&output=embed" loading="lazy" className="h-72 w-full rounded-3xl border border-border" />
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand text-white">
        <div className="section text-center">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">{t("Ready to glow?")}</h2>
          <p className="mt-2 text-white/85">{t("Book your appointment online in under a minute.")}</p>
          <Link to="/book" className="btn mt-6 bg-white px-8 py-3.5 text-lg font-bold text-brand-dark hover:bg-white/90">{t("Book Appointment")}</Link>
        </div>
      </section>
    </Layout>
  );
}
