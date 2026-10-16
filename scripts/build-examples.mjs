import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
for (const name of ['browser-minimal', 'skykit']) {
  await mkdir(`.cache/examples/${name}`, { recursive: true });
  await build({ entryPoints: [`examples/${name}/main.js`], bundle: true, platform: 'browser', format: 'esm', target: 'es2022', outfile: `.cache/examples/${name}/main.js` });
  await copyFile(`examples/${name}/index.html`, `.cache/examples/${name}/index.html`);
}
process.stdout.write('Browser and SkyKit examples built.\n');
