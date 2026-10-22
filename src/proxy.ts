import { NextResponse, type NextRequest } from "next/server";

/**
 * The homepage is rendered per request (login state and custom-domain routing),
 * so it must never be shared-cached. `no-cache` still permits Chrome's
 * back/forward cache while requiring validation before ordinary reuse.
 */
export function proxy(_request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-cache, max-age=0, must-revalidate");
  return response;
}

export const config = { matcher: ["/"] };
