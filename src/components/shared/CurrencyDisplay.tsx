import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import usFlag from "@/assets/flags/us.svg";
import euFlag from "@/assets/flags/eu.svg";
import gbFlag from "@/assets/flags/gb.svg";
import hkFlag from "@/assets/flags/hk.svg";
import sgFlag from "@/assets/flags/sg.svg";
import cnFlag from "@/assets/flags/cn.svg";
import jpFlag from "@/assets/flags/jp.svg";
import vnFlag from "@/assets/flags/vn.svg";
import auFlag from "@/assets/flags/au.svg";
import caFlag from "@/assets/flags/ca.svg";
import aeFlag from "@/assets/flags/ae.svg";
import thFlag from "@/assets/flags/th.svg";
import "@/styles/wallet-ui.css";

// Bundled SVGs keep currency flags crisp without remote requests.
const currencies: Record<string, { flag?: string; name: string }> = {
  USD: { flag: usFlag, name: "US dollar" },
  EUR: { flag: euFlag, name: "Euro" },
  GBP: { flag: gbFlag, name: "Pound sterling" },
  HKD: { flag: hkFlag, name: "Hong Kong dollar" },
  SGD: { flag: sgFlag, name: "Singapore dollar" },
  CNY: { flag: cnFlag, name: "Chinese yuan" },
  JPY: { flag: jpFlag, name: "Japanese yen" },
  VND: { flag: vnFlag, name: "Vietnamese dong" },
  AUD: { flag: auFlag, name: "Australian dollar" },
  CAD: { flag: caFlag, name: "Canadian dollar" },
  AED: { flag: aeFlag, name: "UAE dirham" },
  THB: { flag: thFlag, name: "Thai baht" },
};

type CurrencyProps = { currency?: string | null; size?: "compact" | "regular"; className?: string };
const identity = (currency?: string | null) => {
  const code = currency?.trim().toUpperCase() || "—";
  return { code, ...(currencies[code] || { name: "Currency" }) };
};

export function CurrencyAvatar({ currency, size = "regular", className }: CurrencyProps) {
  const { flag } = identity(currency);
  return <span aria-hidden="true" className={cn("currency-avatar", `currency-avatar--${size}`, flag ? "currency-avatar--flag" : "currency-tone--neutral", className)}>
    {flag ? <img src={flag} alt="" className="currency-flag" draggable={false} /> : "¤"}
  </span>;
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
