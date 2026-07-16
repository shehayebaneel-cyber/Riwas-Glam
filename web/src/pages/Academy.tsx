import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Reveal } from "../components/Reveal";
import { SITE } from "../config";
import { api, priceLabel } from "../lib/api";
import { useI18n } from "../context/I18n";
import { useCustomer } from "../context/CustomerAuth";

type Course = { id: number; title: string; image: string; description: string; duration: string; price: number; includes: string[] };

export function Academy() {
  const { t } = useI18n();
  const { customer, authHeader } = useCustomer();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  useEffect(() => {
    api
      .get<Course[]>("/api/courses")
      .then(setCourses)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (customer)
      api
        .get<{ COURSE: number[] }>("/api/customer/me/wishlist", authHeader)
        .then((w) => setSaved(new Set(w.COURSE)))
        .catch(() => {}); /* eslint-disable-next-line */
  }, [customer]);
  function toggleSave(id: number) {
    const on = saved.has(id);
    const n = new Set(saved);
    on ? n.delete(id) : n.add(id);
    setSaved(n);
    (on
      ? api.delete(`/api/customer/me/wishlist/COURSE/${id}`, authHeader)
      : api.post("/api/customer/me/wishlist", { kind: "COURSE", itemId: id }, authHeader)
    ).catch(() => {});
  }
  const wa = (msg: string) => `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(msg)}`;

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-14 text-center">
        <p className="eyebrow">{t("Learn with us")}</p>
        <h1 className="font-display text-ink mt-3 text-5xl font-extrabold">{t("Academy")}</h1>
        <p className="text-muted mx-auto mt-3 max-w-lg">
          Turn your passion into a profession. Hands-on beauty training taught by Riwa and our specialists — small groups, real practice, and a certificate to
          launch your career.
        </p>
      </div>

      <div className="mx-auto max-w-5xl space-y-16 px-4 pb-20">
        {loading && <p className="text-muted text-center">Loading courses…</p>}
        {!loading && courses.length === 0 && <p className="text-muted text-center">Courses coming soon — message us on WhatsApp to be the first to know.</p>}
        {courses.map((c, i) => (
          <Reveal key={c.id}>
            <div className={`grid items-center gap-8 lg:grid-cols-2 ${i % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}>
              <div className="relative">
                <div className="from-brand-soft via-brand-soft/60 to-accent/25 absolute -inset-3 rounded-[2.25rem] bg-gradient-to-br blur-xl" />
                {c.image ? (
                  <img src={c.image} alt={c.title} className="relative h-72 w-full rounded-[2rem] object-cover shadow-xl ring-4 ring-white/70 sm:h-96" />
                ) : (
                  <div className="bg-brand-soft relative flex h-72 w-full items-center justify-center rounded-[2rem] text-6xl shadow-xl ring-4 ring-white/70 sm:h-96">
                    🎓
                  </div>
                )}
                <div className="bg-surface absolute -bottom-4 -left-4 rounded-2xl px-5 py-3 shadow-lg">
                  <p className="font-display text-brand text-xl font-extrabold">{priceLabel(c.price)}</p>
                  <p className="text-muted text-xs">{c.duration}</p>
                </div>
                {customer && (
                  <button
                    onClick={() => toggleSave(c.id)}
                    aria-label="Save to wishlist"
                    className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg shadow transition active:scale-90 ${saved.has(c.id) ? "text-brand" : "text-muted hover:text-brand"}`}
                  >
                    {saved.has(c.id) ? "♥" : "♡"}
                  </button>
                )}
              </div>
              <div>
                <p className="eyebrow">{t("Course")}</p>
                <h2 className="font-display text-ink mt-2 text-3xl font-extrabold">{c.title}</h2>
                <p className="text-muted mt-3 leading-relaxed">{c.description}</p>
                {c.includes.length > 0 && (
                  <ul className="mt-5 space-y-2">
                    {c.includes.map((it) => (
                      <li key={it} className="text-ink flex items-center gap-2">
                        <span className="bg-brand-soft text-brand flex h-5 w-5 items-center justify-center rounded-full text-xs">✓</span> {it}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-7 flex flex-wrap gap-3">
                  <a
                    href={wa(`Hi! I'd like to apply for the ${c.title} course (${c.duration}, ${priceLabel(c.price)}).`)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary px-7 py-3.5"
                  >
                    {t("Apply Now")}
                  </a>
                  <a href={wa(`Hi! I have a question about the ${c.title} course.`)} target="_blank" rel="noreferrer" className="btn btn-ghost px-6 py-3.5">
                    💬 {t("WhatsApp Inquiry")}
                  </a>
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
          <a
            href={wa("Hi! I'd like to know more about your academy courses.")}
            target="_blank"
            rel="noreferrer"
            className="btn text-brand-dark mt-6 bg-white px-8 py-3.5 text-lg font-bold hover:bg-white/90"
          >
            💬 Chat with us
          </a>
        </div>
      </section>
    </Layout>
  );
}
