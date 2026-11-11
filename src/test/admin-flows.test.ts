import { beforeEach, describe, expect, it, vi } from "vitest";
import { APPLICATION_PENDING, PENDING_APPROVAL, REJECTED_APPROVAL } from "@/lib/approval";

const db = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  auth: {
    admin: {
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      inviteUserByEmail: vi.fn(),
      updateUserById: vi.fn(),
      listUsers: vi.fn(),
    },
    resetPasswordForEmail: vi.fn(),
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    type Builder = {
      middleware: () => Builder;
      inputValidator: (parser: typeof validate) => Builder;
      handler: (
        handler: (args: { data: unknown; context: unknown }) => unknown,
      ) => (args?: { data?: unknown; context?: unknown }) => unknown;
    };
    const builder: Builder = {
      middleware: () => builder,
      inputValidator: (parser: typeof validate) => {
        validate = parser;
        return builder;
      },
      handler:
        (handler: (args: { data: unknown; context: unknown }) => unknown) =>
        (args: { data?: unknown; context?: unknown } = {}) =>
          handler({ data: validate(args.data), context: args.context }),
    };
    return builder;
  },
}));
import {
  requestMenteeAccess,
  inviteMentee,
  reviewMentee,
  setUserRole,
  deleteMentee,
} from "@/lib/admin.functions";

