import { useState } from "react";
import { Layout } from "../components/Layout";
import { SITE } from "../config";

export function Gallery() {
  const [cat, setCat] = useState("All");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const items = cat === "All" ? SITE.galleryItems : SITE.galleryItems.filter((i) => i.cat === cat);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-14 text-center">
        <p className="eyebrow">Our work</p>
        <h1 className="mt-3 font-display text-5xl font-extrabold text-ink">Gallery</h1>
        <p className="mx-auto mt-3 max-w-lg text-muted">A glimpse of the looks we create. Follow <a href={`https://instagram.com/${SITE.instagram}`} target="_blank" rel="noreferrer" className="font-semibold text-brand">@{SITE.instagram}</a> for more.</p>
      </div>

      <div className="no-scrollbar mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-2">
        {SITE.galleryCats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`chip whitespace-nowrap ${cat === c ? "chip-active" : ""}`}>{c}</button>
        ))}
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="columns-2 gap-4 sm:columns-3 [&>*]:mb-4">
          {items.map((it, i) => (
            <button key={i} onClick={() => setLightbox(it.src)} className="lift group block w-full overflow-hidden rounded-[1.5rem] border border-border bg-surface">
              <img src={it.src} alt={it.cat} loading="lazy" className="w-full object-cover transition duration-700 group-hover:scale-105" />
            </button>
          ))}
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setLightbox(null)}>
          <button aria-label="Close" className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-xl text-ink">✕</button>
          <img src={lightbox} alt="" className="max-h-[88vh] max-w-full rounded-2xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </Layout>
  );
}
