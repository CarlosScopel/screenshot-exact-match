import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), single: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from, rpc: mock.rpc } }));
import { loadPlatformSettings } from "@/lib/platform-settings";

beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: mock.single };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mock.from.mockReturnValue(query);
  mock.rpc.mockResolvedValue({ data: { platform_name: "A ORDEM" }, error: null });
});

describe("Settings visibility", () => {
  it("does not query private settings while signed out", async () => {
    const result = await loadPlatformSettings(false);
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledWith("get_public_branding");
    expect(result?.support_email).toBeNull();
    expect(result?.support_whatsapp).toBeNull();
  });

  it("loads private settings through the authenticated RLS read", async () => {
    mock.single.mockResolvedValue({ data: { id: 1, support_email: "support@example.test" }, error: null });
    const result = await loadPlatformSettings(true);
    expect(mock.from).toHaveBeenCalledWith("platform_settings");
    expect(result?.support_email).toBe("support@example.test");
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("falls back to public branding when a signed-in user has no private access", async () => {
    mock.single.mockResolvedValue({ data: null, error: null });
    const result = await loadPlatformSettings(true);
    expect(mock.rpc).toHaveBeenCalledWith("get_public_branding");
    expect(result?.support_email).toBeNull();
  });
});