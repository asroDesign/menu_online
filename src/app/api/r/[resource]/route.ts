/* eslint-disable @typescript-eslint/no-explicit-any */
import { REGISTRY } from "@/lib/registry";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ resource: string }> };

async function dispatch(method: "list" | "create", req: Request, ctx: Ctx) {
  const { resource } = await ctx.params;
  const h = REGISTRY[resource]?.[method];
  if (!h) return Response.json({ error: "پیدا نشد" }, { status: 404 });
  return h(req, { params: Promise.resolve({}) });
}
export const GET = (req: Request, ctx: Ctx) => dispatch("list", req, ctx);
export const POST = (req: Request, ctx: Ctx) => dispatch("create", req, ctx);
