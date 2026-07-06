import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, useSearchParams } from "react-router-dom";
import { api } from "./lib/api";
import { Home } from "./pages/Home";
import { Book } from "./pages/Book";
import { BookPackage } from "./pages/BookPackage";
import { Packages } from "./pages/Packages";
import { Services } from "./pages/Services";
import { Gallery } from "./pages/Gallery";
import { Academy } from "./pages/Academy";
import { Payment } from "./pages/Payment";
import { Receipt } from "./pages/Receipt";
import { WhatsAppIcon } from "./components/Icons";
import { SITE } from "./config";

// Lazy-loaded so the customer site doesn't ship the (large) admin + account code.
const Admin = lazy(() => import("./pages/Admin").then((m) => ({ default: m.Admin })));
const StaffPortal = lazy(() => import("./pages/StaffPortal").then((m) => ({ default: m.StaffPortal })));
const Account = lazy(() => import("./pages/Account").then((m) => ({ default: m.Account })));
const GiftCards = lazy(() => import("./pages/GiftCards").then((m) => ({ default: m.GiftCards })));

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
      <a href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp" title="Chat on WhatsApp" className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105 active:scale-95"><WhatsAppIcon className="h-7 w-7" /></a>
    </>
  );
}
