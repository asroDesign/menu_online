"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button, Field, Input, useToast } from "@/components/ui";

export function AccountSecuritySettings() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/business/security", { method: "POST", body: { currentPassword, newPassword, confirmPassword } });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      toast("گذرواژهٔ حساب تغییر کرد");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-4"><form onSubmit={submit} className="space-y-4">
    <Field label="گذرواژهٔ فعلی"><Input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required maxLength={256} /></Field>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="گذرواژهٔ جدید" hint="دست‌کم ۸ نویسه"><Input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} maxLength={128} /></Field>
      <Field label="تکرار گذرواژهٔ جدید"><Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} maxLength={128} /></Field>
    </div>
    <div className="flex justify-end"><Button loading={busy} disabled={!currentPassword || !newPassword || !confirmPassword}>تغییر گذرواژه</Button></div>
  </form><p className="rounded-xl bg-base-200 px-3 py-2 text-xs leading-6 text-base-content/65">برای بازیابی دسترسی در صورت فراموشی رمز، از حساب خارج شوید و در صفحهٔ ورود «ارسال کد پیامکی» را با شمارهٔ تأییدشده انتخاب کنید.</p></div>;
}
