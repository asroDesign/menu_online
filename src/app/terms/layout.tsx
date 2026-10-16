import type { ReactNode } from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import "@/components/marketing/marketing.css";
export default function MarketingLayout({children}:{children:ReactNode}){return <div className="marketing-site"><SiteHeader/><div className="marketing-subpage">{children}</div></div>}
