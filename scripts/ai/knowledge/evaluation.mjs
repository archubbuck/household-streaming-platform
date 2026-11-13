import { performance } from 'node:perf_hooks';
import { readJson, safePath } from '../core.mjs';
import { loadKnowledge, validateKnowledge } from './records.mjs';
import { reconcileKnowledge, searchKnowledge } from './retrieval.mjs';

function metrics(results, expected, k) {
  const top = results.slice(0, k);
  const found = new Set(top.map(({ id }) => id));
  const relevant = top.filter(({ id }) => expected.includes(id)).length;
  const first = top.findIndex(({ id }) => expected.includes(id));
  return {
    recallAtK: expected.length ? relevant / expected.length : 1,
    precisionAtK: relevant / k,
    meanReciprocalRank: first < 0 ? 0 : 1 / (first + 1),
  };
}

export function evaluateKnowledge(root) {
  const fixture = readJson(safePath(root, 'knowledge/benchmarks/queries.json'));
  const k = fixture.top_k;
  const results = [];
  let lexicalLatencyMs = 0;
  let exactLatencyMs = 0;
  let contextCharacters = 0;
  let estimatedTokens = 0;
  let sourceCoverageTotal = 0;
  for (const item of fixture.queries) {
    const exactStarted = performance.now();
    const exact = searchKnowledge(root, {
      query: item.query,
      limit: k,
      tokenBudget: 2500,
      mode: 'exact',
      statuses: ['verified'],
    });
    exactLatencyMs += performance.now() - exactStarted;
    const started = performance.now();
    const lexical = searchKnowledge(root, {
      query: item.query,
      limit: k,
      tokenBudget: 2500,
      mode: 'lexical',
      statuses: ['verified'],
    });
    lexicalLatencyMs += performance.now() - started;
    const lexicalMetrics = metrics(lexical.results, item.expected_ids, k);
    const exactMetrics = metrics(exact.results, item.expected_ids, k);
    const returnedSources = new Set(lexical.results.flatMap(({ sourceLocation, sources }) => [sourceLocation, ...sources]));
    sourceCoverageTotal += item.expected_sources.filter((source) => returnedSources.has(source)).length / item.expected_sources.length;
    contextCharacters += lexical.context.text.length;
    estimatedTokens += lexical.context.estimatedTokens;
    results.push({
      query: item.query,
      expectedIds: item.expected_ids,
      expectedSources: item.expected_sources,
      exactAndLexical: lexicalMetrics,
      exactOnly: exactMetrics,
      expectedSourceCoverage: item.expected_sources.filter((source) =>
        new Set(lexical.results.flatMap(({ sourceLocation, sources }) => [sourceLocation, ...sources])).has(source)).length / item.expected_sources.length,
      topResults: lexical.results.map(({ id, sourceLocation, sources }) => ({ id, sourceLocation, sources })),
      contextCharacters: lexical.context.text.length,
      estimatedTokens: lexical.context.estimatedTokens,
    });
  }
  const denominator = results.length || 1;
  const average = (key) => results.reduce((sum, item) => sum + item.exactAndLexical[key], 0) / denominator;
  const freshness = validateKnowledge(root);
  const rebuildStarted = performance.now();
  const reconciliation = reconcileKnowledge(root, { force: true });
  const indexRebuildMilliseconds = performance.now() - rebuildStarted;
  const sourceReferenceCount = loadKnowledge(root).records
    .reduce((count, record) => count + record.metadata.provenance.source_files.length, 0);
  const staleRecordCount = freshness.staleRecords.length;
  return {
    dataset: 'knowledge/benchmarks/queries.json',
    queryCount: results.length,
    topK: k,
    baselines: {
      noRetrieval: { recallAtK: 0, precisionAtK: 0, meanReciprocalRank: 0 },
      exactAndFullText: {
        recallAtK: average('recallAtK'),
        precisionAtK: average('precisionAtK'),
        meanReciprocalRank: average('meanReciprocalRank'),
        expectedSourceCoverage: sourceCoverageTotal / denominator,
        totalLatencyMilliseconds: Number(lexicalLatencyMs.toFixed(3)),
        exactLookupLatencyMilliseconds: Number(exactLatencyMs.toFixed(3)),
        averageContextCharacters: Math.round(contextCharacters / denominator),
        averageEstimatedTokens: Math.round(estimatedTokens / denominator),
      },
      semantic: { status: 'unavailable', reason: 'No embedding provider is configured' },
      hybrid: { status: 'unavailable', reason: 'No embedding provider is configured' },
    },
    freshness: {
      staleRecordCount: freshness.staleRecords.length,
      currentSnapshot: freshness.snapshot,
      detectionRate: staleRecordCount ? 1 : null,
      detectionRateNote: staleRecordCount ? 'All changed verified records were reported stale.' : 'No stale source sample exists in the current repository snapshot.',
      sourceRecordCount: sourceReferenceCount,
      indexRebuildMilliseconds: Number(indexRebuildMilliseconds.toFixed(3)),
      indexRebuilt: reconciliation.indexRebuilt,
    },
    promotionRejectionAccuracy: {
      status: 'not-measured',
      reason: 'No automatic promotion pathway is enabled; proposals remain pending Git review.',
    },
    results,
  };
}
