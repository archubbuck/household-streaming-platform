import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySession, validateSchema } from '../ai/core.mjs';
import { inspectRoku } from './inspection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(JSON.stringify({ usage: 'roku:mcp:check --session <id> --task <exact task>',
      scope: 'Read-only tooling inspection; no device operations', noninteractive: true,
      exitCodes: { passed: 0, failed: 1, blocked: 2 } }));
  } else {
    if (args.length !== 4 || args[0] !== '--session' || args[2] !== '--task') throw new Error('Invalid arguments');
    verifySession(root, args[1], args[3]);
    const report = inspectRoku(root);
    validateSchema(root, '.agents/schemas/roku-inspection.schema.json', report);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.status === 'passed' ? 0 : report.status === 'blocked' ? 2 : 1;
  }
} catch {
  console.error(JSON.stringify({ status: 'failed', errorCode: 'INVALID_ARGUMENTS_OR_SESSION',
    reason: 'Use --help; run fresh discovery and supply the exact task/session. Raw errors are suppressed.' }));
  process.exitCode = 1;
}