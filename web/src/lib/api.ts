// In dev, VITE_API_URL is empty and Vite proxies /api → :4200.
// In production (and in the future mobile app), set VITE_API_URL to the hosted API.
const BASE = import.meta.env.VITE_API_URL ?? "";

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    let message = "Something went wrong. Please try again.";
    try { message = (await res.json()).error ?? message; } catch { /* ignore */ }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string, headers?: Record<string, string>) => req<T>(path, { headers }),
  post: <T>(path: string, body: unknown, headers?: Record<string, string>) => req<T>(path, { method: "POST", body: JSON.stringify(body), headers }),
  patch: <T>(path: string, body: unknown, headers?: Record<string, string>) => req<T>(path, { method: "PATCH", body: JSON.stringify(body), headers }),
  delete: <T>(path: string, headers?: Record<string, string>) => req<T>(path, { method: "DELETE", headers }),
};

export const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
// Prices of 0 aren't set yet — show a friendly label to customers.
export const priceLabel = (n: number) => (n > 0 ? money(n) : "On request");
export const durationLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
