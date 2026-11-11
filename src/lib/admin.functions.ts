import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { APPLICATION_PENDING, PENDING_APPROVAL, REJECTED_APPROVAL } from "@/lib/approval";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Acesso negado");
}

/** Public: whether the platform already has an administrator (drives the first-run setup screen). */
export const getSetupState = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) throw new Error("Não foi possível verificar a configuração administrativa.");
  return { hasAdmin: (count ?? 0) > 0 };
});

/**
 * Public application: creates an account without credentials or an active session.
 * No access is possible before manual approval, and password setup is emailed
 * only after approval. Keeps normal signup disabled.
 */
export const requestMenteeAccess = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({
      name: z.string().trim().min(2).max(100),
      email: z.string().trim().email().max(255),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      user_metadata: { full_name: data.name },
      email_confirm: false,
      // Deliberately no password: nobody can log in while approval is pending.
    });
    if (error || !created.user) {
      if (/already|registered|exists|duplicate/i.test(error?.message || "")) {
        return { ok: true }; // Avoid disclosing existing accounts.
      }
      throw new Error("Não foi possível registrar sua solicitação. Tente novamente.");
    }
    const { data: pendingProfile, error: pendingError } = await supabaseAdmin.from("profiles")
      .update({
        status: "suspended",
        admin_notes: APPLICATION_PENDING,
        full_name: data.name,
      })
      .eq("id", created.user.id)
      .select("id")
      .single();
    if (pendingError || !pendingProfile) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error("Não foi possível proteger sua solicitação. Tente novamente.");
    }
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
    // Admission is denied until the administrator explicitly approves this invite.
    const { data: pendingProfile, error: pendingError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.name,
        status: "suspended",
        admin_notes: PENDING_APPROVAL,
        access_expires_at: data.expiresAt || null,
      })
      .eq("id", uid)
      .select("id")
      .single();
    if (pendingError || !pendingProfile) {
      // Do not leave a newly invited account active when admission cannot be secured.
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error("Não foi possível bloquear o acesso até a aprovação. Convite cancelado.");
    }
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

/** Review pending mentor invitations. Only admins can approve or reject. */
export const reviewMentee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      userId: z.string().uuid(),
      decision: z.enum(["approve", "reject"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Você não pode revisar sua própria conta.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: application } = await supabaseAdmin.from("profiles")
      .select("admin_notes,email")
      .eq("id", data.userId)
      .eq("status", "suspended")
      .in("admin_notes", [PENDING_APPROVAL, APPLICATION_PENDING])
      .maybeSingle();
    if (!application) throw new Error("Solicitação não encontrada ou já analisada.");
    const { data: reviewed, error } = await supabaseAdmin
      .from("profiles")
      .update({
        status: data.decision === "approve" ? "active" : "suspended",
        admin_notes: data.decision === "approve" ? null : REJECTED_APPROVAL,
      })
      .eq("id", data.userId)
      .eq("status", "suspended")
      .eq("admin_notes", application.admin_notes)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!reviewed) throw new Error("Solicitação não encontrada ou já analisada.");
    if (data.decision === "approve" && application.admin_notes === APPLICATION_PENDING) {
      const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        email_confirm: true,
      });
      if (confirmError) throw new Error("Acesso aprovado, mas não foi possível liberar a confirmação do e-mail.");
      const { error: emailError } = await supabaseAdmin.auth.resetPasswordForEmail(application.email);
      return { ok: true, needsPasswordEmail: !!emailError };
    }
    return { ok: true, needsPasswordEmail: false };
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
