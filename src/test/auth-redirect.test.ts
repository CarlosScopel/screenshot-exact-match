import { describe, expect, it } from "vitest";
import { authRedirectUrl } from "@/lib/auth-redirect";

const live = "https://pixel-perfect-replay-54723.lovable.app";
const preview = "https://id-preview--fe5f8730-9053-4efb-acbc-09b0dca41d85.lovable.app";

describe("Destinos seguros dos e-mails de autenticação", () => {
  it("usa a plataforma publicada por padrão e exibe a criação de senha", () => {
    expect(authRedirectUrl()).toBe(`${live}/?type=recovery`);
  });

  it("preserva apenas a origem autorizada, sem copiar caminho ou parâmetros", () => {
    expect(authRedirectUrl(`${live}/_serverFn/request?next=https://evil.test`)).toBe(
      `${live}/?type=recovery`,
    );
  });

  it("permite convite na prévia deste projeto", () => {
    expect(authRedirectUrl(`${preview}/`, "invite")).toBe(`${preview}/?type=invite`);
  });

  it.each([
    "https://example.test/",
    "https://pixel-perfect-replay-54723.lovable.app.evil.test/",
    "https://another-project.lovable.app/",
    "javascript:alert(1)",
    "http://pixel-perfect-replay-54723.lovable.app/",
    "https://someone:password@pixel-perfect-replay-54723.lovable.app/",
    "not-a-url",
  ])("não encaminha tokens para destino não autorizado: %s", (value) => {
    expect(authRedirectUrl(value)).toBe(`${live}/?type=recovery`);
  });
});
