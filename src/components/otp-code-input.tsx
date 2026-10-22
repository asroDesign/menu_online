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
    <div aria-hidden="true" className="grid gap-2 sm:gap-2.5" style={{ gridTemplateColumns: `repeat(${safeLength}, minmax(0, 1fr))` }}>
      {Array.from({ length: safeLength }, (_, index) => <span key={index} className={cn(
        "grid aspect-square max-h-12 min-w-0 place-items-center rounded-xl border bg-base-100 text-xl font-extrabold tabular-nums transition-colors sm:rounded-2xl sm:text-2xl",
        disabled ? "border-base-300 bg-base-200 text-base-content/50" : "border-base-300 text-base-content",
        focused && index === activeIndex && !disabled && "border-primary ring-2 ring-primary/20",
      )}>{code[index] ?? <span className="text-base-content/20">•</span>}</span>)}
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
