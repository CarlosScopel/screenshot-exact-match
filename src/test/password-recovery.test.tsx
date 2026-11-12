import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn(), resetPasswordForEmail: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/lib/admin.functions", () => ({ getSetupState: vi.fn(async () => ({ hasAdmin: true })), requestMenteeAccess: vi.fn() }));
vi.mock("@/lib/owner.functions", () => ({ requestOwnerAccess: vi.fn() }));
vi.mock("@/lib/media", () => ({ useMedia: () => null }));
import { validatePasswordRecovery, saveRecoveredPassword } from "@/lib/password-recovery";
import { AccessScreen } from "@/components/portal/AccessScreen";

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/?type=recovery");
  auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("Password recovery", () => {
  it("rejects a recovery type flag without an authenticated user", async () => {
    expect(await validatePasswordRecovery("?type=recovery", "")).toBe(false);
  });
  it("rejects an expired callback even when an unrelated user is already signed in", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "existing" } }, error: null });
    expect(await validatePasswordRecovery("?type=recovery", "#error=access_denied&error_code=otp_expired")).toBe(false);
    expect(auth.getUser).not.toHaveBeenCalled();
  });
  it("never attempts to save a password without a validated session", async () => {
    await expect(saveRecoveredPassword("new-test-password")).rejects.toThrow("Solicite um novo link");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("saves a recovery password without demanding the current password", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "recovery-user" } }, error: null });
    await saveRecoveredPassword("new-test-password");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-test-password" });
  });
  it("lets the user request a replacement rather than submitting an expired link", async () => {
    render(<AccessScreen name="A ORDEM" onSuccess={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Solicitar novo link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "E-mail" }), { target: { value: "test@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));
    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("test@example.test", {
      redirectTo: "https://pixel-perfect-replay-54723.lovable.app/reset-password?type=recovery",
    }));
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});