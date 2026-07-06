import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Reveal } from "../components/Reveal";
import { SITE } from "../config";
import { api, priceLabel } from "../lib/api";
import { useI18n } from "../context/I18n";

type Course = { id: number; title: string; image: string; description: string; duration: string; price: number; includes: string[] };

export function Academy() {
  const { t } = useI18n();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get<Course[]>("/api/courses").then(setCourses).catch(() => {}).finally(() => setLoading(false)); }, []);
  const wa = (msg: string) => `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(msg)}`;

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-14 text-center">
        <p className="eyebrow">{t("Learn with us")}</p>
        <h1 className="mt-3 font-display text-5xl font-extrabold text-ink">{t("Academy")}</h1>
        <p className="mx-auto mt-3 max-w-lg text-muted">Turn your passion into a profession. Hands-on beauty training taught by Riwa and our specialists — small groups, real practice, and a certificate to launch your career.</p>
      </div>

      <div className="mx-auto max-w-5xl space-y-16 px-4 pb-20">
        {loading && <p className="text-center text-muted">Loading courses…</p>}
        {!loading && courses.length === 0 && <p className="text-center text-muted">Courses coming soon — message us on WhatsApp to be the first to know.</p>}
        {courses.map((c, i) => (
          <Reveal key={c.id}>
            <div className={`grid items-center gap-8 lg:grid-cols-2 ${i % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}>
              <div className="relative">
                <div className="absolute -inset-3 rounded-[2.25rem] bg-gradient-to-br from-brand-soft via-brand-soft/60 to-accent/25 blur-xl" />
                {c.image
                  ? <img src={c.image} alt={c.title} className="relative h-72 w-full rounded-[2rem] object-cover shadow-xl ring-4 ring-white/70 sm:h-96" />
                  : <div className="relative flex h-72 w-full items-center justify-center rounded-[2rem] bg-brand-soft text-6xl shadow-xl ring-4 ring-white/70 sm:h-96">🎓</div>}
                <div className="absolute -bottom-4 -left-4 rounded-2xl bg-surface px-5 py-3 shadow-lg">
                  <p className="font-display text-xl font-extrabold text-brand">{priceLabel(c.price)}</p>
                  <p className="text-xs text-muted">{c.duration}</p>
                </div>
              </div>
              <div>
                <p className="eyebrow">{t("Course")}</p>
                <h2 className="mt-2 font-display text-3xl font-extrabold text-ink">{c.title}</h2>
                <p className="mt-3 leading-relaxed text-muted">{c.description}</p>
                {c.includes.length > 0 && (
                  <ul className="mt-5 space-y-2">
                    {c.includes.map((it) => <li key={it} className="flex items-center gap-2 text-ink"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-xs text-brand">✓</span> {it}</li>)}
                  </ul>
                )}
                <div className="mt-7 flex flex-wrap gap-3">
                  <a href={wa(`Hi! I'd like to apply for the ${c.title} course (${c.duration}, ${priceLabel(c.price)}).`)} target="_blank" rel="noreferrer" className="btn btn-primary px-7 py-3.5">{t("Apply Now")}</a>
                  <a href={wa(`Hi! I have a question about the ${c.title} course.`)} target="_blank" rel="noreferrer" className="btn btn-ghost px-6 py-3.5">💬 {t("WhatsApp Inquiry")}</a>
                </div>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <section className="bg-brand text-white">
        <div className="section text-center">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">Ready to start your journey?</h2>
          <p className="mt-2 text-white/85">Message us on WhatsApp and we'll help you pick the right course.</p>
          <a href={wa("Hi! I'd like to know more about your academy courses.")} target="_blank" rel="noreferrer" className="btn mt-6 bg-white px-8 py-3.5 text-lg font-bold text-brand-dark hover:bg-white/90">💬 Chat with us</a>
        </div>
      </section>
    </Layout>
  );
}
