import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SITE } from "../config";
import { useCustomer } from "../context/CustomerAuth";

function Nav() {
  const { customer } = useCustomer();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center px-4 py-3">
        <Link to="/" className="flex items-center">
          {SITE.logo ? <img src={SITE.logo} alt={SITE.name} className="h-10 w-auto sm:h-12" /> : <span className="font-display text-xl font-extrabold text-ink">{SITE.name}</span>}
        </Link>
        <nav className="ml-auto hidden items-center gap-7 text-sm font-semibold text-muted md:flex">
          <Link to="/services" className="hover:text-ink">Services</Link>
          <Link to="/gallery" className="hover:text-ink">Gallery</Link>
          <a href="/#about" className="hover:text-ink">About</a>
          <Link to="/gift-cards" className="hover:text-ink">Gift Cards</Link>
          <a href="/#contact" className="hover:text-ink">Contact</a>
        </nav>
        <Link to="/account" className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-brand md:ml-7">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2">{customer ? customer.name.slice(0, 1).toUpperCase() : "👤"}</span>
          <span className="hidden sm:inline">{customer ? customer.name.split(" ")[0] : "Log in"}</span>
        </Link>
        <Link to="/book" className="btn btn-primary ml-3 px-5 py-2 text-sm">Book Now</Link>
      </div>
    </header>
  );
}

function Footer() {
  const wa = `https://wa.me/${SITE.whatsapp}`;
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10 text-center">
        <p className="font-display text-xl font-extrabold text-ink">{SITE.name}</p>
        <p className="mt-1 text-sm text-muted">{SITE.tagline} · {SITE.address}</p>
        <div className="mt-4 flex justify-center gap-5 text-sm font-semibold text-brand">
          <a href={`tel:${SITE.phone}`}>Call</a>
          <a href={wa} target="_blank" rel="noreferrer">WhatsApp</a>
          <a href={`https://instagram.com/${SITE.instagram}`} target="_blank" rel="noreferrer">Instagram</a>
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
