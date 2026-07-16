import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { BeforeAfter } from "../components/BeforeAfter";
import { SITE } from "../config";
import { api } from "../lib/api";
import { useI18n } from "../context/I18n";

type Item = { id: number; type: string; url: string; beforeUrl: string; category: string; caption: string; serviceId: number | null; serviceName: string };

function embedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vim = url.match(/vimeo\.com\/(\d+)/);
  if (vim) return `https://player.vimeo.com/video/${vim[1]}`;
  return null;
}

export function Gallery() {
  const { t } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const [cat, setCat] = useState("All");
  const [lightbox, setLightbox] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<Item[]>("/api/gallery")
      .then(setItems)
      .catch(() => {});
  }, []);

  const cats = useMemo(() => ["All", ...Array.from(new Set(items.map((i) => i.category).filter(Boolean)))], [items]);
  const shown = cat === "All" ? items : items.filter((i) => i.category === cat);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-14 text-center">
        <p className="eyebrow">{t("Our work")}</p>
        <h1 className="font-display text-ink mt-3 text-5xl font-extrabold">{t("Gallery")}</h1>
        <p className="text-muted mx-auto mt-3 max-w-lg">
          A glimpse of the looks we create. Follow{" "}
          <a href={`https://instagram.com/${SITE.instagram}`} target="_blank" rel="noreferrer" className="text-brand font-semibold">
            @{SITE.instagram}
          </a>{" "}
          for more.
        </p>
      </div>

      {cats.length > 1 && (
        <div className="no-scrollbar mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-2">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`chip whitespace-nowrap ${cat === c ? "chip-active" : ""}`}>
              {c === "All" ? t("All") : c}
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 py-8">
        {items.length === 0 && <p className="text-muted text-center">Our gallery is coming soon 💖</p>}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((it) => {
            const embed = it.type === "VIDEO" ? embedUrl(it.url) : null;
            return (
              <div key={it.id} className="lift border-border bg-surface overflow-hidden rounded-[1.5rem] border">
                {it.type === "BEFOREAFTER" ? (
                  <BeforeAfter before={it.beforeUrl} after={it.url} />
                ) : it.type === "VIDEO" ? (
                  embed ? (
                    <div className="aspect-video">
                      <iframe src={embed} title={it.caption} allowFullScreen className="h-full w-full" />
                    </div>
                  ) : (
                    <video src={it.url} controls className="aspect-video w-full bg-black object-cover" />
                  )
                ) : (
                  <button onClick={() => setLightbox(it.url)} className="group block aspect-square w-full overflow-hidden">
                    <img src={it.url} alt={it.caption} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  </button>
                )}
                {(it.caption || it.serviceId) && (
                  <div className="flex items-center gap-2 p-3">
                    <p className="text-muted min-w-0 flex-1 truncate text-sm">{it.caption}</p>
                    {it.serviceId && (
                      <Link to={`/book?service=${it.serviceId}`} className="btn btn-primary shrink-0 px-3 py-1.5 text-xs">
                        {t("Book this look")}
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setLightbox(null)}>
          <button aria-label="Close" className="text-ink absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-xl">
            ✕
          </button>
          <img src={lightbox} alt="" className="max-h-[88vh] max-w-full rounded-2xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </Layout>
  );
}
