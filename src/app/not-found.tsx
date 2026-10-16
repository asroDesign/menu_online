import Link from "next/link";
import { Icon } from "@/components/ui";

export default function NotFound() {
  return (
    <main dir="rtl" className="grid min-h-dvh place-items-center bg-base-200/70 p-5 text-base-content">
      <section className="card w-full max-w-md border border-base-300 bg-base-100 p-8 text-center shadow-xl">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon name="search" className="size-8" /></span>
        <p className="mt-5 text-sm font-bold text-primary">خطای ۴۰۴</p>
        <h1 className="mt-2 text-2xl font-extrabold">این صفحه پیدا نشد</h1>
        <p className="mt-2 text-sm leading-7 text-base-content/60">نشانی صفحه تغییر کرده یا دیگر در دسترس نیست.</p>
        <Link href="/" className="btn btn-primary mt-6 rounded-xl">بازگشت به صفحه اصلی</Link>
      </section>
    </main>
  );
}
