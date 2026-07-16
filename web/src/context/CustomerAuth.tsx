import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { Customer } from "../types";

const TKEY = "customer-token";

interface Ctx {
  customer: Customer | null;
  token: string;
  loading: boolean;
  authHeader: Record<string, string>;
  setSession: (token: string, customer: Customer) => void;
  setCustomer: (c: Customer) => void;
  logout: () => void;
}
const CustomerCtx = createContext<Ctx>(null!);
export const useCustomer = () => useContext(CustomerCtx);

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem(TKEY) ?? "");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setCustomer(null);
      setLoading(false);
      return;
    }
    api
      .get<Customer>("/api/customer/me", { "x-customer-token": token })
      .then(setCustomer)
      .catch(() => {
        localStorage.removeItem(TKEY);
        setToken("");
        setCustomer(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const setSession = (t: string, c: Customer) => {
    localStorage.setItem(TKEY, t);
    setToken(t);
    setCustomer(c);
  };
  const logout = () => {
    localStorage.removeItem(TKEY);
    setToken("");
    setCustomer(null);
  };

  return (
    <CustomerCtx.Provider value={{ customer, token, loading, authHeader: { "x-customer-token": token }, setSession, setCustomer, logout }}>
      {children}
    </CustomerCtx.Provider>
  );
}
