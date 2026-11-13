import { createHash } from 'node:crypto';

const maximumDimensions = 8192;
const secretAssignment = /\b(?:api[_-]?key|password|access[_-]?token|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9/+=_.-]{12,}/i;
const privateKey = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;
const bearerToken = /\bBearer\s+[A-Za-z0-9._~+/-]{12,}/i;
const emailAddress = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

export function embeddingContentHash(text) {
  if (typeof text !== 'string') throw new Error('Embedding input must be text');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function validateEmbedding(value) {
  if (!value || typeof value !== 'object'
    || typeof value.model !== 'string' || value.model.length === 0 || value.model.length > 200
    || typeof value.version !== 'string' || value.version.length === 0 || value.version.length > 200
    || !Number.isInteger(value.dimensions) || value.dimensions < 1 || value.dimensions > maximumDimensions
    || !Array.isArray(value.vector) || value.vector.length !== value.dimensions
    || value.vector.some((component) => typeof component !== 'number' || !Number.isFinite(component))
    || !value.vector.some((component) => component !== 0)
    || typeof value.contentHash !== 'string' || !/^[a-f0-9]{64}$/i.test(value.contentHash)) {
    throw new Error('Invalid embedding');
  }
  return value;
}

export function assertEmbeddingProvider(provider) {
  if (!provider || provider.available !== true
    || typeof provider.model !== 'string' || !provider.model.trim()
    || typeof provider.version !== 'string' || !provider.version.trim()
    || typeof provider.embed !== 'function') {
    throw new Error('Semantic retrieval provider is not configured');
  }
  return provider;
}

export async function embedText(provider, text) {
  assertEmbeddingProvider(provider);
  if (typeof text !== 'string' || !text.trim()
    || secretAssignment.test(text) || privateKey.test(text) || bearerToken.test(text) || emailAddress.test(text)) {
    throw new Error('Sensitive or empty text rejected from embedding request');
  }
  const result = validateEmbedding(await provider.embed(text));
  if (result.model !== provider.model || result.version !== provider.version
    || result.contentHash !== embeddingContentHash(text)) {
    throw new Error('Invalid embedding: provider identity or content hash mismatch');
  }
  return result;
}

export function unavailableEmbeddingProvider() {
  return {
    available: false,
    async embed() {
      throw new Error('Embedding provider is not configured');
    },
  };
}

export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || left.length === 0) {
    throw new Error('Embedding dimensions do not match');
  }
  const leftScale = Math.max(...left.map((component) => Math.abs(component)));
  const rightScale = Math.max(...right.map((component) => Math.abs(component)));
  if (!Number.isFinite(leftScale) || !Number.isFinite(rightScale) || !leftScale || !rightScale) {
    throw new Error('Invalid zero-norm embedding');
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index++) {
    const a = left[index] / leftScale;
    const b = right[index] / rightScale;
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Invalid embedding vector');
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  return Math.max(-1, Math.min(1, dot / Math.sqrt(leftNorm * rightNorm)));
}
