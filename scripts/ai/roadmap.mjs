import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const roadmapPath = 'docs/development/roadmap.json';
const statusPath = 'docs/development/implementation-status.md';
const readmePath = 'README.md';
const markerStart = '<!-- ROADMAP:START -->';
const markerEnd = '<!-- ROADMAP:END -->';
const statuses = ['complete', 'in_progress', 'blocked', 'not_started'];

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const clean = (value) => String(value).replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
const percent = (count, total) => total ? Math.round((count / total) * 100) : 0;
const packages = (roadmap) => roadmap.milestones.flatMap((milestone) =>
  milestone.packages.map((item) => ({ ...item, milestoneId: milestone.id, milestoneTitle: milestone.title })));

export function validateRoadmap(repoRoot, roadmap) {
  const schema = readJson(path.join(repoRoot, '.agents/schemas/roadmap.schema.json'));
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(roadmap)) throw new Error(`Roadmap schema validation failed: ${ajv.errorsText(validate.errors)}`);

  const ids = new Set();
  const milestoneIds = new Set(roadmap.milestones.map(({ id }) => id));
  for (const item of packages(roadmap)) {
    if (ids.has(item.id)) throw new Error(`Duplicate roadmap package ID: ${item.id}`);
    ids.add(item.id);
  }
  for (const item of packages(roadmap)) {
    if (item.dependencies.some((id) => !ids.has(id) && !milestoneIds.has(id))) throw new Error(`Unknown dependency in ${item.id}`);
    if (item.status === 'complete' &&
        (!['passed', 'not_applicable'].includes(item.verification) || item.evidence.length === 0 || item.blockers.length > 0)) {
      throw new Error(`Complete roadmap package lacks passing verification/evidence: ${item.id}`);
    }
    if (item.status === 'blocked' && item.blockers.length === 0) throw new Error(`Blocked roadmap package lacks a blocker: ${item.id}`);
    for (const evidence of item.evidence) {
      if (path.isAbsolute(evidence.path) || evidence.path.split(/[\\/]/).includes('..') ||
          !existsSync(path.join(repoRoot, evidence.path))) {
        throw new Error(`Invalid or missing roadmap evidence path: ${evidence.path}`);
      }
    }
  }
  for (const action of roadmap.nextActions) {
    if (!ids.has(action.packageId)) throw new Error(`Unknown next-action package ID: ${action.packageId}`);
  }
  for (const file of Object.values(roadmap.sources)) {
    if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..') || !existsSync(path.join(repoRoot, file))) {
      throw new Error(`Invalid or missing roadmap source: ${file}`);
    }
  }
  return true;
}

function milestoneStatus(milestone) {
  const packageStatuses = milestone.packages.map(({ status }) => status);
  if (packageStatuses.every((status) => status === 'complete')) return 'complete';
  if (packageStatuses.every((status) => status === 'not_started')) return 'not_started';
  if (packageStatuses.every((status) => status === 'blocked' || status === 'not_started')) return 'blocked';
  return 'in_progress';
}

function summary(roadmap) {
  const counts = (items) => statuses.map((status) =>
    `${items.filter((item) => item.status === status).length} ${status.replace('_', ' ')}`).join(', ');
  const current = roadmap.milestones.find((milestone) => milestoneStatus(milestone) === 'in_progress') ??
    roadmap.milestones.find((milestone) => milestoneStatus(milestone) === 'blocked') ??
    roadmap.milestones.at(-1);
  const nextProduct = roadmap.milestones.find(({ id }) => ['M1', 'M2', 'M3', 'M4'].includes(id));
  const packagesTotal = packages(roadmap);
  return [
    '## Current implementation',
    '',
    markerStart,
    `**Active workstream:** ${current.id} — ${current.title} (${milestoneStatus(current).replace('_', ' ')}).`,
    `**Overall roadmap:** ${packagesTotal.filter((item) => item.status === 'complete').length}/${packagesTotal.length} work packages complete; statuses are tracked per package below.`,
    '',
    '| Milestone | State | Package summary |',
    '|---|---|---|',
    ...roadmap.milestones.map((milestone) => {
      const state = milestoneStatus(milestone);
      return `| ${milestone.id} — ${clean(milestone.title)} | ${state.replace('_', ' ')} | ${counts(milestone.packages)} |`;
    }),
    '',
    `**Next product milestone:** ${nextProduct.id} — ${nextProduct.title} (${milestoneStatus(nextProduct).replace('_', ' ')}).`,
    '',
    '**Next actions:**',
    ...roadmap.nextActions.map(({ packageId, action }) => `- **${packageId}:** ${clean(action)}`),
    '',
    `The product requirements remain in [${roadmap.sources.requirements}](./${roadmap.sources.requirements}).`,
    `Detailed implementation state and evidence: [${roadmap.sources.status}](./${roadmap.sources.status}).`,
    markerEnd,
  ].join('\n');
}

