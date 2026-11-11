import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Acesso negado");
}

/** Public: whether the platform already has an administrator (drives the first-run setup screen). */
export const getSetupState = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  return { hasAdmin: (count ?? 0) > 0 };
});

/** Public, but only works once: creates the first administrator while no admin exists. */
export const createFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.string().trim().email().max(255),
        password: z.string().min(8).max(72),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("A plataforma já possui um administrador.");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Falha ao criar usuário");
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "admin" });
    return { ok: true };
  });

const inviteSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  cohortIds: z.array(z.string().uuid()).default([]),
  trainingIds: z.array(z.string().uuid()).default([]),
  expiresAt: z.string().nullable().optional(),
  redirectTo: z.string().url(),
});

export const inviteMentee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => inviteSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.name },
      redirectTo: data.redirectTo,
    });
    if (error || !inv.user) throw new Error(error?.message ?? "Não foi possível enviar o convite");
    const uid = inv.user.id;
    await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.name, access_expires_at: data.expiresAt || null })
      .eq("id", uid);
    if (data.cohortIds.length)
      await supabaseAdmin
        .from("cohort_members")
        .upsert(data.cohortIds.map((c) => ({ cohort_id: c, user_id: uid })));
    if (data.trainingIds.length)
      await supabaseAdmin
        .from("training_grants")
        .upsert(data.trainingIds.map((t) => ({ training_id: t, user_id: uid })));
    return { userId: uid };
  });

export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ email: z.string().email(), redirectTo: z.string().url() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const u = list?.users.find((x) => x.email?.toLowerCase() === data.email.toLowerCase());
    if (u?.email_confirmed_at || u?.last_sign_in_at) {
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(data.email, {
        redirectTo: data.redirectTo,
      });
      if (error) throw new Error(error.message);
      return { kind: "reset" as const };
    }
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: data.redirectTo,
    });
    if (error) throw new Error(error.message);
    return { kind: "invite" as const };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "mentorado", "suporte", "moderador"]),
        enabled: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId && data.role === "admin" && !data.enabled)
      throw new Error("Você não pode remover seu próprio acesso de administrador.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.enabled)
      await supabaseAdmin.from("user_roles").upsert({ user_id: data.userId, role: data.role });
    else
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role);
    return { ok: true };
  });

export const deleteMentee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Você não pode excluir sua própria conta.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
