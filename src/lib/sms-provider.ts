export type PatternTemplate = { templateId: string; params: { name: string; var: string }[] };

export async function sendPattern(cfg: { provider: string; apiKey: string }, tpl: PatternTemplate, receptor: string, vars: Record<string, string>) {
  if (!cfg.apiKey) return { status: "failed" as const, detail: "کلید API پنل پیامک تنظیم نشده است" };
  try {
    if (cfg.provider === "smsir") {
      const res = await fetch("https://api.sms.ir/v1/send/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "x-api-key": cfg.apiKey },
        body: JSON.stringify({ mobile: receptor, templateId: Number(tpl.templateId), parameters: tpl.params.map((parameter) => ({ name: parameter.name, value: String(vars[parameter.var] ?? "").slice(0, 25) })) }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await res.json().catch(() => ({}));
      return result?.status === 1 ? { status: "sent" as const, detail: `messageId: ${result?.data?.messageId ?? "-"}` } : { status: "failed" as const, detail: `sms.ir: ${result?.message ?? res.status}` };
    }
    const keys = ["token", "token2", "token3", "token10", "token20"];
    const body = new URLSearchParams({ receptor, template: tpl.templateId });
    tpl.params.slice(0, 5).forEach((parameter, index) => {
      const value = String(vars[parameter.var] ?? "");
      body.set(keys[index], index < 3 ? value.replace(/\s+/g, "\u200c") : value.slice(0, 100));
    });
    const res = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(cfg.apiKey)}/verify/lookup.json`, { method: "POST", body, signal: AbortSignal.timeout(15000) });
    const result = await res.json().catch(() => ({}));
    return result?.return?.status === 200 ? { status: "sent" as const, detail: `messageid: ${result?.entries?.[0]?.messageid ?? "-"}` } : { status: "failed" as const, detail: `کاوه‌نگار: ${result?.return?.message ?? res.status}` };
  } catch (error) {
    return { status: "failed" as const, detail: `خطای شبکه: ${(error as Error).message}` };
  }
}
