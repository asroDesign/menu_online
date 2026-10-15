import { Badge } from "@/components/ui";
import { statusInfo } from "@/lib/format";

export function StatusBadge({ status }: { status: string }) {
  const s = statusInfo(status);
  return <Badge color={s.color}>{s.label}</Badge>;
}
