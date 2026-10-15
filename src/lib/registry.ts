/* eslint-disable @typescript-eslint/no-explicit-any */
import { registryA } from "@/lib/registry-a";
import { registryB } from "@/lib/registry-b";
import { registryC, withPagerRing } from "@/lib/registry-c";

export const REGISTRY: Record<string, any> = { ...registryA, ...registryB, ...registryC, pagers: withPagerRing(registryA.pagers) };
