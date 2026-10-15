import { productsCrud } from "@/lib/resources";

export const dynamic = "force-dynamic";
export const PATCH = productsCrud.update;
export const DELETE = productsCrud.remove;
