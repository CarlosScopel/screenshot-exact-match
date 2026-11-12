from pathlib import Path
import subprocess

path = Path('src/components/portal/AdminPage.tsx')
assert subprocess.check_output(['git', 'hash-object', str(path)], text=True).strip() == '9e460f4355979035601ee9372b2754d2a65e0d3e', 'Source changed since inspection'
source = path.read_text()
start = source.index('function Mentees(')
end = source.index('function SettingsEditor(', start)
s = source[start:end]

def replace_once(old, new):
    global s
    assert s.count(old) == 1, 'Ambiguous or missing anchor: ' + old[:100]
    s = s.replace(old, new)

replace_once('''        title="Mentorados"
        subtitle="Analise novos cadastros e controle quem pode acessar a plataforma."''', '''        title={selected ? "Gerenciar mentorado" : "Mentorados"}
        subtitle={selected ? selected.email : "Analise novos cadastros e controle quem pode acessar a plataforma."}''')
a = s.index('      <section className="surface p-5 mb-6" aria-label="Solicitações aguardando aprovação">')
b = s.index('      <Notice text={message} />', a)
block = s[a:b]
s = s[:a] + '      {!selected && (\n        <>\n' + ''.join('    ' + line if line.strip() else line for line in block.splitlines(keepends=True)) + '        </>\n      )}\n' + s[b:]
replace_once('''          <div className="flex justify-between mb-5">''', '''          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">''')
replace_once('''            <button onClick={() => setSelected(null)}>Fechar</button>''', '''            <button
              type="button"
              className="portal-outline"
              onClick={() => {
                setSelected(null);
                setMessage("");
              }}
            >
              <ArrowLeft className="size-4" />
              Voltar aos mentorados
            </button>''')
replace_once('''                  <button className="text-primary" onClick={() => setSelected(p)}>''', '''                  <button
                    className="text-primary"
                    onClick={() => {
                      setMessage("");
                      setSelected(p);
                    }}
                  >''')
a = s.index('      <div className="surface overflow-x-auto mt-5">')
b = s.rindex('    </div>\n  );\n}')
block = s[a:b]
s = s[:a] + '      {!selected && (\n' + ''.join('  ' + line if line.strip() else line for line in block.splitlines(keepends=True)) + '      )}\n' + s[b:]
path.write_text(source[:start] + s + source[end:])
