from pathlib import Path
p=Path('src/lib/auth.tsx')
s=p.read_text()
old='        await refreshSettings();\n        await loadUser(data.session);'
assert s.count(old)==1
s=s.replace(old,'        await refreshSettings();\n        if (!alive || authEvents !== initialEvents || sessionUserId.current !== (data.session?.user.id ?? null)) return;\n        await loadUser(data.session);')
p.write_text(s)
p=Path('src/test/recordings-size-limit.test.ts')
s=p.read_text()
for index in (1,2):
 s=s.replace(f'fetchMock.mock.calls[{index}][1]',f'fetchMock.mock.calls[{index}]?.[1]')
p.write_text(s)
