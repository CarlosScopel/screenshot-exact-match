import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessScreen } from "@/components/portal/AccessScreen";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
vi.mock("@/lib/admin.functions", () => ({ requestMenteeAccess: vi.fn() }));
vi.mock("@/lib/media", () => ({ useMedia: () => null }));
vi.mock("@/lib/password-recovery", () => ({
  INVALID_RECOVERY_LINK: "Link inválido",
  saveRecoveredPassword: vi.fn(),
  validatePasswordRecovery: vi.fn(),
}));
afterEach(cleanup);
describe("Espaçamento do e-mail nas telas de acesso", () => {
  it.each(["login", "forgot", "request"] as const)(
    "reserva espaço ao ícone sem bloquear digitação em %s",
    async (mode) => {
      render(<AccessScreen name="A ORDEM" onSuccess={vi.fn()} />);
      await screen.findByRole("textbox", { name: "E-mail" });
      if (mode === "forgot")
        fireEvent.click(screen.getByRole("button", { name: "Esqueceu sua senha?" }));
      if (mode === "request")
        fireEvent.click(screen.getByRole("button", { name: "Quero fazer parte de A ORDEM" }));
      const input = screen.getByRole("textbox", { name: "E-mail" });
      expect(input).toHaveStyle({ paddingLeft: "2.75rem" });
      expect(input).toHaveAttribute("type", "email");
      expect(input).toHaveAttribute("autocomplete", "email");
      expect(input).toHaveAttribute("placeholder", "voce@exemplo.com");
      const icon = input.parentElement?.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).toHaveClass("pointer-events-none", "top-1/2", "-translate-y-1/2");
      fireEvent.change(input, { target: { value: "aluno@example.invalid" } });
      expect(input).toHaveValue("aluno@example.invalid");
    },
  );
});
