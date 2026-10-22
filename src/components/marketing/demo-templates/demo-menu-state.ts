"use client";

import { useMemo, useState } from "react";
import { DEMO_MENUS, type DemoMenu, type DemoMenuProduct } from "@/lib/demo-menus";

type CartLine = { product: DemoMenuProduct; quantity: number; option?: { label: string; price: number } };

export function useDemoMenuState(menuId: string, initialCategory?: string) {
  const menu = DEMO_MENUS.find((item) => item.id === menuId) ?? DEMO_MENUS[0];
  const [category, setCategory] = useState(initialCategory ?? "همه");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [selected, setSelected] = useState<DemoMenuProduct | null>(null);
  const [option, setOption] = useState<{ label: string; price: number } | null>(null);
  const [notice, setNotice] = useState("");
  const visible = useMemo(() => menu.products.filter((product) =>
    (category === "همه" || product.category === category)
      && (!query.trim() || `${product.name} ${product.description} ${product.category}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))),
  [category, menu.products, query]);
  const cartLines = Object.values(cart);
  const count = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const total = cartLines.reduce((sum, line) => sum + line.quantity * (line.option?.price ?? line.product.price), 0);

  function add(product: DemoMenuProduct, selectedOption?: { label: string; price: number }) {
    const key = `${product.id}:${selectedOption?.label ?? "default"}`;
    setCart((current) => {
      const quantity = Math.min(20, (current[key]?.quantity ?? 0) + 1);
      return { ...current, [key]: { product, quantity, option: selectedOption } };
    });
  }
  function remove(product: DemoMenuProduct, selectedOption?: { label: string; price: number }) {
    const key = `${product.id}:${selectedOption?.label ?? "default"}`;
    setCart((current) => {
      const line = current[key];
      if (!line) return current;
      if (line.quantity <= 1) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: { ...line, quantity: line.quantity - 1 } };
    });
  }
  function openProduct(product: DemoMenuProduct) {
    setSelected(product);
    setOption(product.options?.[0] ?? null);
  }
  function closeProduct() { setSelected(null); setOption(null); }

  return { menu, category, setCategory, query, setQuery, visible, cartLines, count, total, add, remove, selected, option, setOption, openProduct, closeProduct, notice, setNotice };
}

export type DemoMenuState = ReturnType<typeof useDemoMenuState>;
