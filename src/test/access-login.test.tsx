import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signInWithPassword: vi.fn(), requestMenteeAccess: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: mocks.signInWithPassword } },
}));
vi.mock("@/lib/admin.functions", () => ({ requestMenteeAccess: mocks.requestMenteeAccess }));
vi.mock("@/lib/media", () => ({ useMedia: () => null }));
import { AccessScreen } from "@/components/portal/AccessScreen";

const FORMER_DEMO_EMAIL = "mentorado@demo.aordem";
const FORMER_DEMO_PASSWORD = "OrdemDemo2026!";

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});
afterEach(cleanup);

describe("Real account entry", () => {
  it("sends former demonstration credentials to Auth and denies entry if they are not a real account", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: new Error("Invalid login credentials") });
    const onSuccess = vi.fn();
    render(<AccessScreen name="A ORDEM" onSuccess={onSuccess} />);
    fireEvent.change(await screen.findByRole("textbox", { name: "E-mail" }), {
      target: { value: FORMER_DEMO_EMAIL },
    });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: FORMER_DEMO_PASSWORD } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar na plataforma" }));
    await waitFor(() =>
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        email: FORMER_DEMO_EMAIL,
        password: FORMER_DEMO_PASSWORD,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Invalid login credentials"),
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("continues to accept accounts validated by Auth", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    const onSuccess = vi.fn();
    render(<AccessScreen name="A ORDEM" onSuccess={onSuccess} />);
    fireEvent.change(await screen.findByRole("textbox", { name: "E-mail" }), {
      target: { value: "member@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "account-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar na plataforma" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "member@example.test",
      password: "account-password",
    });
  });
});
