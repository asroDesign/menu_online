"use client";

import { useMemo, useState } from "react";
import { AmountInput } from "@/components/ui";
import { formatNumber } from "@/lib/format";

const fa = new Intl.NumberFormat("fa-IR");

export function RestaurantMenuCalculator() {
  const [tables, setTables] = useState("20");
  const [copies, setCopies] = useState("2");
  const [reprints, setReprints] = useState("1");
  const [unitCost, setUnitCost] = useState("50000");
  const total = useMemo(() => Math.max(0, Number(tables) || 0) * Math.max(0, Number(copies) || 0) * Math.max(0, Number(reprints) || 0) * Math.max(0, Number(unitCost) || 0), [tables, copies, reprints, unitCost]);
  return <div className="rmenu-calculator" aria-label="برآورد هزینه چاپ منوی رستوران">
    <div className="rmenu-calc-fields">
      <label><span>تعداد میز</span><AmountInput min={0} max={1000} value={tables} onValueChange={setTables} aria-label="تعداد میز" /></label>
      <label><span>نسخه برای هر میز</span><AmountInput min={0} max={10} value={copies} onValueChange={setCopies} aria-label="تعداد منو برای هر میز" /></label>
      <label><span>دفعات چاپ مجدد در سال</span><AmountInput min={0} max={10} value={reprints} onValueChange={setReprints} aria-label="دفعات چاپ مجدد در سال" /></label>
      <label><span>هزینهٔ هر نسخه (تومان)</span><AmountInput min={0} max={10000000} value={unitCost} onValueChange={setUnitCost} aria-label="هزینه چاپ هر منو به تومان" /></label>
    </div>
    <div className="rmenu-calc-result"><div><span>برآورد هزینهٔ چاپ مجدد در سال</span><strong>{formatNumber(total)} <small>تومان</small></strong><p>{fa.format(Number(tables) || 0)} میز × {fa.format(Number(copies) || 0)} نسخه × {fa.format(Number(reprints) || 0)} نوبت × {formatNumber(Number(unitCost) || 0)} تومان</p></div><span className="rmenu-calc-stamp">فقط تخمین<br />با اعداد شما</span></div>
    <p className="rmenu-calc-disclaimer">این برآورد تقریبی است و هزینهٔ طراحی، زمان کارکنان، آسیب یا گم‌شدن منو را در نظر نمی‌گیرد؛ هزینهٔ واقعی چاپ را با چاپخانهٔ خود بررسی کنید.</p>
  </div>;
}
