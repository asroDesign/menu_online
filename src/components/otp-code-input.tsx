"use client";

import { useState, type InputHTMLAttributes } from "react";
import { cn } from "@/components/ui";
import { normalizeOtpCode } from "@/lib/otp-code";

type OtpCodeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "maxLength" | "inputMode" | "autoComplete"> & {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  ariaLabel: string;
};

/** One real text field with a six-cell OTP presentation, preserving SMS autofill and paste. */
export function OtpCodeInput({ value, onChange, length = 6, ariaLabel, className, disabled, ...inputProps }: OtpCodeInputProps) {
  const [focused, setFocused] = useState(false);
  const safeLength = Math.max(1, Math.min(12, length));
  const code = normalizeOtpCode(value, safeLength);
  const activeIndex = Math.min(code.length, safeLength - 1);

  return <div dir="ltr" className={cn("group relative mx-auto w-full max-w-sm", className)}>
    <div aria-hidden="true" className="grid gap-1.5 sm:gap-2.5" style={{ gridTemplateColumns: `repeat(${safeLength}, minmax(0, 1fr))` }}>
      {Array.from({ length: safeLength }, (_, index) => {
        const filled = index < code.length;
        const current = focused && index === activeIndex;
        return <span key={index} className={cn(
          "grid aspect-[1.08/1] max-h-14 min-w-0 place-items-center rounded-xl border text-xl font-extrabold tabular-nums shadow-sm transition-[background-color,border-color,box-shadow,color,transform] duration-150 sm:rounded-2xl sm:text-2xl",
          disabled ? "border-base-300 bg-base-200 text-base-content/45 shadow-none" : filled ? "border-primary/25 bg-primary/[0.06] text-primary" : "border-base-300/80 bg-base-100 text-base-content",
          current && !disabled && "-translate-y-0.5 border-primary bg-primary/[0.08] shadow-md ring-2 ring-primary/20",
        )}>{code[index] ?? (current ? <span className="h-5 w-0.5 animate-pulse rounded-full bg-primary/55" /> : <span className="size-1.5 rounded-full bg-base-300" />)}</span>;
      })}
    </div>
    <input
      {...inputProps}
      type="text"
      value={code}
      onChange={(event) => onChange(normalizeOtpCode(event.currentTarget.value, safeLength))}
      onFocus={(event) => { setFocused(true); inputProps.onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); inputProps.onBlur?.(event); }}
      aria-label={ariaLabel}
      autoComplete="one-time-code"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={safeLength}
      dir="ltr"
      disabled={disabled}
      className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 disabled:cursor-not-allowed"
    />
  </div>;
}
