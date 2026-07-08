// All salon-specific branding & content lives here — change these to re-skin the
// site for any salon. (Operating hours for booking live in server/src/config.ts.)
export const SITE = {
  name: "Riwa's Glam",
  logo: "/logo.svg", // header logo — clean traced vector (transparent gold), scales sharp at any size
  tagline: "Makeup · Lashes · Nails · Beauty",
  heroTitle: "Look your best,\nfeel your best.",
  heroSub: "Makeup, lashes, brows, nails, facials & more — by Riwa Imad and her team in Aley, Lebanon. Book your appointment online in under a minute.",
  phone: "+961 78 910 551",
  whatsapp: "96178910551", // digits only, for wa.me
  email: "hello@riwasglam.beauty",
  address: "Aley, Lebanon — facing Sam's Double Bus",
  instagram: "riwasglam",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=33.804211,35.606533",
  aboutTitle: "Where beauty meets artistry",
  about:
    "Riwa's Glam is a makeup, lash & beauty studio in Aley, led by artist Riwa Imad. From flawless makeup, lashes and brows to nails, facials and more, our specialists blend skill, quality products and a warm atmosphere to help you leave glowing. We also share our craft through professional makeup & lash courses at our academy.",
  why: [
    { icon: "✨", title: "Expert artists", text: "Makeup, lashes, brows, nails & facials — each by a dedicated specialist." },
    { icon: "🎓", title: "Beauty academy", text: "We teach too — professional makeup & lash courses with certificates." },
    { icon: "💖", title: "Personalised care", text: "Looks tailored to you, from a natural glow to full glam." },
    { icon: "📅", title: "Easy online booking", text: "Book your specialist in seconds — reschedule anytime." },
  ],
  // Weekly hours shown on the site (keep in sync with the server booking config).
  hours: [
    { day: "Sunday", value: "08:00 – 20:00" },
    { day: "Monday", value: "Closed" },
    { day: "Tuesday", value: "08:00 – 20:00" },
    { day: "Wednesday", value: "08:00 – 20:00" },
    { day: "Thursday", value: "08:00 – 20:00" },
    { day: "Friday", value: "08:00 – 20:00" },
    { day: "Saturday", value: "08:00 – 20:00" },
  ],
  heroImage: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=1000&q=80&auto=format&fit=crop",
  gallery: [
    "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=800&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&q=80&auto=format&fit=crop",
  ],
  // A soft image per category for the service cards (swap for real salon photos).
  categoryImages: {
    Makeup: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=700&q=80&auto=format&fit=crop",
    Lashes: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=700&q=80&auto=format&fit=crop",
    Nails: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=700&q=80&auto=format&fit=crop",
    "Brows & Face": "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=700&q=80&auto=format&fit=crop",
    Skincare: "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=700&q=80&auto=format&fit=crop",
    Aesthetics: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=700&q=80&auto=format&fit=crop",
    Tattoos: "https://images.unsplash.com/photo-1611501275019-9b5cda994e8d?w=700&q=80&auto=format&fit=crop",
  } as Record<string, string>,
  // Which services appear in the homepage "Featured" strip (by exact name; falls back to first 6).
  featured: ["Bridal Makeup", "Volume", "Full Set Fiber / Poly", "Deep Facial", "Brow Lamination", "Full Glam"],
  // Categorised gallery (Instagram-style). Swap for the salon's real photos.
  galleryCats: ["All", "Makeup", "Nails", "Lashes", "Brows", "Facials", "Before & After"],
  galleryItems: [
    { src: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=700&q=80&auto=format&fit=crop", cat: "Makeup" },
    { src: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=700&q=80&auto=format&fit=crop", cat: "Makeup" },
    { src: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=700&q=80&auto=format&fit=crop", cat: "Nails" },
    { src: "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=700&q=80&auto=format&fit=crop", cat: "Nails" },
    { src: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=700&q=80&auto=format&fit=crop", cat: "Lashes" },
    { src: "https://images.unsplash.com/photo-1583001931096-959e9a1a6223?w=700&q=80&auto=format&fit=crop", cat: "Lashes" },
    { src: "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?w=700&q=80&auto=format&fit=crop", cat: "Brows" },
    { src: "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=700&q=80&auto=format&fit=crop", cat: "Facials" },
    { src: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=700&q=80&auto=format&fit=crop", cat: "Facials" },
    { src: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=700&q=80&auto=format&fit=crop", cat: "Before & After" },
    { src: "https://images.unsplash.com/photo-1512257960867-c56cb1b3d9c8?w=700&q=80&auto=format&fit=crop", cat: "Before & After" },
    { src: "https://images.unsplash.com/photo-1560869713-7d0a29430803?w=700&q=80&auto=format&fit=crop", cat: "Makeup" },
  ],
};
