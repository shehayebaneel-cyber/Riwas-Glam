import { api } from "./api";

/** Fire-and-forget anonymous analytics beacon (no PII, never blocks the UI). */
export function track(type: string, label = "", source = "") {
  api.post("/api/track", { type, label, source }).catch(() => {});
}
