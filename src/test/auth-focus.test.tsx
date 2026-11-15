import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/lib/auth";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  subscribe: vi.fn(),
  activate: vi.fn(),
  settings: vi.fn(),
  owner: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/recording-transfers", () => ({ setRecordingUploadOwner: mocks.owner }));
vi.mock("@/lib/owner.functions", () => ({ activateOwnerAccess: mocks.activate }));
vi.mock("@/lib/platform-settings", () => ({ loadPlatformSettings: mocks.settings }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: mocks.getSession, onAuthStateChange: mocks.subscribe },
    from: mocks.from,
    rpc: vi.fn(),
  },
}));
const session = { user: { id: "admin-a" }, access_token: "test-token" };
let callback: (event: string, session: unknown) => void;
function Form() {
  const { loading, session } = useAuth();
  return loading ? (
    <p>Carregando</p>
  ) : session ? (
    <input aria-label="Arquivo selecionado" defaultValue="" />
  ) : (
    <p>Sem sessão</p>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session } });
  mocks.subscribe.mockImplementation((cb) => {
    callback = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  mocks.activate.mockResolvedValue(undefined);
  mocks.settings.mockResolvedValue(null);
  mocks.from.mockImplementation((table) => ({
    select: () => ({
      eq: (_key: string, id: string) =>
        table === "profiles"
          ? { maybeSingle: async () => ({ data: { id, status: "active" }, error: null }) }
          : Promise.resolve({ data: [{ role: "admin" }], error: null }),
    }),
  }));
});
afterEach(cleanup);
describe("Sessão ao alternar abas", () => {
  it.each(["SIGNED_IN", "TOKEN_REFRESHED"])(
    "%s da mesma conta preserva o formulário e evita recarga de permissões",
    async (event) => {
      render(
        <AuthProvider>
          <Form />
        </AuthProvider>,
      );
      const input = await screen.findByLabelText("Arquivo selecionado");
      fireEvent.change(input, { target: { value: "call.mp4" } });
      mocks.activate.mockClear();
      mocks.settings.mockClear();
      await act(async () => {
        callback(event, { ...session, access_token: "new-test-token" });
        await new Promise((r) => setTimeout(r, 5));
      });
      expect(screen.getByLabelText("Arquivo selecionado")).toBe(input);
      expect(input).toHaveValue("call.mp4");
      expect(mocks.activate).not.toHaveBeenCalled();
      expect(mocks.settings).not.toHaveBeenCalled();
    },
  );
  it("logout invalida a conta dos envios e remove os dados privados", async () => {
    render(
      <AuthProvider>
        <Form />
      </AuthProvider>,
    );
    await screen.findByLabelText("Arquivo selecionado");
    act(() => callback("SIGNED_OUT", null));
    await screen.findByText("Sem sessão");
    expect(mocks.owner).toHaveBeenLastCalledWith(null);
  });
  it("conta diferente refaz validação e não preserva o formulário anterior", async () => {
    render(
      <AuthProvider>
        <Form />
      </AuthProvider>,
    );
    const input = await screen.findByLabelText("Arquivo selecionado");
    mocks.activate.mockClear();
    act(() => callback("SIGNED_IN", { user: { id: "admin-b" } }));
    await waitFor(() => expect(mocks.activate).toHaveBeenCalledOnce());
    await screen.findByLabelText("Arquivo selecionado");
    expect(screen.getByLabelText("Arquivo selecionado")).not.toBe(input);
    expect(mocks.owner).toHaveBeenLastCalledWith("admin-b");
  });
});
