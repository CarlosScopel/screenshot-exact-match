from pathlib import Path

root = Path.cwd()
p = root / 'src/lib/admin.functions.ts'
s = p.read_text()
s = s.replace('import { z } from "zod";', 'import { z } from "zod";\nimport type { SupabaseClient } from "@supabase/supabase-js";\nimport type { Database } from "@/integrations/supabase/types";')
s = s.replace('supabase: any; userId: string', 'supabase: SupabaseClient<Database>; userId: string')
s = s.replace('const { data } = await ctx.supabase.rpc', 'const { data, error } = await ctx.supabase.rpc').replace('if (!data) throw new Error("Acesso negado");', 'if (error || !data) throw new Error("Acesso negado");')
old = '''    if (data.cohortIds.length)
      await supabaseAdmin
        .from("cohort_members")
        .upsert(data.cohortIds.map((c) => ({ cohort_id: c, user_id: uid })));
    if (data.trainingIds.length)
      await supabaseAdmin
        .from("training_grants")
        .upsert(data.trainingIds.map((t) => ({ training_id: t, user_id: uid })));'''
new = '''    if (data.cohortIds.length) {
      const { error: cohortError } = await supabaseAdmin
        .from("cohort_members")
        .upsert(data.cohortIds.map((c) => ({ cohort_id: c, user_id: uid })), { onConflict: "cohort_id,user_id" });
      if (cohortError) throw new Error("Convite criado, mas não foi possível vincular as turmas. O acesso continua pendente.");
    }
    if (data.trainingIds.length) {
      const { error: grantError } = await supabaseAdmin
        .from("training_grants")
        .upsert(data.trainingIds.map((t) => ({ training_id: t, user_id: uid })), { onConflict: "training_id,user_id" });
      if (grantError) throw new Error("Convite criado, mas não foi possível vincular os treinamentos. O acesso continua pendente.");
    }'''
assert old in s, 'Unexpected invite implementation; stop without guessing'
s = s.replace(old, new)
old = '''    if (data.enabled)
      await supabaseAdmin.from("user_roles").upsert({ user_id: data.userId, role: data.role });
    else
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role);
    return { ok: true };'''
new = '''    const { error } = data.enabled
      ? await supabaseAdmin.from("user_roles").upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" })
      : await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role);
    if (error) throw new Error("Não foi possível atualizar a permissão do usuário.");
    return { ok: true };'''
assert old in s, 'Unexpected role implementation'
s = s.replace(old, new)
p.write_text(s)
p = root / 'eslint.config.js'
s = p.read_text()
old = '  eslintPluginPrettier,\n);'
assert old in s
s = s.replace(old, '''  eslintPluginPrettier,
  {
    // Lovable owns generated files: retain code checks without rewriting their formatting.
    files: ["src/integrations/supabase/**/*.{ts,tsx}"],
    rules: { "prettier/prettier": "off" },
  },
);''')
p.write_text(s)
p = root / 'src/components/portal/Portal.tsx'
s = p.read_text().replace('import { useEffect, useRef, useState }', 'import { useCallback, useEffect, useRef, useState }')
start = s.index('  const reload = async () => {')
end = s.index('  const navigate =', start)
s = s[:start] + '''  const currentUserId = session?.user.id;
  const dataRequest = useRef(0);
  const canLoad = !!currentUserId && (isAdmin || !isMemberBlocked(profile));
  const reload = useCallback(async () => {
    const request = ++dataRequest.current;
    if (!currentUserId || !canLoad) { setData(emptyData); setFetching(false); return; }
    setFetching(true);
    try {
      const result = await loadPortalData(currentUserId, isAdmin);
      if (request === dataRequest.current) { setData(result); setError(""); }
    } catch (e) {
      if (request === dataRequest.current) setError(e instanceof Error ? e.message : "Erro ao carregar dados.");
    } finally { if (request === dataRequest.current) setFetching(false); }
  }, [currentUserId, canLoad, isAdmin]);
  useEffect(() => {
    setData(emptyData);
    if (!loading) void reload();
    return () => { dataRequest.current += 1; };
  }, [loading, reload]);
''' + s[end:]
p.write_text(s)
p = root / 'src/components/portal/AccessScreen.tsx'
s = p.read_text()
old = '    return () => { alive = false; };\n  }, []);'
assert old in s
s = s.replace(old, '    return () => { alive = false; };\n  }, [forceRecovery]);')
p.write_text(s)
p = root / '.github/workflows/verify.yml'
s = p.read_text()
assert 'defaults:' not in s
s = s.replace('permissions:\n  contents: read', 'defaults:\n  run:\n    shell: bash\n\npermissions:\n  contents: read')
p.write_text(s)
print('Applied scoped release fixes; owner grants, database migrations and dependencies unchanged.')
