import { execFileSync } from 'node:child_process';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
if (git('status', '--porcelain')) throw new Error('Déploiement refusé : checkout Git non propre.');
if (!process.env.MCP_ACCESS_TOKEN) throw new Error('MCP_ACCESS_TOKEN requis pour le smoke test après déploiement.');
const commit = git('rev-parse', 'HEAD');
execFileSync('npx', ['wrangler', 'deploy', '--keep-vars', '--var', `DEPLOY_COMMIT:${commit}`], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/smoke.mjs'], { stdio: 'inherit', env: { ...process.env, EXPECTED_COMMIT: commit } });
