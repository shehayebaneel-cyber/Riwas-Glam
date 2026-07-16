import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Msg = { id: string; author: string; body: string; createdAt: string };

/** Header button opening the shared internal team message board. */
export function MessagesButton({ adminKey }: { adminKey: string }) {
  const H = { "x-admin-key": adminKey };
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const load = () =>
    api
      .get<Msg[]>("/api/admin/messages", H)
      .then(setMsgs)
      .catch(() => {});
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);
  async function post() {
    if (!text.trim()) return;
    await api.post("/api/admin/messages", { body: text.trim() }, H).catch(() => {});
    setText("");
    load();
  }
  async function del(id: string) {
    await api.delete(`/api/admin/messages/${id}`, H).catch(() => {});
    load();
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          load();
        }}
        className="bg-surface-2 flex h-10 w-10 items-center justify-center rounded-full text-lg transition active:scale-90"
        aria-label="Team messages"
      >
        💬
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="border-border bg-surface absolute right-0 z-50 mt-2 flex max-h-[26rem] w-80 flex-col rounded-2xl border shadow-xl">
            <p className="border-border text-muted border-b px-3 py-2 text-xs font-bold uppercase tracking-wide">Team board</p>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {msgs.length === 0 ? (
                <p className="text-muted py-6 text-center text-sm">No messages yet.</p>
              ) : (
                msgs.map((m) => (
                  <div key={m.id} className="bg-surface-2 group rounded-xl p-2 text-sm">
                    <p className="text-ink">{m.body}</p>
                    <p className="text-muted mt-0.5 text-[10px]">
                      {m.author} · {new Date(m.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}{" "}
                      <button onClick={() => del(m.id)} className="ml-1 text-red-400 opacity-0 transition group-hover:opacity-100">
                        ✕
                      </button>
                    </p>
                  </div>
                ))
              )}
            </div>
            <div className="border-border flex gap-1.5 border-t p-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") post();
                }}
                placeholder="Message the team…"
                className="input !py-1.5 text-sm"
              />
              <button onClick={post} className="btn btn-primary px-3 py-1.5 text-sm">
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
