"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { Input } from "./input";

function formatDigits(digits: string): string {
  if (!digits) return "";
  return Number(digits).toLocaleString("id-ID");
}

export interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Raw numeric value in Rupiah, or undefined/empty for no input yet. */
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
}

/**
 * "Rp 1.234.567" while typing, per UI Pro Max's forms guidance for currency
 * fields -- a raw `type="number"` can't show thousand separators, and
 * `type="text"` with no formatting leaves the user guessing how many
 * zeros they just typed. Keeps a plain numeric value as the source of
 * truth (onValueChange), formatting is display-only.
 */
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, className, disabled, ...props }, ref) => {
    const [display, setDisplay] = React.useState(() => formatDigits(value ? String(Math.round(value)) : ""));

    // Re-sync display when the value changes from outside (e.g. form reset).
    React.useEffect(() => {
      setDisplay(formatDigits(value ? String(Math.round(value)) : ""));
    }, [value]);

    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      const digits = event.target.value.replace(/\D/g, "");
      setDisplay(formatDigits(digits));
      onValueChange(digits ? Number(digits) : undefined);
    }

    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">Rp</span>
        <Input
          ref={ref}
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          disabled={disabled}
          className={cn("pl-9 tabular-nums", className)}
          {...props}
        />
      </div>
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
