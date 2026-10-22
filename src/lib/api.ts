"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  url: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("ارتباط با سرور برقرار نشد", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
      location.href = "/login";
    }
    throw new ApiError((data as { error?: string }).error ?? "خطایی رخ داد", res.status);
  }
  return data as T;
}

/**
 * Collection hook with optimistic create / update / remove and rollback on failure.
 * Server responses reconcile the optimistic state.
 */
export function useCollection<T extends { id: number }>(url: string, opts: { poll?: number } = {}) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(0);
  const itemsRef = useRef<T[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setError(null);
      try {
        const data = await api<{ items: T[] }>(url);
        if (pending.current === 0) setItems(data.items);
      } catch (e) {
        if (!silent) setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [url],
  );

  useEffect(() => {
    // Loading is initiated by the hook lifecycle; updates are applied after the network request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    if (!opts.poll) return;
    const t = setInterval(() => {
      if (!document.hidden) load(true);
    }, opts.poll);
    return () => clearInterval(t);
  }, [load, opts.poll]);

  const create = useCallback(
    async (payload: Record<string, unknown>, optimistic: Omit<T, "id">) => {
      const tempId = -Date.now();
      pending.current++;
      setItems((prev) => [{ ...optimistic, id: tempId } as T, ...prev]);
      try {
        const { item } = await api<{ item: T }>(url, { method: "POST", body: payload });
        setItems((prev) => prev.map((i) => (i.id === tempId ? item : i)));
        return item;
      } catch (e) {
        setItems((prev) => prev.filter((i) => i.id !== tempId));
        throw e;
      } finally {
        pending.current--;
      }
    },
    [url],
  );

  const update = useCallback(
    async (id: number, patch: Record<string, unknown>) => {
      const snapshot = itemsRef.current;
      pending.current++;
      setItems((prev) => prev.map((i) => (i.id === id ? ({ ...i, ...patch } as T) : i)));
      try {
        const base = url.split("?")[0];
        const { item } = await api<{ item: T }>(`${base}/${id}`, { method: "PATCH", body: patch });
        setItems((prev) => prev.map((i) => (i.id === id ? item : i)));
        return item;
      } catch (e) {
        setItems((prev) => prev.map((i) => snapshot.find((s) => s.id === i.id) ?? i));
        throw e;
      } finally {
        pending.current--;
      }
    },
    [url],
  );

  const remove = useCallback(
    async (id: number) => {
      const snapshot = itemsRef.current;
      pending.current++;
      setItems((prev) => prev.filter((i) => i.id !== id));
      try {
        const base = url.split("?")[0];
        await api(`${base}/${id}`, { method: "DELETE" });
      } catch (e) {
        setItems(snapshot);
        throw e;
      } finally {
        pending.current--;
      }
    },
    [url],
  );

  return { items, setItems, loading, error, reload: load, create, update, remove };
}
