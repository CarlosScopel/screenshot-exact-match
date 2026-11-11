import { describe, expect, it } from "vitest";
import { createDemoPortalData, DEMO_EMAIL, DEMO_PASSWORD, DEMO_USER_ID } from "@/lib/demo";

describe("Conta de demonstração", () => {
  it("apresenta conteúdo fictício sem nenhum usuário real", () => {
    const data = createDemoPortalData();
    expect(data.trainings.length).toBeGreaterThan(0);
    expect(data.lessons.length).toBeGreaterThan(0);
    expect(data.profiles).toEqual([]);
    expect(data.trainingGrants).toEqual([]);
    expect(data.progress.every((item) => item.user_id === DEMO_USER_ID)).toBe(true);
  });

  it("permite criar uma prévia independente em cada entrada", () => {
    const first = createDemoPortalData();
    first.progress.splice(0);
    expect(createDemoPortalData().progress.length).toBeGreaterThan(0);
  });

  it("utiliza credenciais que identificam explicitamente a demonstração", () => {
    expect(DEMO_EMAIL).toContain("demo");
    expect(DEMO_PASSWORD.length).toBeGreaterThanOrEqual(8);
  });
});
