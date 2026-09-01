import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  UserKycWorkflowBoundary,
  buildUserCreatePayload,
  buildUserUpdatePayload,
  type UserFormState,
} from "@/pages/admin/AdminUsers";

const userForm = (overrides: Partial<UserFormState> = {}): UserFormState => ({
  email: " customer@example.com ",
  phone: " +84901234567 ",
  full_name: " Customer Name ",
  password: "secret123",
  status: "active",
  integration_links: [],
  ...overrides,
});

describe("Admin Users KYC workflow boundary", () => {
  it("keeps KYC status visible without an editable control", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UserKycWorkflowBoundary userId={42} status="under_review" />
      </MemoryRouter>,
    );

    expect(screen.getByText("KYC status")).toBeInTheDocument();
    expect(screen.getByText("under review")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /kyc/i })).not.toBeInTheDocument();
  });

  it("links user detail to the dedicated KYC review page", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UserKycWorkflowBoundary userId={42} status="submitted" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Open KYC review" })).toHaveAttribute(
      "href",
      "/admin/kyc-reviews?user_id=42",
    );
  });

  it("never includes kyc_status in user create or update payloads", () => {
    expect(buildUserCreatePayload(userForm())).not.toHaveProperty("kyc_status");
    expect(buildUserUpdatePayload(userForm())).not.toHaveProperty("kyc_status");
  });

  it("preserves existing editable user fields", () => {
    expect(buildUserCreatePayload(userForm())).toMatchObject({
      email: "customer@example.com",
      phone: "+84901234567",
      full_name: "Customer Name",
      password: "secret123",
      status: "active",
      integration_links: [],
    });
    expect(buildUserUpdatePayload(userForm({ status: "suspended", password: "" }))).toEqual({
      full_name: "Customer Name",
      status: "suspended",
      integration_links: [],
    });
  });
});
