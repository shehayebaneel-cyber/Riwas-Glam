import { Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { Book } from "./pages/Book";
import { Admin } from "./pages/Admin";
import { StaffPortal } from "./pages/StaffPortal";
import { Account } from "./pages/Account";
import { GiftCards } from "./pages/GiftCards";
import { Services } from "./pages/Services";
import { Gallery } from "./pages/Gallery";
import { SITE } from "./config";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/book" element={<Book />} />
        <Route path="/gift-cards" element={<GiftCards />} />
        <Route path="/account" element={<Account />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/staff" element={<StaffPortal />} />
      </Routes>
      <a href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp" title="Chat on WhatsApp" className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-2xl text-white shadow-lg transition hover:scale-105">💬</a>
    </>
  );
}
