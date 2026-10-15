export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as typeof globalThis & { __smsTimer?: NodeJS.Timeout };
  if (g.__smsTimer) return;
  g.__smsTimer = setInterval(async () => {
    try {
      const { runAutomations } = await import("@/lib/sms");
      await runAutomations();
    } catch (e) {
      console.error("automation tick failed", e);
    }
  }, 10 * 60_000);
}
