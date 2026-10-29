import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CurrencyBadge, CurrencyDisplay } from "./CurrencyDisplay";

describe("Currency visuals", () => {
  it.each(["USD", "EUR", "GBP", "HKD", "SGD", "CNY", "JPY", "VND", "AUD", "CAD", "AED", "THB"])("keeps %s visible with an accessible identity", (currency) => {
    render(<CurrencyBadge currency={currency} />);
    expect(screen.getByText(currency)).toBeVisible();
    expect(document.querySelector(".currency-avatar")).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector(".currency-badge")).toHaveAttribute("title");
    expect(document.querySelector("img")).toBeNull();
  });

  it("retains unknown currency codes with a neutral fallback", () => {
    render(<CurrencyBadge currency="xyz" size="compact" />);
    expect(screen.getByText("XYZ")).toBeVisible();
    expect(screen.getByText("¤")).toHaveClass("currency-tone--neutral", "currency-avatar--compact");
  });

  it("handles absent currency without claiming a known denomination", () => {
    render(<CurrencyBadge />);
    expect(screen.getByText("—")).toBeVisible();
    expect(screen.queryByText("USD")).not.toBeInTheDocument();
  });

  it("preserves the supplied amount including precision and sign", () => {
    render(<CurrencyDisplay currency="USD">- USD 0.00000001</CurrencyDisplay>);
    expect(screen.getByText("- USD 0.00000001")).toBeVisible();
  });
});
