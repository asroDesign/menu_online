"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toFa } from "@/lib/format";
import { Button, Icon, useToast } from "@/components/ui";

type PrintKind = "customer" | "kitchen" | "cafe";

export function ManualOrderPrintButton({
  orderId,
  kind,
  label,
  size = "sm",
  variant = "secondary",
  className,
  disabled = false,
}: {
  orderId: number;
  kind: PrintKind;
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost" | "danger" | "dark";
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function print() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const result = await api<{ count: number }>(`/api/orders/${orderId}/print`, { method: "POST", body: { kind } });
      toast(`${toFa(result.count)} نسخه برای چاپگر ارسال شد؛ اگر Agent قطع باشد، درخواست در صف می‌ماند.`);
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return <Button type="button" size={size} variant={variant} className={className} disabled={disabled} loading={busy} onClick={() => void print()}>
    <Icon name="print" className="size-4" />{label}
  </Button>;
}
