import { destroyAffiliateSession } from "@/lib/affiliate-auth";
export async function POST() { await destroyAffiliateSession(); return Response.json({ ok: true }); }
