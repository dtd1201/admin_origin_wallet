import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import "@/styles/wallet-ui.css";

type FilterChipProps = ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean };

export function FilterChip({ selected, className, children, ...props }: FilterChipProps) {
  return <button {...props} type="button" aria-pressed={selected} className={cn("wallet-filter", className)}>{children}</button>;
}
