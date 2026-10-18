/** Accept only app-local paths for post-auth redirects. */
export function safeNextPath(value: string | string[] | undefined, fallback = "/dashboard") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return fallback;
  try {
    const url = new URL(value, "http://local.invalid");
    return url.origin === "http://local.invalid" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
