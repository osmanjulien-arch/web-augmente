const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = [
  'src/core/modules/toolbox.js',
  'src/core/modules/copy.js',
  'src/core/modules/feeds.js',
  'src/core/modules/source.js',
  'src/core/modules/notes.js',
  'src/core/local-tools.js'
];
const template = fs.readFileSync(path.join(root, 'src/core/wa-core.template.js'), 'utf8');
const marker = '/* WA_LOCAL_MODULES */';
if (template.split(marker).length !== 2) throw new Error('Un unique point d’insertion est requis');
const modules = files.map(file => `// Source: ${file}\n${fs.readFileSync(path.join(root, file), 'utf8')}`).join('\n');
// Callback avoids interpreting source-code replacement tokens such as $&.
const output = template.replace(marker, () => modules).trimEnd() + '\n';
const target = path.join(root, 'scripts/core/wa-core-ios.user.js');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== output) throw new Error('Bundle obsolète : node tools/build-core.cjs');
  console.log('WA Core : bundle reproductible et à jour');
} else {
  fs.writeFileSync(target, output);
  console.log(`WA Core : ${Buffer.byteLength(output)} octets, 5 modules locaux`);
}