const uid = "11111111-1111-4111-8111-111111111111";
const adminId = "22222222-2222-4222-8222-222222222222";
function query(result: { data?: unknown; error?: unknown }) {
  type Query = {
    select: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: (resolve: (value: typeof result) => unknown) => Promise<unknown>;
  };
  const q: Query = {
    select: vi.fn(() => q),
    update: vi.fn(() => q),
    insert: vi.fn(() => q),
    upsert: vi.fn(() => q),
    delete: vi.fn(() => q),
    eq: vi.fn(() => q),
    in: vi.fn(() => q),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return q;
}
async function run(fn: unknown, data: unknown) {
  return (fn as (args: { data: unknown; context: unknown }) => Promise<unknown>)({
    data,
    context: { supabase: db, userId: adminId },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  db.rpc.mockResolvedValue({ data: true, error: null });
  db.from.mockImplementation(() => query({ data: { id: uid }, error: null }));
  db.auth.admin.createUser.mockResolvedValue({ data: { user: { id: uid } }, error: null });
  db.auth.admin.inviteUserByEmail.mockResolvedValue({ data: { user: { id: uid } }, error: null });
  db.auth.admin.deleteUser.mockResolvedValue({ error: null });
  db.auth.admin.updateUserById.mockResolvedValue({ data: { user: { id: uid } }, error: null });
  db.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
});

describe("Solicitação de entrada: execução dos handlers com backend simulado", () => {
  it("cria conta sem senha, sem confirmação automática e bloqueia o perfil", async () => {
    const q = query({ data: { id: uid }, error: null });
    db.from.mockReturnValue(q);
    await expect(
      run(requestMenteeAccess, { name: "Aluno Teste", email: "aluno@example.test" }),
    ).resolves.toEqual({ ok: true });
    expect(db.auth.admin.createUser).toHaveBeenCalledWith({
      email: "aluno@example.test",
      email_confirm: false,
      user_metadata: { full_name: "Aluno Teste" },
    });
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "suspended", admin_notes: APPLICATION_PENDING }),
    );
    expect(db.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("não revela se um e-mail já existe", async () => {
    db.auth.admin.createUser.mockResolvedValue({
      data: {},
      error: { message: "User already registered" },
    });
    await expect(
      run(requestMenteeAccess, { name: "Aluno Teste", email: "aluno@example.test" }),
    ).resolves.toEqual({ ok: true });
    expect(db.from).not.toHaveBeenCalled();
  });
  it("remove somente a conta recém-criada quando não consegue bloquear o perfil", async () => {
    db.from.mockReturnValue(query({ data: null, error: new Error("unavailable") }));
    await expect(
      run(requestMenteeAccess, { name: "Aluno Teste", email: "aluno@example.test" }),
    ).rejects.toThrow("proteger");
    expect(db.auth.admin.deleteUser).toHaveBeenCalledWith(uid);
  });
  it("valida nome e e-mail antes de criar qualquer registro", async () => {
    await expect(run(requestMenteeAccess, { name: "A", email: "inválido" })).rejects.toThrow();
    expect(db.auth.admin.createUser).not.toHaveBeenCalled();
  });
});

describe("Aprovação administrativa no servidor", () => {
  it("nega a análise feita por alguém sem papel de administrador", async () => {
    db.rpc.mockResolvedValue({ data: false, error: null });
    await expect(run(reviewMentee, { userId: uid, decision: "approve" })).rejects.toThrow(
      "Acesso negado",
    );
    expect(db.from).not.toHaveBeenCalled();
  });
  it("falha de forma fechada se a consulta de permissão retornar erro", async () => {
    db.rpc.mockResolvedValue({ data: true, error: new Error("database unavailable") });
    await expect(run(reviewMentee, { userId: uid, decision: "approve" })).rejects.toThrow(
      "Acesso negado",
    );
    expect(db.from).not.toHaveBeenCalled();
  });
  it("não permite autoaprovação", async () => {
    await expect(run(reviewMentee, { userId: adminId, decision: "approve" })).rejects.toThrow(
      "própria conta",
    );
  });
  it("aprova somente uma solicitação ainda pendente e solicita o e-mail de senha", async () => {
    const read = query({
      data: { admin_notes: APPLICATION_PENDING, email: "aluno@example.test" },
      error: null,
    });
    const write = query({ data: { id: uid }, error: null });
    db.from.mockReturnValueOnce(read).mockReturnValueOnce(write);
    await expect(run(reviewMentee, { userId: uid, decision: "approve" })).resolves.toEqual({
      ok: true,
      needsPasswordEmail: false,
    });
    expect(write.update).toHaveBeenCalledWith({ status: "active", admin_notes: null });
    expect(write.eq).toHaveBeenCalledWith("status", "suspended");
    expect(write.eq).toHaveBeenCalledWith("admin_notes", APPLICATION_PENDING);
    expect(db.auth.resetPasswordForEmail).toHaveBeenCalledWith("aluno@example.test");
  });
  it("mantém a recusa bloqueada e não envia e-mail de acesso", async () => {
    const write = query({ data: { id: uid }, error: null });
    db.from
      .mockReturnValueOnce(
        query({ data: { admin_notes: PENDING_APPROVAL, email: "aluno@example.test" } }),
      )
      .mockReturnValueOnce(write);
    await run(reviewMentee, { userId: uid, decision: "reject" });
    expect(write.update).toHaveBeenCalledWith({
      status: "suspended",
      admin_notes: REJECTED_APPROVAL,
    });
    expect(db.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("não reaplica uma decisão já tomada", async () => {
    db.from.mockReturnValue(query({ data: null, error: null }));
    await expect(run(reviewMentee, { userId: uid, decision: "approve" })).rejects.toThrow(
      "já analisada",
    );
  });
  it("informa falha de envio de e-mail em vez de declarar entrega", async () => {
    db.from
      .mockReturnValueOnce(
        query({ data: { admin_notes: APPLICATION_PENDING, email: "aluno@example.test" } }),
      )
      .mockReturnValueOnce(query({ data: { id: uid } }));
    db.auth.resetPasswordForEmail.mockResolvedValue({ error: new Error("mailer unavailable") });
    await expect(run(reviewMentee, { userId: uid, decision: "approve" })).resolves.toEqual({
      ok: true,
      needsPasswordEmail: true,
    });
  });
});

describe("Convites e gestão de papéis", () => {
  it("mantém convidados pendentes até a análise", async () => {
    const q = query({ data: { id: uid }, error: null });
    db.from.mockReturnValue(q);
    await run(inviteMentee, {
      name: "Aluno Teste",
      email: "aluno@example.test",
      redirectTo: "https://example.test",
    });
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "suspended", admin_notes: PENDING_APPROVAL }),
    );
  });
  it("informa falhas de vínculo a turmas sem fingir sucesso", async () => {
    db.from
      .mockReturnValueOnce(query({ data: { id: uid } }))
      .mockReturnValueOnce(query({ error: new Error("denied") }));
    await expect(
      run(inviteMentee, {
        name: "Aluno Teste",
        email: "aluno@example.test",
        cohortIds: [adminId],
        redirectTo: "https://example.test",
      }),
    ).rejects.toThrow("turmas");
  });
  it("usa a chave composta ao atribuir um papel", async () => {
    const q = query({ error: null });
    db.from.mockReturnValue(q);
    await run(setUserRole, { userId: uid, role: "mentorado", enabled: true });
    expect(q.upsert).toHaveBeenCalledWith(
      { user_id: uid, role: "mentorado" },
      { onConflict: "user_id,role" },
    );
  });
  it("não declara permissão salva quando o banco falha", async () => {
    db.from.mockReturnValue(query({ error: new Error("unavailable") }));
    await expect(
      run(setUserRole, { userId: uid, role: "mentorado", enabled: true }),
    ).rejects.toThrow("permissão");
  });
  it("impede excluir a própria conta administrativa", async () => {
    await expect(run(deleteMentee, { userId: adminId })).rejects.toThrow("própria conta");
    expect(db.auth.admin.deleteUser).not.toHaveBeenCalled();
  });
});
