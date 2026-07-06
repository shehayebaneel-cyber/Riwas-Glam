import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { SITE } from "../config";
import { useCustomer } from "../context/CustomerAuth";
import { useI18n } from "../context/I18n";

function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="rounded-full border border-border/80 px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-brand hover:text-brand" aria-label="Switch language">
      {lang === "ar" ? "EN" : "عربي"}
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
  const linkCls = "text-[15px] font-medium text-ink/70 transition hover:text-brand";
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-surface/80 backdrop-blur-md">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center" aria-label={SITE.name}>
          {SITE.logo ? <img src={SITE.logo} alt={SITE.name} className="h-12 w-auto sm:h-14" /> : <span className="font-display text-xl font-extrabold text-ink">{SITE.name}</span>}
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 lg:flex">
          {NAV_LINKS.map((l) => <Link key={l.to} to={l.to} className={linkCls}>{t(l.key)}</Link>)}
          <a href="/#about" className={linkCls}>{t("About")}</a>
          <a href="/#contact" className={linkCls}>{t("Contact")}</a>
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LangToggle />
          <Link to="/account" className="hidden items-center gap-2 text-sm font-semibold text-ink transition hover:text-brand sm:flex" aria-label={t("Log in")}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-sm">{customer ? customer.name.slice(0, 1).toUpperCase() : "👤"}</span>
            <span className="hidden lg:inline">{customer ? customer.name.split(" ")[0] : t("Log in")}</span>
          </Link>
          <Link to="/book" className="btn btn-primary px-5 py-2 text-sm">{t("Book Now")}</Link>
          <button onClick={() => setOpen((o) => !o)} className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink transition hover:bg-surface-2 lg:hidden" aria-label="Menu">{open ? "✕" : "☰"}</button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-surface lg:hidden">
          <nav className="mx-auto max-w-6xl space-y-0.5 px-4 py-2">
            {NAV_LINKS.map((l) => <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-ink hover:bg-surface-2">{t(l.key)}</Link>)}
            <a href="/#about" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-ink hover:bg-surface-2">{t("About")}</a>
            <a href="/#contact" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-ink hover:bg-surface-2">{t("Contact")}</a>
            <Link to="/account" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-brand hover:bg-surface-2">{customer ? customer.name.split(" ")[0] : t("Log in")}</Link>
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
