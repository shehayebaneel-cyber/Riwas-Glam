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
  const { t, lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={`sticky top-0 z-40 transition-all duration-300 ${scrolled ? "border-b border-border/60 bg-surface/75 shadow-[0_14px_40px_-24px_rgba(176,104,127,0.6)] backdrop-blur-xl" : "border-b border-transparent bg-surface/85 backdrop-blur-md"}`}>
      <div className={`mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-5 transition-all duration-300 sm:px-8 ${scrolled ? "h-[4.5rem] sm:h-36" : "h-20 sm:h-48"}`}>
        {/* Logo */}
        <Link to="/" className="flex shrink-0 items-center pe-3 ps-1" aria-label={SITE.name}>
          {SITE.logo
            ? <img src={SITE.logo} alt={SITE.name} className={`w-auto max-w-none drop-shadow-[0_1px_2px_rgba(74,51,48,0.28)] transition-all duration-300 ${scrolled ? "h-14 sm:h-32" : "h-[3.75rem] sm:h-[11rem]"}`} />
            : <span className={`whitespace-nowrap font-display font-extrabold tracking-tight text-ink transition-all duration-300 ${scrolled ? "text-2xl sm:text-[1.7rem]" : "text-[1.65rem] sm:text-[2.1rem]"}`}>Riwa's <span className="italic text-accent">Glam</span></span>}
        </Link>

        {/* Centered nav */}
        <nav className="hidden items-center justify-center gap-9 2xl:gap-12 xl:flex">
          {NAV_LINKS.map((l) => <NavItem key={l.to} to={l.to} label={t(l.key)} />)}
          <NavItem to="/#about" label={t("About")} hash />
          <NavItem to="/#contact" label={t("Contact")} hash />
        </nav>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 sm:gap-3.5">
          <LangToggle />
          <Link to="/account" className="hidden items-center gap-2.5 rounded-full py-1.5 pe-3 ps-1.5 text-sm font-semibold text-ink/80 transition-all duration-300 hover:bg-surface-2 hover:text-brand sm:flex" aria-label={t("Log in")}>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-sm ring-1 ring-border/60">{customer ? customer.name.slice(0, 1).toUpperCase() : "👤"}</span>
            <span className="hidden xl:inline">{customer ? customer.name.split(" ")[0] : t("Log in")}</span>
          </Link>
          <Link to="/book" className="btn btn-primary hidden whitespace-nowrap rounded-full px-8 py-3 text-[15px] shadow-[0_10px_26px_-10px_rgba(217,124,154,0.65)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_18px_38px_-12px_rgba(217,124,154,0.75)] sm:inline-flex">{t("Book Now")}</Link>
          <button onClick={() => setOpen((o) => !o)} className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-ink transition hover:bg-surface-2 xl:hidden" aria-label="Menu">{open ? "✕" : "☰"}</button>
        </div>
      </div>

      {/* Mobile / tablet menu */}
      {open && (
        <div className="border-t border-border bg-surface xl:hidden">
          <nav className="mx-auto max-w-7xl space-y-0.5 px-5 py-3">
            {NAV_LINKS.map((l) => <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-[15px] font-semibold text-ink hover:bg-surface-2">{t(l.key)}</Link>)}
            <a href="/#about" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-[15px] font-semibold text-ink hover:bg-surface-2">{t("About")}</a>
            <a href="/#contact" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-[15px] font-semibold text-ink hover:bg-surface-2">{t("Contact")}</a>
            <div className="flex items-center gap-3 pt-2">
              <Link to="/account" onClick={() => setOpen(false)} className="flex-1 rounded-full bg-surface-2 px-4 py-3 text-center text-[15px] font-semibold text-brand">{customer ? customer.name.split(" ")[0] : t("Log in")}</Link>
              <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="rounded-full border border-border/70 px-4 py-3 text-[13px] font-semibold uppercase tracking-wide text-ink/60" aria-label="Switch language">{lang === "ar" ? "EN" : "عربي"}</button>
            </div>
            <Link to="/book" onClick={() => setOpen(false)} className="btn btn-primary mt-1 block rounded-full px-4 py-3.5 text-center text-[15px] font-semibold shadow-[0_10px_26px_-10px_rgba(217,124,154,0.65)]">{t("Book Now")}</Link>
          </nav>
        </div>
      )}
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
