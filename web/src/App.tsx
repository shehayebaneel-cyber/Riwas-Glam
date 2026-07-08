import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, useSearchParams, useLocation } from "react-router-dom";
import { api } from "./lib/api";
import { track } from "./lib/track";
import { Home } from "./pages/Home";
import { Book } from "./pages/Book";
import { BookPackage } from "./pages/BookPackage";
import { Services } from "./pages/Services";
import { SITE } from "./config";

// Core funnel (Home/Services/Book) ships eagerly; everything else is code-split
// so the first paint stays light (esp. the admin, account, and qrcode-heavy pages).
const Admin = lazy(() => import("./pages/Admin").then((m) => ({ default: m.Admin })));
const StaffPortal = lazy(() => import("./pages/StaffPortal").then((m) => ({ default: m.StaffPortal })));
const Account = lazy(() => import("./pages/Account").then((m) => ({ default: m.Account })));
const GiftCards = lazy(() => import("./pages/GiftCards").then((m) => ({ default: m.GiftCards })));
const Packages = lazy(() => import("./pages/Packages").then((m) => ({ default: m.Packages })));
const Gallery = lazy(() => import("./pages/Gallery").then((m) => ({ default: m.Gallery })));
const Academy = lazy(() => import("./pages/Academy").then((m) => ({ default: m.Academy })));
const Payment = lazy(() => import("./pages/Payment").then((m) => ({ default: m.Payment })));
const Receipt = lazy(() => import("./pages/Receipt").then((m) => ({ default: m.Receipt })));

// Anonymous page-view tracking on every route change (skips admin/staff areas).
function Tracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith("/admin") || pathname.startsWith("/staff")) return;
    let src = "";
    try { const r = document.referrer; if (r && !r.includes(window.location.host)) src = new URL(r).hostname; } catch { /* ignore */ }
    track("PAGE_VIEW", pathname, src);
  }, [pathname]);
  return null;
}

// /book delegates to the package flow when ?package= is present, else the service flow.
function BookRoute() {
  const [params] = useSearchParams();
  const pkg = params.get("package");
  return pkg ? <BookPackage packageId={Number(pkg)} /> : <Book />;
}

export default function App() {
  // Hydrate the site's editable content (text + photos) from the backend, then
  // re-render so every page shows the manager's latest edits. Falls back to the
  // built-in defaults in config.ts if the request fails or is still loading.
  const [, bump] = useState(0);
  const [status, setStatus] = useState<{ closed: boolean; message: string } | null>(null);
  useEffect(() => {
    api.get<Partial<typeof SITE>>("/api/site-content")
      .then((c) => { Object.assign(SITE, c); bump((v) => v + 1); })
      .catch(() => {});
    api.get<{ closed: boolean; message: string }>("/api/status").then(setStatus).catch(() => {});
  }, []);

  return (
    <>
      <Tracker />
      {status?.closed && <div className="bg-brand-dark px-4 py-2 text-center text-sm font-semibold text-white">{status.message || "We're temporarily closed for online bookings — please contact us. 💗"}</div>}
      <Suspense fallback={<div className="p-16 text-center text-muted">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/academy" element={<Academy />} />
          <Route path="/packages" element={<Packages />} />
          <Route path="/book" element={<BookRoute />} />
          <Route path="/gift-cards" element={<GiftCards />} />
          <Route path="/payment/:reference" element={<Payment />} />
          <Route path="/receipt/:reference" element={<Receipt />} />
          <Route path="/account" element={<Account />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/staff" element={<StaffPortal />} />
        </Routes>
      </Suspense>
    </>
  );
}
