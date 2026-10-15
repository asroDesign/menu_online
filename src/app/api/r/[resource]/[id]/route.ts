/* eslint-disable @typescript-eslint/no-explicit-any */
import { REGISTRY } from "@/lib/registry";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ resource: string; id: string }> };

async function dispatch(method: "get" | "update" | "remove", req: Request, ctx: Ctx) {
  const { resource, id } = await ctx.params;
  const h = REGISTRY[resource]?.[method];
  if (!h) return Response.json({ error: "پیدا نشد" }, { status: 404 });
  return h(req, { params: Promise.resolve({ id }) });
}
export const GET = (req: Request, ctx: Ctx) => dispatch("get", req, ctx);
export const PATCH = (req: Request, ctx: Ctx) => dispatch("update", req, ctx);
export const DELETE = (req: Request, ctx: Ctx) => dispatch("remove", req, ctx);
