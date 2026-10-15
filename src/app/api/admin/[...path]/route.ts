import { withAuth } from "@/lib/auth";
import { handleAdmin } from "@/lib/admin-api";

export const dynamic = "force-dynamic";
type Ctx = { path: string[] };

const handler = withAuth<Ctx>((req, auth, { path }) => handleAdmin(req, auth, path), { admin: true });
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
