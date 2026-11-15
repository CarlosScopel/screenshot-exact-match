from pathlib import Path
import base64,gzip,hashlib,subprocess
text=Path('qa/upload-continuity.patch.b64').read_text()
assert hashlib.sha256(text.encode()).hexdigest()=='e16a09a888a348e941b4ba47e88c99fc294be1335129a55e16ee45f874a17cfc'
corrections=[[220,221,'D','d'],[1239,1240,'S',''],[2520,2522,'2V',''],[3086,3091,'sw6vk','8'],[5353,5356,'T7b','p'],[9532,9532,'','rWzvH3NyX1'],[16225,16227,'ef','']]
for start,end,old,new in reversed(corrections):
 assert text[start:end]==old
 text=text[:start]+new+text[end:]
content=gzip.decompress(base64.b64decode(text))
assert hashlib.sha256(content).hexdigest()=='f9f8359816eb561d7e231ad2000fedb933771ddffde2649373e2740546e763ba'
Path('/tmp/upload.patch').write_bytes(content)
subprocess.run(['git','apply','--check','/tmp/upload.patch'],check=True)
subprocess.run(['git','apply','/tmp/upload.patch'],check=True)
subprocess.run(['python3','qa/refine-upload.py'],check=True)
browser=Path('qa/validate-upload-browser.mjs')
source=browser.read_text().replace("import react from '@vitejs/plugin-react';", "import react from '@vitejs/plugin-react';\nimport tailwind from '@tailwindcss/vite';")
source=source.replace('}},react()],resolve:', '}},react(),tailwind()],resolve:')
browser.write_text(source)
Path('tsconfig.qa-runtime.json').write_text('{"extends":"./tsconfig.json","compilerOptions":{"types":["vite/client","node"]},"include":["src"],"exclude":["src/test"]}')
