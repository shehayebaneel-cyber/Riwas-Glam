import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { SITE } from "../config";
import { useCustomer } from "../context/CustomerAuth";
import { useI18n } from "../context/I18n";

function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="hidden items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink/55 transition-all duration-300 hover:border-brand/60 hover:bg-brand-soft/40 hover:text-brand sm:flex" aria-label="Switch language">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" /></svg>
      <span>{lang === "ar" ? "EN" : "عربي"}</span>
    </button>
  );
}

const NAV_LINKS = [
  { to: "/services", key: "Services" },
  { to: "/packages", key: "Packages" },
  { to: "/gallery", key: "Gallery" },
  { to: "/academy", key: "Academy" },
  { to: "/gift-cards", key: "Gift Cards" },
];

// A nav link with an animated underline, a slight lift on hover, and an
// active-page indicator (persistent underline + brand colour).
function NavItem({ to, label, hash = false }: { to: string; label: string; hash?: boolean }) {
  const { pathname } = useLocation();
  const active = !hash && (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const cls = `group relative whitespace-nowrap py-1 text-[15px] font-medium tracking-wide transition-all duration-300 ease-out hover:-translate-y-px ${active ? "text-brand" : "text-ink/70 hover:text-brand"}`;
  const bar = <span className={`pointer-events-none absolute inset-x-0 -bottom-1 h-[1.5px] origin-center rounded-full bg-brand transition-transform duration-300 ease-out ${active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"}`} />;
  return hash ? <a href={to} className={cls}>{label}{bar}</a> : <Link to={to} className={cls}>{label}{bar}</Link>;
}

function Nav() {
  const { customer } = useCustomer();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Lock body scroll while the mobile menu is open; close it on Escape.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [open]);
  const wa = `https://wa.me/${SITE.whatsapp}`;
  const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const menuLinks = [...NAV_LINKS.map((l) => ({ to: l.to, label: t(l.key), hash: false })), { to: "/#about", label: t("About"), hash: true }, { to: "/#contact", label: t("Contact"), hash: true }];
  return (
    <header className={`sticky top-0 z-40 transition-all duration-300 ${scrolled ? "border-b border-border/60 bg-surface/75 shadow-[0_14px_40px_-24px_rgba(176,104,127,0.6)] backdrop-blur-xl" : "border-b border-transparent bg-surface/85 backdrop-blur-md"}`}>
      <div className={`grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 transition-all duration-300 sm:px-10 lg:px-14 ${scrolled ? "h-16 sm:h-20" : "h-[4.5rem] sm:h-24"}`}>
        {/* Logo */}
        <Link to="/" className="col-start-1 flex shrink-0 items-center justify-self-start" aria-label={SITE.name}>
          {SITE.logo
            ? <img src={SITE.logo} alt={SITE.name} className={`w-auto max-w-none drop-shadow-[0_1px_2px_rgba(74,51,48,0.28)] transition-all duration-300 ${scrolled ? "h-10 sm:h-16" : "h-12 sm:h-20"}`} />
            : <span className={`whitespace-nowrap font-display font-extrabold tracking-tight text-ink transition-all duration-300 ${scrolled ? "text-2xl sm:text-[1.7rem]" : "text-[1.65rem] sm:text-[2.1rem]"}`}>Riwa's <span className="italic text-accent">Glam</span></span>}
        </Link>

        {/* Centered nav */}
        <nav className="col-start-2 hidden items-center justify-center gap-9 justify-self-center 2xl:gap-12 xl:flex">
          {NAV_LINKS.map((l) => <NavItem key={l.to} to={l.to} label={t(l.key)} />)}
          <NavItem to="/#about" label={t("About")} hash />
          <NavItem to="/#contact" label={t("Contact")} hash />
        </nav>

        {/* Actions */}
        <div className="col-start-3 flex items-center justify-end gap-2.5 justify-self-end sm:gap-3.5">
          <LangToggle />
          <Link to="/account" className="hidden items-center gap-2.5 rounded-full py-1.5 pe-3 ps-1.5 text-sm font-semibold text-ink/80 transition-all duration-300 hover:bg-surface-2 hover:text-brand sm:flex" aria-label={t("Log in")}>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-sm ring-1 ring-border/60">{customer ? customer.name.slice(0, 1).toUpperCase() : "👤"}</span>
            <span className="hidden xl:inline">{customer ? customer.name.split(" ")[0] : t("Log in")}</span>
          </Link>
          <Link to="/book" className="btn btn-primary hidden whitespace-nowrap rounded-full px-8 py-3 text-[15px] shadow-[0_10px_26px_-10px_rgba(217,124,154,0.65)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_18px_38px_-12px_rgba(217,124,154,0.75)] sm:inline-flex">{t("Book Now")}</Link>
          <a href={`tel:${SITE.phone}`} className="flex h-11 w-11 items-center justify-center rounded-full text-brand transition active:scale-95 hover:bg-surface-2 xl:hidden" aria-label={t("Call")}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
          </a>
          <button onClick={() => setOpen((o) => !o)} className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-ink transition active:scale-95 hover:bg-surface-2 xl:hidden" aria-label="Menu">☰</button>
        </div>
      </div>

      {/* Mobile / tablet menu — full-height slide-in panel */}
      <div className={`fixed inset-0 z-50 xl:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div onClick={() => setOpen(false)} className={`absolute inset-0 bg-ink/40 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} />
        <div className={`absolute right-0 top-0 flex h-full w-[87%] max-w-sm flex-col bg-surface shadow-[0_0_70px_-8px_rgba(74,51,48,0.55)] transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <span className="font-display text-xl font-extrabold tracking-tight text-ink">Riwa's <span className="italic text-accent">Glam</span></span>
            <button onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-xl text-ink transition active:scale-90" aria-label="Close menu">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            <nav className="space-y-1">
              {menuLinks.map((l) => {
                const cls = "flex items-center justify-between rounded-2xl px-4 py-3.5 text-lg font-semibold text-ink transition active:scale-[0.98] active:bg-surface-2";
                const arrow = <span className="text-brand/45">›</span>;
                return l.hash
                  ? <a key={l.to} href={l.to} onClick={() => setOpen(false)} className={cls}>{l.label}{arrow}</a>
                  : <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className={cls}>{l.label}{arrow}</Link>;
              })}
              <Link to="/account" onClick={() => setOpen(false)} className="flex items-center justify-between rounded-2xl px-4 py-3.5 text-lg font-semibold text-brand transition active:scale-[0.98] active:bg-surface-2">{customer ? customer.name.split(" ")[0] : t("Log in")}<span className="text-brand/45">›</span></Link>
            </nav>

            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <a href={`tel:${SITE.phone}`} className="flex items-center justify-center gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm font-semibold text-ink transition active:scale-[0.97]">📞 {t("Call")}</a>
              <a href={wa} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm font-semibold text-ink transition active:scale-[0.97]">💬 WhatsApp</a>
            </div>
            <a href={SITE.mapUrl} target="_blank" rel="noreferrer" className="mt-2.5 flex items-start gap-2.5 rounded-2xl bg-surface-2 px-4 py-3 text-sm font-semibold text-ink transition active:scale-[0.98]"><span>📍</span><span>{SITE.address}</span></a>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">{t("Opening hours")}</p>
              <ul className="mt-2 space-y-0.5 text-[13px]">
                {SITE.hours.map((h) => {
                  const today = h.day === todayName;
                  return (
                    <li key={h.day} className={`flex justify-between rounded-lg px-2 py-1.5 ${today ? "bg-brand-soft/70" : ""}`}>
                      <span className={today ? "font-semibold text-brand" : "text-muted"}>{h.day}{today ? ` · ${t("Today")}` : ""}</span>
                      <span className={h.value === "Closed" ? "text-muted" : today ? "font-semibold text-ink" : "text-ink/80"}>{h.value}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <a href={`https://instagram.com/${SITE.instagram}`} target="_blank" rel="noreferrer" className="mt-6 flex h-12 items-center justify-center gap-2 rounded-2xl border border-border text-sm font-semibold text-ink transition active:scale-[0.98]">📷 @{SITE.instagram}</a>
          </div>

          <div className="border-t border-border bg-surface px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
            <Link to="/book" onClick={() => setOpen(false)} className="btn btn-primary w-full py-4 text-base">{t("Book Appointment")}</Link>
          </div>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const wa = `https://wa.me/${SITE.whatsapp}`;
  const { t } = useI18n();
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10 text-center">
        <p className="font-display text-xl font-extrabold text-ink">{SITE.name}</p>
        <p className="mt-1 text-sm text-muted">{SITE.tagline} · {SITE.address}</p>
        <div className="mt-4 flex justify-center gap-5 text-sm font-semibold text-brand">
          <a href={`tel:${SITE.phone}`}>{t("Call")}</a>
          <a href={wa} target="_blank" rel="noreferrer">{t("WhatsApp")}</a>
          <a href={`https://instagram.com/${SITE.instagram}`} target="_blank" rel="noreferrer">{t("Instagram")}</a>
        </div>
        <p className="mt-5 text-xs text-muted">© {new Date().getFullYear()} {SITE.name}. All rights reserved.</p>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div>
      <Nav />
      {children}
      <Footer />
    </div>
  );
}
