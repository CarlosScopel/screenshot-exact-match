from pathlib import Path
assert Path('src/lib/recording-transfers.ts').exists()
p=Path('src/lib/auth.tsx')
s=p.read_text()
old='''        await refreshSettings();
        if (
          !alive ||
          authEvents !== initialEvents ||
          sessionUserId.current !== (data.session?.user.id ?? null)
        )
          return;
        await loadUser(data.session);
        if (data.session) supabase.rpc("touch_last_seen");'''
new='''        await Promise.all([refreshSettings(), loadUser(data.session)]);
        if (alive && data.session && sessionUserId.current === data.session.user.id)
          supabase.rpc("touch_last_seen");'''
assert s.count(old)==1
p.write_text(s.replace(old,new))
p=Path('src/test/auth-focus.test.tsx')
s=p.read_text();pos=s.rindex('\n});')
s=s[:pos]+'''
  it("foco durante recuperação inicial não prende o carregamento", async () => {
    let resolve!: (value: null) => void;
    mocks.settings.mockResolvedValueOnce(null).mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    render(<AuthProvider><Form /></AuthProvider>);
    await waitFor(() => expect(mocks.settings).toHaveBeenCalledTimes(2));
    await act(async () => { callback("SIGNED_IN", session); resolve(null); });
    await screen.findByLabelText("Arquivo selecionado");
    expect(mocks.activate).toHaveBeenCalledOnce();
  });
'''+s[pos:]
p.write_text(s)
browser=Path('qa/validate-upload-browser.mjs')
source=browser.read_text().replace("import react from '@vitejs/plugin-react';", "import react from '@vitejs/plugin-react';\nimport tailwind from '@tailwindcss/vite';")
source=source.replace('}},react()],resolve:', '}},react(),tailwind()],resolve:')
old="resolve:{alias:{'@':path.join(root,'src')}}"
assert old in source
source=source.replace(old,"resolve:{alias:[...Object.entries(stubs).map(([find,file])=>({find,replacement:path.join(qa,file)})),{find:'@',replacement:path.join(root,'src')}]}")
source=source.replace('const server=http.createServer(async(req,res)=>{','const server=http.createServer(async(req,res)=>{try{')
old='  res.statusCode=405;res.end();\n});'
assert old in source
source=source.replace(old,"  res.statusCode=405;res.end();\n}catch(error){if(req.aborted || error.code==='ECONNRESET')return;console.error(error);res.statusCode=500;res.end('Isolated test server error');}\n});")
browser.write_text(source)
Path('tsconfig.qa-runtime.json').write_text('{"extends":"./tsconfig.json","compilerOptions":{"types":["vite/client","node"]},"include":["src"],"exclude":["src/test"]}')
