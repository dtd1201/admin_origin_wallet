import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AdminLogin from "@/pages/admin/AdminLogin";

const loginMock = vi.fn();
const resendLoginMock = vi.fn();
const verifyLoginMock = vi.fn();
const clearAuthErrorMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    login: loginMock,
    resendLogin: resendLoginMock,
    verifyLogin: verifyLoginMock,
    authError: null,
    clearAuthError: clearAuthErrorMock,
    user: null,
  }),
}));

const renderLogin = () =>
  render(
    <MemoryRouter>
      <AdminLogin />
    </MemoryRouter>,
  );

describe("AdminLogin resend verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loginMock.mockResolvedValue({
      message: "Verification code sent to your email.",
      email: "admin@example.com",
      expires_in_minutes: 15,
    });

    resendLoginMock.mockResolvedValue({
      message: "A new verification code has been sent to your email.",
      email: "admin@example.com",
      expires_in_minutes: 15,
      resend_cooldown_seconds: 120,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const moveToVerificationStep = async () => {
    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@example.com" },
    });

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Send verification code" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /Resend verification code in 120s/,
        }),
      ).toBeInTheDocument();
    });
  };

  it("enters verification step with resend cooldown", async () => {
    await moveToVerificationStep();

    expect(
      screen.getByText("Enter the verification code sent to admin@example.com."),
    ).toBeInTheDocument();

    const resendButton = screen.getByRole("button", {
      name: /Resend verification code in 120s/,
    });

    expect(resendButton).toBeDisabled();
  });

  it("enables resend after the 120 second cooldown", async () => {
    vi.useFakeTimers();

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@example.com" },
    });

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Send verification code" }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByRole("button", {
        name: /Resend verification code in 120s/,
      }),
    ).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });

    expect(
      screen.getByRole("button", {
        name: "Resend verification code",
      }),
    ).toBeEnabled();
  });

  it("resends the verification code and resets the cooldown", async () => {
    vi.useFakeTimers();

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@example.com" },
    });

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Send verification code" }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });

    const resendButton = screen.getByRole("button", {
      name: "Resend verification code",
    });

    expect(resendButton).toBeEnabled();

    fireEvent.click(resendButton);

    await act(async () => {
      await Promise.resolve();
    });

    expect(resendLoginMock).toHaveBeenCalledWith("admin@example.com");

    expect(
      screen.getByText(
        "A new verification code has been sent to your email.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: /Resend verification code in 120s/,
      }),
    ).toBeDisabled();
  });

  it("uses the cooldown returned by the resend response", async () => {
    vi.useFakeTimers();

    resendLoginMock.mockResolvedValueOnce({
      message: "A new verification code has been sent to your email.",
      email: "admin@example.com",
      expires_in_minutes: 15,
      resend_cooldown_seconds: 30,
    });

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@example.com" },
    });

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Send verification code" }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });

    const resendButton = screen.getByRole("button", {
      name: "Resend verification code",
    });

    expect(resendButton).toBeEnabled();

    fireEvent.click(resendButton);

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByRole("button", {
        name: /Resend verification code in 30s/,
      }),
    ).toBeDisabled();
  });

  it("shows an error when resend fails", async () => {
    vi.useFakeTimers();

    resendLoginMock.mockRejectedValueOnce(
      new Error("Please wait before requesting another verification code."),
    );

    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@example.com" },
    });

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Send verification code" }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });

    const resendButton = screen.getByRole("button", {
      name: "Resend verification code",
    });

    expect(resendButton).toBeEnabled();

    fireEvent.click(resendButton);

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByText(
        "Please wait before requesting another verification code.",
      ),
    ).toBeInTheDocument();
  });

  it("resets the verification state when going back", async () => {
    await moveToVerificationStep();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("button", { name: "Send verification code" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("admin@example.com");

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@example.com" },
    });

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Send verification code" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Resend verification code in 120s/ }),
      ).toBeInTheDocument();
    });
  });
});
