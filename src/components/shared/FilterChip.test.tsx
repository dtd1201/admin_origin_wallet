import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterChip } from "./FilterChip";

describe("Filter chip presentation", () => {
  it("exposes the actual selected state to keyboard and assistive technology users", () => {
    const { rerender } = render(<FilterChip selected={false}>Needs action</FilterChip>);
    expect(screen.getByRole("button", { name: "Needs action" })).toHaveAttribute("aria-pressed", "false");
    rerender(<FilterChip selected>Needs action</FilterChip>);
    expect(screen.getByRole("button", { name: "Needs action" })).toHaveAttribute("aria-pressed", "true");
  });

  it("retains native disabled behavior and a visible label", () => {
    const onClick = vi.fn();
    render(<FilterChip selected={false} disabled onClick={onClick}>Complete</FilterChip>);
    const button = screen.getByRole("button", { name: "Complete" });
    expect(button).toBeDisabled();
    expect(button).toBeVisible();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
