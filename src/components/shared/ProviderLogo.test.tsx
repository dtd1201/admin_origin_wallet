import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProviderLogo } from "./ProviderLogo";

// These are presentation aliases already used by Customer/Admin; no API code changes.
describe("ProviderLogo", () => {
  it.each([
    { code: "nium", name: "Nium" },
    { code: "NIUM", name: "Infrastructure" },
    { code: "origin-wallet", name: "Origin Wallet" },
    { code: "origin_wallet" },
    { code: "originwallet" },
    { name: "Origin Wallet" },
    { name: "Nium" },
  ])("reuses the canonical sidebar/header asset for %j", (provider) => {
    const { container } = render(<ProviderLogo provider={{ ...provider, logo_url: "https://old.example/nium.png" }} />);
    expect(screen.getByRole("img", { name: "Origin Wallet logo" })).toHaveAttribute("src", "/logo/logo.jpg");
    expect(container).not.toHaveTextContent("OR");
    expect(container.querySelector("img")).not.toHaveClass("p-1.5");
  });

  it("preserves a different provider's configured logo and accessible identity", () => {
    render(<ProviderLogo provider={{ code: "other", name: "Other Provider", logo_url: "/other-provider.svg" }} imageClassName="p-1" />);
    const image = screen.getByRole("img", { name: "Other Provider logo" });
    expect(image).toHaveAttribute("src", "/other-provider.svg");
    expect(image).toHaveClass("p-1");
    expect(screen.queryByRole("img", { name: "Origin Wallet logo" })).not.toBeInTheDocument();
  });

  it.each([undefined, null, {}, { code: "unknown" }, { name: "Unknown Provider" }])("uses a neutral icon rather than claiming Origin Wallet for %j", (provider) => {
    const { container } = render(<ProviderLogo provider={provider} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img")).toHaveClass("bg-slate-100");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("img").getAttribute("aria-label")).not.toContain("Origin Wallet");
  });

  it("falls back safely on image errors and recovers when the provider changes", () => {
    const { rerender } = render(<ProviderLogo provider={{ code: "other", name: "Other", logo_url: "/missing.svg" }} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img", { name: "Other logo" }).tagName).toBe("DIV");
    rerender(<ProviderLogo provider={{ code: "nium", name: "Nium" }} />);
    expect(screen.getByRole("img", { name: "Origin Wallet logo" })).toHaveAttribute("src", "/logo/logo.jpg");
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img", { name: "Origin Wallet logo" }).tagName).toBe("DIV");
  });

  it.each(["h-5 w-5", "h-6 w-6", "h-7 w-7", "h-8 w-8", "h-9 w-9"])("preserves compact sizing and prevents shrinking: %s", (className) => {
    render(<ProviderLogo provider={{ code: "nium" }} className={`${className} rounded-md`} />);
    const image = screen.getByRole("img");
    expect(image).toHaveClass("h-full", "w-full", "object-contain");
    expect(image.parentElement).toHaveClass(...className.split(" "), "shrink-0", "overflow-hidden");
  });
});
