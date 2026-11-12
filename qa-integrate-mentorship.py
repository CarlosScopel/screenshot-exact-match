from pathlib import Path
import subprocess

def replace(path, before, after):
    p=Path(path); text=p.read_text()
    assert text.count(before)==1, f'Expected one anchor in {path}: {before[:90]}'
    p.write_text(text.replace(before,after))

assert subprocess.check_output(['git','hash-object','src/components/portal/Portal.tsx'],text=True).strip()=='bac7b2a61debe7b6ea70c486b3ebf8d20f9f141e'
assert subprocess.check_output(['git','hash-object','src/components/portal/AdminPage.tsx'],text=True).strip()=='1e307db34bba43e6bbbe08a56e1c0604b7ba8be6'
portal='src/components/portal/Portal.tsx'
admin='src/components/portal/AdminPage.tsx'
replace(portal,'import { LessonFiles } from "./LessonFiles";','import { LessonFiles } from "./LessonFiles";\nimport { MentorshipPanel } from "./MentorshipPanel";\nimport { accountCanAccess } from "@/lib/mentorship";\nimport { useMentorshipAccount } from "@/lib/use-mentorship";')
for path in [portal,admin]:
    replace(path,'  | "profile"','  | "profile"\n  | "billing"')
replace(portal,'  { id: "profile", name: "Meu perfil", icon: Users },','  { id: "billing", name: "Meu plano e pagamentos", icon: FileText },\n  { id: "profile", name: "Meu perfil", icon: Users },')
replace(portal,'  const currentUserId = session?.user.id;','  const currentUserId = session?.user.id;\n  const membership = useMentorshipAccount(currentUserId || null, !!currentUserId && !isAdmin && !demo && !loading);\n  const memberAllowed = !!membership.account && !membership.error && accountCanAccess(membership.account, membership.now);')
replace(portal,'  const canLoad = !!currentUserId && (isAdmin || !isMemberBlocked(profile));','  const canLoad = !!currentUserId && (isAdmin || memberAllowed);')
replace(portal,'  if (!demo && isMemberBlocked(profile) && !isAdmin)','  if (!demo && !isAdmin && session && (!membership.account || membership.error))\n    return (\n      <div className="min-h-screen grid place-content-center p-6 text-center">\n        <p role={membership.error ? "alert" : "status"}>{membership.error || "Verificando prazo da mentoria..."}</p>\n        {membership.error && <button className="portal-outline mt-4" onClick={() => void membership.refresh()}>Tentar novamente</button>}\n        <button className="portal-outline mt-4" onClick={() => void supabase.auth.signOut()}>Sair</button>\n      </div>\n    );\n  if (!demo && !memberAllowed && !isAdmin)')
replace(portal,'      <div className="min-h-screen grid place-content-center text-center p-6">','      <div className="min-h-screen max-w-5xl mx-auto text-center p-6">')
replace(portal,'        <button\n          className="portal-outline mx-auto mt-6"','        {currentUserId && membership.account?.status === "active" && <div className="mt-6"><MentorshipPanel key={currentUserId} userId={currentUserId} /></div>}\n        <button\n          className="portal-outline mx-auto mt-6"')
replace(portal,'  if (page === "profile" && demo)','  if (page === "billing") return demo ? <Empty title="Meu plano e pagamentos" description="Os dados financeiros reais ficam disponíveis somente na conta autenticada do mentorado." /> : <MentorshipPanel key={userId} userId={userId} />;\n  if (page === "profile" && demo)')
replace(admin,'import { approvalState } from "@/lib/approval";','import { approvalState } from "@/lib/approval";\nimport { MentorshipPanel } from "./MentorshipPanel";')
replace(admin,'        access_expires_at: String(f.get("expires")) || null,\n','')
replace(admin,'          <form onSubmit={saveProfile} className="grid md:grid-cols-4 gap-3">','          <form onSubmit={saveProfile} className="grid md:grid-cols-3 gap-3">')
replace(admin,'''            <input
              className="portal-input"
              type="date"
              name="expires"
              defaultValue={selected["access_expires_at"]?.slice(0, 10) || ""}
            />
''','')
replace(admin,'          <h3 className="font-semibold mt-6 mb-3">Acesso individual aos treinamentos</h3>','          <div className="mt-6"><MentorshipPanel key={selected["id"]} userId={selected["id"]} admin onChanged={reload} /></div>\n          <h3 className="font-semibold mt-6 mb-3">Acesso individual aos treinamentos</h3>')
replace(admin,'                        ? "Ativo"','                        ? (p.access_expires_at && Date.parse(p.access_expires_at) <= Date.now() ? "Prazo encerrado" : "Ativo")')
# Preserve the existing lesson-view test's authenticated fixture; entitlement is tested separately.
replace('src/test/lesson-file-page.test.tsx','vi.mock("@/components/portal/AdminPage", () => ({ AdminPage: () => null }));','vi.mock("@/lib/use-mentorship", () => ({ useMentorshipAccount: () => ({ account: { user_id: "student", status: "active", plans: [], legacy_expires_at: null }, error: "", loading: false, now: Date.now(), refresh: vi.fn() }) }));\nvi.mock("@/components/portal/AdminPage", () => ({ AdminPage: () => null }));')
# Bind only when invoked so importing a component never starts any backend work.
p=Path('src/lib/mentorship-api.ts'); s=p.read_text(); line='const callRpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;\n'
assert s.count(line)==1
s=s.replace(line,'').replace('async function invoke(name: string, args: Record<string, unknown>) {','async function invoke(name: string, args: Record<string, unknown>) {\n  '+line.strip())
p.write_text(s)
