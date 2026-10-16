import type { ReactNode } from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import "@/components/marketing/marketing.css";
export default function PublicAffiliateLayout({children}:{children:ReactNode}){return <div className="marketing-site"><SiteHeader/><div className="marketing-subpage">{children}</div><SiteFooter/></div>}
