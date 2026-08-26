const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = ['runtime', 'amazon', 'google', 'youtube', 'reddit', 'app'];
const template = fs.readFileSync(path.join(root, 'src/sites/wa-sites.template.js'), 'utf8');
const marker = '/* WA_SITES_MODULES */';
if (template.split(marker).length !== 2) throw Error('Point d’insertion Sites incorrect');
const body = files.map(name => `// Source: src/sites/${name}.js\n${fs.readFileSync(path.join(root, `src/sites/${name}.js`), 'utf8')}`).join('\n');
const output = template.replace(marker, () => body).trimEnd() + '\n';
const target = path.join(root, 'scripts/sites/wa-sites-ios.user.js');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== output) throw Error('Bundle Sites obsolète');
  console.log('WA Sites : bundle reproductible');
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output);
  console.log(`WA Sites : ${Buffer.byteLength(output)} octets, aucun code distant`);
}
