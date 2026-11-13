import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { discover, fail, loadRegistry, verifySession } from './core.mjs';
import { reportExitCode, runWorkflow, verifyEvidence } from './runner.mjs';
import { evaluateKnowledge } from './knowledge/evaluation.mjs';
import { getKnowledge, reconcileKnowledge, relatedKnowledge, searchKnowledge } from './knowledge/retrieval.mjs';
import { validateKnowledge } from './knowledge/records.mjs';
import { knowledgeStoreStatus } from './knowledge/store.mjs';
import {
  captureFinding, captureFindings, createCheckpoint, getFinding, proposeKnowledge,
  restoreCheckpoint, summarizeCheckpoints,
} from './knowledge/working.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const help = {
  discover: ['task'], inventory: [], 'validate-registry': [], explain: ['capability'],
  'verify-session': ['session', 'task'],
  run: ['workflow', 'session', 'task', 'inputs'], verify: ['run', 'session', 'task'],
  knowledge: ['action'],
};
const optionalOptions = { knowledge: ['payload', 'session', 'task'] };

function knowledgeCommand(root, options) {
  try {
    let payload = {};
    if (options.payload) {
      try { payload = JSON.parse(options.payload); }
      catch { fail('Knowledge payload must be valid JSON'); }
    }
    const { action, session, task } = options;
    const sessionTask = { session, task };
    const requiredCapability = {
      status: 'knowledge-working-memory',
      index: 'knowledge-retrieval',
      reconcile: 'knowledge-retrieval',
      search: 'knowledge-retrieval',
      get: 'knowledge-retrieval',
      related: 'knowledge-retrieval',
      capture: 'knowledge-working-memory',
      'capture-batch': 'knowledge-working-memory',
      finding: 'knowledge-working-memory',
      propose: 'knowledge-working-memory',
      checkpoint: 'knowledge-session-state',
      restore: 'knowledge-session-state',
      summarize: 'knowledge-session-state',
      benchmark: 'knowledge-evaluation',
    }[action];
    if (requiredCapability) {
      if (!session || !task) fail(`Knowledge action ${action} requires --session and --task`);
      const { receipt } = verifySession(root, session, task);
      if (!receipt.selectedCapabilities.includes(requiredCapability)) {
        fail(`Knowledge action ${action} requires discovery to select ${requiredCapability}`);
      }
    }
    switch (action) {
      case 'validate': return validateKnowledge(root);
      case 'status': return { workingStore: knowledgeStoreStatus(root), authoritative: validateKnowledge(root) };
      case 'index':
      case 'reconcile': return reconcileKnowledge(root);
      case 'search': return searchKnowledge(root, payload);
      case 'get': return getKnowledge(root, payload.id);
      case 'related': return relatedKnowledge(root, payload.id, payload);
      case 'capture': return captureFinding(root, { ...sessionTask, finding: payload.finding ?? payload });
      case 'capture-batch': return {
        findings: captureFindings(root, { ...sessionTask, findings: payload.findings }),
      };
      case 'finding': return getFinding(root, payload.id);
      case 'propose': return proposeKnowledge(root, { ...sessionTask, ...payload });
      case 'checkpoint': return createCheckpoint(root, { ...sessionTask, checkpoint: payload.checkpoint ?? payload });
      case 'restore': return restoreCheckpoint(root, { ...sessionTask, id: payload.id });
      case 'summarize': return summarizeCheckpoints(root, { ...sessionTask, limit: payload.limit ?? 10 });
      case 'benchmark': return evaluateKnowledge(root);
      default: fail('Unknown knowledge action');
    }
  } catch (error) {
    const message = error.message;
    const code = /Unsupported retrieval provider|Semantic retrieval provider/.test(message) ? 'UNSUPPORTED_PROVIDER'
      : /receipt|session mismatch|expired|Registry changed|authorization/i.test(message) ? 'AUTHORIZATION_FAILURE'
        : /not found/i.test(message) ? 'MISSING_KNOWLEDGE'
          : /evidence|source reference hash|hash is not current|verified records/i.test(message) ? 'INSUFFICIENT_EVIDENCE'
            : /database|SQLite|integrity check|schema .* newer/i.test(message) ? 'WORKING_STORE_FAILURE'
              : /stale/i.test(message) ? 'STALE_KNOWLEDGE'
                : 'INVALID_INPUT';
    error.structuredError = { code, message };
    throw error;
  }
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' || !command) {
    console.log(JSON.stringify({ commands: help, usage: 'node scripts/ai/cli.mjs <command> --<option> <value>' }, null, 2));
  } else {
    if (!Object.hasOwn(help, command)) fail('Unknown command; use --help');
    if (args.length === 1 && args[0] === '--help') {
      console.log(JSON.stringify({ command, requiredOptions: help[command],
        optionalOptions: optionalOptions[command] ?? [], noninteractive: true }, null, 2));
    } else {
      const options = {};
      const allowedOptions = [...help[command], ...(optionalOptions[command] ?? [])];
      for (let index = 0; index < args.length; index += 2) {
        const key = args[index].slice(2);
        if (!args[index].startsWith('--') || !allowedOptions.includes(key) || Object.hasOwn(options, key) || !args[index + 1]) fail('Unknown, duplicate or missing option');
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
      } else if (command === 'knowledge') {
        result = knowledgeCommand(root, options);
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
  console.error(JSON.stringify(error.structuredError
    ? { status: 'failed', error: error.structuredError }
    : { status: 'failed', reason: error.message }));
  process.exitCode = 1;
}