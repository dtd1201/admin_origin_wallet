import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "@/styles/wallet-ui.css";

// Currency identities, not country flags. All artwork is native text/CSS.
const currencies: Record<string, { symbol: string; name: string; tone: string }> = {
  USD: { symbol: "$", name: "US dollar", tone: "emerald" },
  EUR: { symbol: "€", name: "Euro", tone: "blue" },
  GBP: { symbol: "£", name: "Pound sterling", tone: "violet" },
  HKD: { symbol: "$", name: "Hong Kong dollar", tone: "rose" },
  SGD: { symbol: "$", name: "Singapore dollar", tone: "teal" },
  CNY: { symbol: "¥", name: "Chinese yuan", tone: "red" },
  JPY: { symbol: "¥", name: "Japanese yen", tone: "indigo" },
  VND: { symbol: "₫", name: "Vietnamese dong", tone: "lime" },
  AUD: { symbol: "$", name: "Australian dollar", tone: "amber" },
  CAD: { symbol: "$", name: "Canadian dollar", tone: "orange" },
  AED: { symbol: "د.إ", name: "UAE dirham", tone: "cyan" },
  THB: { symbol: "฿", name: "Thai baht", tone: "purple" },
};

type CurrencyProps = { currency?: string | null; size?: "compact" | "regular"; className?: string };
const identity = (currency?: string | null) => {
  const code = currency?.trim().toUpperCase() || "—";
  return { code, ...(currencies[code] || { symbol: "¤", name: "Currency", tone: "neutral" }) };
};

export function CurrencyAvatar({ currency, size = "regular", className }: CurrencyProps) {
  const { symbol, tone } = identity(currency);
  return <span aria-hidden="true" className={cn("currency-avatar", `currency-avatar--${size}`, `currency-tone--${tone}`, className)}>{symbol}</span>;
}

export function CurrencyBadge({ currency, size = "regular", className }: CurrencyProps) {
  const { code, name } = identity(currency);
  return <span className={cn("currency-badge", className)} title={name}>
    <CurrencyAvatar currency={currency} size={size} />
    <span translate="no" className="currency-code">{code}</span>
    <span className="sr-only"> · {name}</span>
  </span>;
}

export function CurrencyDisplay({ currency, size = "compact", className, children }: CurrencyProps & { children: ReactNode }) {
  return <span className={cn("currency-display", className)}>
    <CurrencyAvatar currency={currency} size={size} />
    <span className="currency-amount" translate="no">{children}</span>
  </span>;
}
