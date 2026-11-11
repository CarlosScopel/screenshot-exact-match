from pathlib import Path
p = Path('src/test/admin-ui.test.tsx')
s = p.read_text().replace('cleanup(); vi.restoreAllMocks();', 'cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();')
old = '''    fireEvent.change(screen.getByLabelText("Arquivo privado"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar arquivo" }));'''
new = '''    const input = screen.getByLabelText("Arquivo privado");
    fireEvent.change(input, { target: { files: [file] } });
    // jsdom does not serialize a synthetic input.files assignment into FormData.
    // Preserve native FormData for text fields, explicitly supplying the selected test file.
    const NativeFormData = globalThis.FormData;
    vi.stubGlobal("FormData", class extends NativeFormData {
      constructor(form?: HTMLFormElement) {
        super(form);
        if (form?.contains(input)) this.set("file", file);
      }
    });
    fireEvent.submit(input.closest("form")!);'''
assert old in s, 'Unexpected upload test fixture'
p.write_text(s.replace(old,new))
