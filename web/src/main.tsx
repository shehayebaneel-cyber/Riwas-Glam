import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { CustomerProvider } from "./context/CustomerAuth.tsx";
import { I18nProvider } from "./context/I18n.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <CustomerProvider>
          <App />
        </CustomerProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Register the PWA service worker (installable + offline shell).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
