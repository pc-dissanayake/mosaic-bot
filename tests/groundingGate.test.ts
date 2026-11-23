import assert from 'node:assert/strict';
import test from 'node:test';
import { answerFromPacket, validateAnswerEnvelope, validateGroundingPacket } from '../src/groundingGate.js';
import type { GroundingPacket } from '../src/types.js';

const packet = (overrides: Partial<GroundingPacket> = {}): GroundingPacket => ({
  contract_version: 'grounding.v1',
  request_id: 'test-request-1',
  question: 'What can I apply for?',
  intent: 'what_can_i_apply_for',
  evidence: [{
    evidence_id: 'e1',
    kind: 'workflow_eligibility',
    label: 'Promotion to Grade II',
    state: 'eligible',
    facts: { blocking_reasons: [] },
    source: 'workflows.applicable',
    source_version: 'config:42',
  }],
  allowed_links: [{ label: 'Open catalog', href: '/catalog' }],
  constraints: { must_refuse_without_evidence: true, max_answer_chars: 1000 },
  ...overrides,
});

test('renders only authorized evidence and allowed links', () => {
  const result = answerFromPacket(packet());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.value.answer, /Promotion to Grade II/);
  assert.deepEqual(result.value.evidence_ids, ['e1']);
  assert.deepEqual(result.value.links, [{ label: 'Open catalog', href: '/catalog' }]);
});

test('rejects a subject selector or other unexpected packet field', () => {
  const input = { ...packet(), actor_id: 'another-user' } as unknown as Record<string, unknown>;
  const result = validateGroundingPacket(input);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join('\n'), /actor_id: unexpected property/);
});

test('rejects an unknown evidence kind and unknown fact field', () => {
  const input = packet({
    evidence: [{
      ...packet().evidence[0]!,
      kind: 'raw_database_row' as never,
      facts: { ...packet().evidence[0]!.facts, actor_id: 'someone-else' } as never,
    }],
  });
  const result = validateGroundingPacket(input);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join('\n'), /unsupported evidence kind/);
  assert.match(result.errors.join('\n'), /unexpected property/);
});

test('rejects an answer that cites evidence MOSAIC did not supply', () => {
  const validated = validateGroundingPacket(packet());
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  const result = validateAnswerEnvelope({
    contract_version: 'answer.v1',
    outcome: 'answer',
    answer: 'The caller is eligible.',
    evidence_ids: ['e99'],
    links: [],
  }, validated.value);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join('\n'), /not supplied by MOSAIC/);
});

test('rejects an answer containing a link outside MOSAIC allow-list', () => {
  const validated = validateGroundingPacket(packet());
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  const result = validateAnswerEnvelope({
    contract_version: 'answer.v1',
    outcome: 'answer',
    answer: 'Promotion is available.',
    evidence_ids: ['e1'],
    links: [{ label: 'External', href: 'https://example.com' }],
  }, validated.value);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join('\n'), /internal path|not allowed/);
});

test('refuses an unknown question instead of inventing an answer', () => {
  const result = answerFromPacket(packet({ intent: 'unknown', evidence: [] }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.outcome, 'refuse');
  assert.deepEqual(result.value.evidence_ids, []);
});

test('requires evidence for factual answer outcomes', () => {
  const validated = validateGroundingPacket(packet({ evidence: [] }));
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  const result = validateAnswerEnvelope({
    contract_version: 'answer.v1',
    outcome: 'answer',
    answer: 'You can apply for Promotion to Grade II.',
    evidence_ids: [],
    links: [],
  }, validated.value);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join('\n'), /factual answers require evidence/);
});
