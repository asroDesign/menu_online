import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { businesses, surveys } from "@/db/schema";
import { SurveyForm } from "@/components/survey-form";
import { featuresOf } from "@/lib/entitlements";
import { hasAny } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function SurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n)) notFound();
  const [sv] = await db.select().from(surveys).where(eq(surveys.id, n));
  if (!sv || !sv.isActive) notFound();
  const [biz] = await db.select().from(businesses).where(eq(businesses.id, sv.businessId));
  if (!biz || !hasAny(await featuresOf(biz), "surveys")) notFound();
  return <SurveyForm id={sv.id} title={sv.title} description={sv.description} questions={sv.questions as never} business={{ name: biz.name, emoji: biz.logoEmoji, color: biz.accentColor }} />;
}
