import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CurrencyAvatar, CurrencyBadge, CurrencyDisplay } from "./CurrencyDisplay";

const currencyFlags = [
  ["USD", "us", "US dollar"],
  ["EUR", "eu", "Euro"],
  ["GBP", "gb", "Pound sterling"],
  ["HKD", "hk", "Hong Kong dollar"],
  ["SGD", "sg", "Singapore dollar"],
  ["CNY", "cn", "Chinese yuan"],
  ["JPY", "jp", "Japanese yen"],
  ["VND", "vn", "Vietnamese dong"],
  ["AUD", "au", "Australian dollar"],
  ["CAD", "ca", "Canadian dollar"],
  ["AED", "ae", "UAE dirham"],
  ["THB", "th", "Thai baht"],
];

describe("Currency visuals", () => {
  it.each(currencyFlags)("maps %s to the bundled %s flag and keeps its accessible identity", (currency, flag, name) => {
    const { container } = render(<>
      <CurrencyBadge currency={currency} />
      <CurrencyDisplay currency={currency}>{currency} 12.34</CurrencyDisplay>
      <CurrencyAvatar currency={currency} />
    </>);

    expect(screen.getByText(currency)).toBeVisible();
    expect(screen.getByText(currency)).toHaveAttribute("translate", "no");
    expect(screen.getByText(`${currency} 12.34`)).toBeVisible();
    expect(container.querySelector(".currency-badge")).toHaveAttribute("title", name);
    expect(screen.getByText(`· ${name}`)).toHaveClass("sr-only");

    const avatars = container.querySelectorAll(".currency-avatar");
    expect(avatars).toHaveLength(3);
    avatars.forEach((avatar) => {
      expect(avatar).toHaveAttribute("aria-hidden", "true");
      expect(avatar).toHaveClass("currency-avatar--flag");
      expect(avatar.textContent).toBe("");
      const image = avatar.querySelector("img");
      expect(image).toHaveAttribute("src", `/src/assets/flags/${flag}.svg`);
      expect(image).toHaveAttribute("alt", "");
      expect(image).toHaveAttribute("draggable", "false");
      expect(image).toHaveClass("currency-flag");
    });
  });

  it("normalizes whitespace and lowercase codes before choosing a flag", () => {
    const { container } = render(<CurrencyBadge currency="  eur  " />);
    expect(screen.getByText("EUR")).toBeVisible();
    expect(container.querySelector("img")).toHaveAttribute("src", "/src/assets/flags/eu.svg");
  });

  it("retains unknown currency codes with the original neutral fallback", () => {
    const { container } = render(<CurrencyBadge currency="xyz" size="compact" />);
    expect(screen.getByText("XYZ")).toBeVisible();
    expect(screen.getByText("¤")).toHaveClass("currency-tone--neutral", "currency-avatar--compact");
    expect(container.querySelector(".currency-badge")).toHaveAttribute("title", "Currency");
    expect(container.querySelector("img")).toBeNull();
  });

  it.each([undefined, null, "", "  "])("handles absent currency (%s) without claiming a known denomination", (currency) => {
    const { container } = render(<CurrencyBadge currency={currency} />);
    expect(screen.getByText("—")).toBeVisible();
    expect(screen.getByText("¤")).toHaveClass("currency-tone--neutral");
    expect(screen.queryByText("USD")).not.toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it.each(["compact", "regular"] as const)("preserves the %s size and custom class API across all exports", (size) => {
    const { container } = render(<>
      <CurrencyAvatar currency="GBP" size={size} className="custom-avatar" />
      <CurrencyBadge currency="GBP" size={size} className="custom-badge" />
      <CurrencyDisplay currency="GBP" size={size} className="custom-display">GBP 10.00</CurrencyDisplay>
    </>);
    container.querySelectorAll(".currency-avatar").forEach((avatar) => {
      expect(avatar).toHaveClass(`currency-avatar--${size}`);
    });
    expect(container.querySelector(".custom-avatar")).toHaveClass("currency-avatar");
    expect(container.querySelector(".custom-badge")).toHaveClass("currency-badge");
    expect(container.querySelector(".custom-display")).toHaveClass("currency-display");
  });

  it("preserves the default avatar, badge, and amount sizes", () => {
    const { container } = render(<>
      <CurrencyAvatar currency="USD" />
      <CurrencyBadge currency="USD" />
      <CurrencyDisplay currency="USD">USD 10.00</CurrencyDisplay>
    </>);
    expect(container.querySelectorAll(".currency-avatar--regular")).toHaveLength(2);
    expect(container.querySelector(".currency-display .currency-avatar")).toHaveClass("currency-avatar--compact");
  });

  it("preserves supplied amount text including currency, precision and sign", () => {
    render(<CurrencyDisplay currency="USD">- USD 0.00000001</CurrencyDisplay>);
    expect(screen.getByText("- USD 0.00000001")).toBeVisible();
    expect(screen.getByText("- USD 0.00000001")).toHaveAttribute("translate", "no");
  });

  it("preserves React children without changing their formatting", () => {
    render(<CurrencyDisplay currency="JPY"><strong>JPY 1,234</strong></CurrencyDisplay>);
    expect(screen.getByText("JPY 1,234").tagName).toBe("STRONG");
  });
});
