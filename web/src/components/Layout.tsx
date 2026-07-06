import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { SITE } from "../config";
import { useCustomer } from "../context/CustomerAuth";
import { useI18n } from "../context/I18n";

function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="flex items-center gap-1.5 rounded-full border border-border/70 px-3.5 py-2 text-xs font-semibold text-ink/70 transition hover:border-brand hover:text-brand" aria-label="Switch language">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" /></svg>
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
  const linkCls = "whitespace-nowrap text-[15px] font-medium tracking-wide text-ink/70 transition-colors hover:text-brand";
  return (
    <header className={`sticky top-0 z-40 bg-surface/85 backdrop-blur-md transition-shadow duration-300 ${scrolled ? "border-b border-border/60 shadow-[0_12px_34px_-20px_rgba(176,104,127,0.55)]" : "border-b border-transparent"}`}>
      <div className="mx-auto grid h-20 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-5 sm:h-24 sm:px-8">
        {/* Logo */}
        <Link to="/" className="flex shrink-0 items-center ps-1" aria-label={SITE.name}>
          {SITE.logo ? <img src={SITE.logo} alt={SITE.name} className="h-16 w-auto sm:h-20" /> : <span className="font-display text-2xl font-extrabold text-ink">{SITE.name}</span>}
        </Link>

        {/* Centered nav */}
        <nav className="hidden items-center justify-center gap-8 2xl:gap-11 xl:flex">
          {NAV_LINKS.map((l) => <Link key={l.to} to={l.to} className={linkCls}>{t(l.key)}</Link>)}
          <a href="/#about" className={linkCls}>{t("About")}</a>
          <a href="/#contact" className={linkCls}>{t("Contact")}</a>
        </nav>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 sm:gap-4">
          <LangToggle />
          <Link to="/account" className="hidden items-center gap-2.5 rounded-full py-1.5 pe-1 ps-1.5 text-sm font-semibold text-ink transition hover:text-brand sm:flex" aria-label={t("Log in")}>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-sm">{customer ? customer.name.slice(0, 1).toUpperCase() : "👤"}</span>
            <span className="hidden xl:inline">{customer ? customer.name.split(" ")[0] : t("Log in")}</span>
          </Link>
          <Link to="/book" className="btn btn-primary whitespace-nowrap px-7 py-3 text-[15px] transition hover:-translate-y-0.5 hover:shadow-lg">{t("Book Now")}</Link>
          <button onClick={() => setOpen((o) => !o)} className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-ink transition hover:bg-surface-2 xl:hidden" aria-label="Menu">{open ? "✕" : "☰"}</button>
        </div>
      </div>

      {/* Mobile / tablet menu */}
      {open && (
        <div className="border-t border-border bg-surface xl:hidden">
          <nav className="mx-auto max-w-7xl space-y-0.5 px-5 py-3">
            {NAV_LINKS.map((l) => <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-[15px] font-semibold text-ink hover:bg-surface-2">{t(l.key)}</Link>)}
            <a href="/#about" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-[15px] font-semibold text-ink hover:bg-surface-2">{t("About")}</a>
            <a href="/#contact" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-[15px] font-semibold text-ink hover:bg-surface-2">{t("Contact")}</a>
            <Link to="/account" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-[15px] font-semibold text-brand hover:bg-surface-2">{customer ? customer.name.split(" ")[0] : t("Log in")}</Link>
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
