import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ImageUpload } from "./ImageUpload";

type Course = { id: number; title: string; image: string; description: string; duration: string; price: number; includes: string[]; isActive: boolean };

export function AcademyAdmin({ adminKey }: { adminKey: string }) {
  const hdr = { "x-admin-key": adminKey };
  const [items, setItems] = useState<Course[]>([]);
  const [editing, setEditing] = useState<Course | "new" | null>(null);
  const load = () =>
    api
      .get<Course[]>("/api/admin/courses", hdr)
      .then(setItems)
      .catch(() => {});
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);

  async function del(id: number) {
    if (!confirm("Delete this course?")) return;
    await api.delete(`/api/admin/courses/${id}`, hdr);
    load();
  }
  async function toggle(c: Course) {
    await api.patch(`/api/admin/courses/${c.id}`, { isActive: !c.isActive }, hdr);
    load();
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setEditing("new")} className="btn btn-primary px-5 py-2">
        + Add course
      </button>
      {items.length === 0 && <p className="card text-muted p-8 text-center">No courses yet.</p>}
      {items.map((c) => (
        <div key={c.id} className="card flex flex-wrap items-center gap-3 p-4">
          <div className="bg-surface-2 h-14 w-14 shrink-0 overflow-hidden rounded-xl">
            {c.image ? (
              <img src={c.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl">🎓</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-ink font-bold">
              {c.title} {!c.isActive && <span className="text-muted text-xs font-normal">(hidden)</span>}
            </p>
            <p className="text-muted text-xs">
              {c.duration} · ${c.price} · {c.includes.length} included
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => toggle(c)} className="btn btn-ghost px-3 py-1.5 text-xs">
              {c.isActive ? "Hide" : "Show"}
            </button>
            <button onClick={() => setEditing(c)} className="btn btn-ghost px-3 py-1.5 text-xs">
              Edit
            </button>
            <button onClick={() => del(c.id)} className="btn btn-ghost px-3 py-1.5 text-xs text-red-500">
              Delete
            </button>
          </div>
        </div>
      ))}
      {editing && (
        <CourseForm
          hdr={hdr}
          adminKey={adminKey}
          course={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CourseForm({
  hdr,
  adminKey,
  course,
  onClose,
  onSaved,
}: {
  hdr: Record<string, string>;
  adminKey: string;
  course: Course | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    title: course?.title ?? "",
    duration: course?.duration ?? "",
    price: String(course?.price ?? ""),
    description: course?.description ?? "",
    image: course?.image ?? "",
    includes: (course?.includes ?? []).join("\n"),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  async function save() {
    if (!f.title.trim()) return;
    setBusy(true);
    const body = {
      title: f.title,
      duration: f.duration,
      price: Number(f.price) || 0,
      description: f.description,
      image: f.image,
      includes: f.includes
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      if (course) await api.patch(`/api/admin/courses/${course.id}`, body, hdr);
      else await api.post("/api/admin/courses", body, hdr);
      onSaved();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full max-w-lg rounded-t-[1.5rem] p-5 shadow-2xl sm:rounded-[1.5rem]" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-ink text-lg font-bold">{course ? "Edit course" : "Add course"}</p>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-ink mb-1 block text-xs font-semibold">Course title</span>
            <input value={f.title} onChange={(e) => set("title", e.target.value)} className="input" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-ink mb-1 block text-xs font-semibold">Duration</span>
              <input value={f.duration} onChange={(e) => set("duration", e.target.value)} placeholder="3 days" className="input" />
            </label>
            <label className="block">
              <span className="text-ink mb-1 block text-xs font-semibold">Price $</span>
              <input type="number" value={f.price} onChange={(e) => set("price", e.target.value)} className="input" />
            </label>
          </div>
          <label className="block">
            <span className="text-ink mb-1 block text-xs font-semibold">Description</span>
            <textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="text-ink mb-1 block text-xs font-semibold">What's included</span>
            <span className="text-muted mb-1 block text-xs">One item per line.</span>
            <textarea
              rows={4}
              value={f.includes}
              onChange={(e) => set("includes", e.target.value)}
              placeholder={"Eyebrow Lamination\nEyelash Lamination\nLash Extensions"}
              className="input"
            />
          </label>
          <div>
            <span className="text-ink mb-1 block text-xs font-semibold">Course image</span>
            <ImageUpload value={f.image} onChange={(url) => set("image", url)} adminKey={adminKey} />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={save} disabled={busy} className="btn btn-primary flex-1 py-2.5 disabled:opacity-60">
            {busy ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose} className="btn btn-ghost px-5 py-2.5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
