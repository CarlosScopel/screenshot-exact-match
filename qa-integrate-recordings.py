from pathlib import Path
import subprocess
for file,sha in [('src/components/portal/AdminPage.tsx','3ffd28d6b6c69bb9adb9af81e3a3dc24dbec97b0'),('src/components/portal/Portal.tsx','4499d6466c0084f9b02675480e8cb5260e969a4a')]:
 p=Path(file)
 assert subprocess.check_output(['git','hash-object',str(p)],text=True).strip()==sha,'Source changed since inspection'
 s=p.read_text()
 def replace(old,new):
  global s
  assert s.count(old)==1,old
  s=s.replace(old,new)
 replace('import { MentorshipPanel } from "./MentorshipPanel";','import { MentorshipPanel } from "./MentorshipPanel";\nimport { RecordingsPanel } from "./RecordingsPanel";')
 replace('  | "billing"\n','  | "billing"\n  | "recordings"\n')
 if 'AdminPage' in file:
  anchor='          <h3 className="font-semibold mt-6 mb-3">Acesso individual aos treinamentos</h3>'
  replace(anchor,'          <div className="mt-6">\n            <RecordingsPanel key={"recordings-" + selected.id} userId={selected.id} admin />\n          </div>\n'+anchor)
 else:
  replace('  Moon,\n','  Moon,\n  Video,\n')
  replace('  { id: "trainings", name: "Treinamentos", icon: GraduationCap },','  { id: "trainings", name: "Treinamentos", icon: GraduationCap },\n  { id: "recordings", name: "Minhas gravações", icon: Video },')
  replace('  if (page === "billing")','  if (page === "recordings")\n    return demo ? <Empty title="Minhas gravações" description="As calls são privadas e aparecem somente na conta autenticada de cada mentorado." /> : <RecordingsPanel key={userId} userId={userId} />;\n  if (page === "billing")')
 p.write_text(s)
p=Path('src/test/mentee-detail.test.tsx');s=p.read_text();anchor='const ids = [';assert s.count(anchor)==1;s=s.replace(anchor,'vi.mock("@/components/portal/RecordingsPanel", () => ({ RecordingsPanel: () => null }));\n'+anchor);p.write_text(s)
