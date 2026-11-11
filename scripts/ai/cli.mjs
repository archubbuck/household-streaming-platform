import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { discover, fail, loadRegistry, verifySession } from './core.mjs';
import { reportExitCode, runWorkflow, verifyEvidence } from './runner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const help = {
  discover: ['task'], inventory: [], 'validate-registry': [], explain: ['capability'],
  'verify-session': ['session', 'task'],
  run: ['workflow', 'session', 'task', 'inputs'], verify: ['run', 'session', 'task'],
};

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' || !command) {
    console.log(JSON.stringify({ commands: help, usage: 'node scripts/ai/cli.mjs <command> --<option> <value>' }, null, 2));
  } else {
    if (!Object.hasOwn(help, command)) fail('Unknown command; use --help');
    if (args.length === 1 && args[0] === '--help') {
      console.log(JSON.stringify({ command, requiredOptions: help[command], noninteractive: true }, null, 2));
    } else {
      const options = {};
      for (let index = 0; index < args.length; index += 2) {
        const key = args[index].slice(2);
        if (!args[index].startsWith('--') || !help[command].includes(key) || Object.hasOwn(options, key) || !args[index + 1]) fail('Unknown, duplicate or missing option');
        options[key] = args[index + 1];
      }
      for (const key of help[command]) if (!options[key]) fail(`Missing --${key}`);
      let result;
      if (command === 'discover') result = discover(root, options.task);
      else if (command === 'run' || command === 'verify') {
        const report = command === 'run'
          ? runWorkflow(root, { ...options, inputs: JSON.parse(options.inputs) })
          : verifyEvidence(root, options);
        process.exitCode = reportExitCode(report);
        result = { status: process.exitCode === 0 ? 'passed' : process.exitCode === 2 ? 'blocked' : 'failed',
          runId: report.runId, readyForMerge: report.readyForMerge,
          evidencePath: `.artifacts/tasks/${report.runId}/validation.json`, checks: report.checks };
      }
      else if (command === 'verify-session') {
        const { receipt } = verifySession(root, options.session, options.task);
        result = { status: 'passed', sessionId: receipt.sessionId, registryHash: receipt.registryHash };
      } else {
        const registry = loadRegistry(root);
        if (command === 'explain') {
          result = registry.byId.get(options.capability);
          if (!result) fail('Unknown capability');
        } else result = { status: 'passed', registryHash: registry.registryHash, capabilities: registry.capabilities, inventory: registry.inventory };
      }
      console.log(JSON.stringify(result, null, 2));
    }
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', reason: error.message }));
  process.exitCode = 1;
}