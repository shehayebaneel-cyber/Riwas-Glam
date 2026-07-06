import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AR } from "../i18n/ar";

type Lang = "en" | "ar";
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (s: string) => string; dir: "ltr" | "rtl" };
const I18nCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (s) => s, dir: "ltr" });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem("lang") as Lang) === "ar" ? "ar" : "en");
  const dir = lang === "ar" ? "rtl" : "ltr";
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = dir; }, [lang, dir]);
  const setLang = (l: Lang) => { localStorage.setItem("lang", l); setLangState(l); };
  const t = (s: string) => (lang === "ar" ? (AR[s] ?? s) : s);
  return <I18nCtx.Provider value={{ lang, setLang, t, dir }}>{children}</I18nCtx.Provider>;
}
export const useI18n = () => useContext(I18nCtx);
