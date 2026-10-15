import { endImpersonation, errorResponse } from "@/lib/auth";

export async function POST() {
  try {
    const ok = await endImpersonation();
    return Response.json({ ok });
  } catch (e) {
    return errorResponse(e);
  }
}