function detailedStatus(roadmap) {
  const lines = [
    '# Implementation status',
    '',
    `> Generated from [roadmap.json](./roadmap.json). Edit that file, then run \`pnpm roadmap:write\`; CI checks generated output with \`pnpm roadmap:check\`.`,
    '',
    `Requirements source: [${roadmap.sources.requirements}](../../${roadmap.sources.requirements}).`,
    '',
    '## Milestones',
    '',
    '| ID | Milestone | State | Outcome |',
    '|---|---|---|---|',
    ...roadmap.milestones.map((milestone) =>
      `| ${milestone.id} | ${clean(milestone.title)} | ${milestoneStatus(milestone).replace('_', ' ')} | ${clean(milestone.outcome)} |`),
  ];

  for (const milestone of roadmap.milestones) {
    lines.push('', `## ${milestone.id} — ${milestone.title}`, '', '| Work package | State | Implementation / verification | Dependencies | Blockers | Evidence |', '|---|---|---|---|---|---|');
    for (const item of milestone.packages) {
      const refs = item.evidence.length
        ? item.evidence.map(({ path: file, note }) => `[${clean(file)}](../../${file}) — ${clean(note)}`).join('<br>')
        : 'None recorded';
      lines.push(`| ${item.id} — ${clean(item.title)} | ${item.status.replace('_', ' ')} | ${clean(item.implementation)}<br>Verification: ${item.verification.replace('_', ' ')} | ${item.dependencies.length ? item.dependencies.join(', ') : '—'} | ${item.blockers.length ? item.blockers.map(clean).join('<br>') : '—'} | ${refs} |`);
    }
  }
  lines.push('', '## Next actions', '', ...roadmap.nextActions.map(({ packageId, action }) => `- **${packageId}:** ${clean(action)}`), '',
    '## Status maintenance', '',
    '- At kickoff, record impacted package IDs and expected status/evidence changes in the task brief; explicitly state when no roadmap change is expected.',
    '- At closeout, update `roadmap.json` when implementation or verification changes, or record why status did not change.',
    '- Keep implementation status separate from verification. Mock/static checks do not prove physical-device behavior.',
    '- Run `pnpm roadmap:write` after edits and `pnpm roadmap:check` before closeout; the foundation workflow and CI enforce freshness.',
    '');
  return lines.join('\n');
}

function replaceReadmeBlock(readme, content) {
  const start = readme.indexOf(markerStart);
  const end = readme.indexOf(markerEnd);
  if (start < 0 || end < 0 || start >= end ||
      readme.indexOf(markerStart, start + markerStart.length) >= 0 ||
      readme.indexOf(markerEnd, end + markerEnd.length) >= 0) {
    throw new Error('README must contain exactly one ordered roadmap marker pair');
  }
  return `${readme.slice(0, start)}${content.slice(content.indexOf(markerStart), content.indexOf(markerEnd) + markerEnd.length)}${readme.slice(end + markerEnd.length)}`;
}

export function generatedDocuments(repoRoot, roadmap) {
  validateRoadmap(repoRoot, roadmap);
  const readme = readFileSync(path.join(repoRoot, readmePath), 'utf8');
  return {
    [readmePath]: replaceReadmeBlock(readme, summary(roadmap)),
    [statusPath]: detailedStatus(roadmap),
  };
}

export function updateRoadmap(repoRoot, { write = false } = {}) {
  const roadmap = readJson(path.join(repoRoot, roadmapPath));
  const expected = generatedDocuments(repoRoot, roadmap);
  const stale = Object.entries(expected).filter(([file, content]) =>
    readFileSync(path.join(repoRoot, file), 'utf8') !== content).map(([file]) => file);
  if (write) {
    for (const file of stale) writeFileSync(path.join(repoRoot, file), expected[file], 'utf8');
    return { status: 'written', files: stale };
  }
  return { status: stale.length ? 'stale' : 'passed', stale };
}

const [option, ...extra] = process.argv.slice(2);
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (extra.length || !['--check', '--write', '--help'].includes(option)) {
      throw new Error('Usage: node scripts/ai/roadmap.mjs --check|--write|--help');
    }
    if (option === '--help') console.log('Validate or regenerate README and implementation-status from docs/development/roadmap.json.');
    else {
      const result = updateRoadmap(root, { write: option === '--write' });
      console.log(JSON.stringify(result, null, 2));
      if (result.status === 'stale') process.exitCode = 1;
    }
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', reason: error.message }));
    process.exitCode = 1;
  }
}
