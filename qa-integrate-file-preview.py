from pathlib import Path
import subprocess

path = Path('src/components/portal/Portal.tsx')
assert subprocess.check_output(['git','hash-object',str(path)], text=True).strip() == 'b7882c137762861b0a4da22d2420f4f78d8b9218', 'Portal changed since inspection'
s = path.read_text()
a = 'import { AdminPage } from "./AdminPage";'
assert s.count(a) == 1
s = s.replace(a, a + '\nimport { LessonFiles } from "./LessonFiles";')
a = '  const source = videoSource(lesson.video_url);'
assert s.count(a) == 1
s = s.replace(a, a + '\n  const lessonMaterials = data.materials.filter((material) => material.lesson_id === id);')
a = '          <div className="aspect-video bg-black rounded-2xl border overflow-hidden flex items-center justify-center">'
assert s.count(a) == 1
start = s.index(a)
end = s.index('          <section className="surface p-6">', start)
old = s[start:end]
s = s[:start] + '          {!source && lessonMaterials.length > 0 ? (\n            <LessonFiles materials={lessonMaterials} />\n          ) : (\n' + old + '          )}\n' + s[end:]
start = s.index('          {data.materials\n            .filter((m) => m.lesson_id === id)')
end = s.index('\n        </div>\n        <aside', start)
s = s[:start] + '          {source && lessonMaterials.length > 0 && (\n            <LessonFiles materials={lessonMaterials} />\n          )}' + s[end:]
path.write_text(s)
