import { productsCrud } from "@/lib/resources";

export const dynamic = "force-dynamic";
export const GET = productsCrud.list;
export const POST = productsCrud.create;
