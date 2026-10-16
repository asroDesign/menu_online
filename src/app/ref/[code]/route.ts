import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { affiliates } from "@/db/schema";

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const [affiliate] = await db.select({ id: affiliates.id, attributionDays: affiliates.attributionDays }).from(affiliates).where(and(eq(affiliates.referralCode, code.toUpperCase()), eq(affiliates.status, "active")));
  const res = NextResponse.redirect(new URL("/", req.url));
  if (affiliate) res.cookies.set("affiliate_ref", code.toUpperCase(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: Math.min(365, Math.max(1, affiliate.attributionDays)) * 86400 });
  return res;
}
