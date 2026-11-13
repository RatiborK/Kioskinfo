// desktop/scripts/stage.cjs — copy only built code and public assets into the EXE payload.
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const desktop = path.resolve(__dirname, '..');
  const root = path.resolve(desktop, '..');
  const output = path.join(desktop, 'bundled');
  const api = path.join(root, 'apps', 'api', 'dist');
  const web = path.join(root, 'apps', 'web', 'dist');
  await Promise.all([fs.access(path.join(api, 'app.js')), fs.access(path.join(web, 'index.html'))]);
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  await fs.cp(api, path.join(output, 'api'), { recursive: true });
  await fs.cp(web, path.join(output, 'web'), { recursive: true });
  await fs.writeFile(path.join(output, 'api', 'package.json'), '{"type":"module"}\n');
  process.stdout.write('Desktop stage: API and web copied into desktop/bundled\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
