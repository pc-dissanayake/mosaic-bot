import {
  EVIDENCE_KINDS,
  EVIDENCE_STATES,
  INTENTS,
  type AnswerEnvelope,
  type AssistantIntent,
  type GroundingEvidence,
  type GroundingLink,
  type GroundingPacket,
} from './types.js';

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const EVIDENCE_ID = /^e[1-9][0-9]{0,5}$/;
const MAX_QUESTION_CHARS = 500;
const MAX_EVIDENCE = 64;
const MAX_LINKS = 16;
const MAX_ANSWER_CHARS = 4000;

type RecordValue = Record<string, unknown>;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function checkKeys(value: RecordValue, allowed: readonly string[], path: string, errors: string[]): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) errors.push(`${path}.${key}: unexpected property`);
  }
}

function stringAt(value: RecordValue, key: string, path: string, errors: string[], max: number): string | undefined {
  const item = value[key];
  if (typeof item !== 'string' || item.length === 0 || item.length > max) {
    errors.push(`${path}.${key}: expected a non-empty string of at most ${max} characters`);
    return undefined;
  }
  return item;
}

function nullableStringAt(
  value: RecordValue,
  key: string,
  path: string,
  errors: string[],
  max: number,
): string | null | undefined {
  if (!(key in value)) return undefined;
  const item = value[key];
  if (item === null) return null;
  if (typeof item !== 'string' || item.length > max) {
    errors.push(`${path}.${key}: expected a string or null of at most ${max} characters`);
    return undefined;
  }
  return item;
}

function parseLink(value: unknown, path: string, errors: string[]): GroundingLink | undefined {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return undefined;
  }
  checkKeys(value, ['label', 'href'], path, errors);
  const label = stringAt(value, 'label', path, errors, 160);
  const href = stringAt(value, 'href', path, errors, 300);
  if (href && !href.startsWith('/')) errors.push(`${path}.href: must be an internal path`);
  return label !== undefined && href !== undefined ? { label, href } : undefined;
}

function parseEvidence(value: unknown, index: number, errors: string[]): GroundingEvidence | undefined {
  const path = `evidence[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return undefined;
  }
  checkKeys(value, ['evidence_id', 'kind', 'label', 'state', 'facts', 'source', 'source_version'], path, errors);

  const evidenceId = stringAt(value, 'evidence_id', path, errors, 7);
  const kind = stringAt(value, 'kind', path, errors, 64);
  const label = stringAt(value, 'label', path, errors, 240);
  const state = stringAt(value, 'state', path, errors, 32);
  const source = stringAt(value, 'source', path, errors, 120);
  const sourceVersion = stringAt(value, 'source_version', path, errors, 160);

  if (evidenceId && !EVIDENCE_ID.test(evidenceId)) errors.push(`${path}.evidence_id: invalid evidence ID`);
  if (kind && !EVIDENCE_KINDS.includes(kind as (typeof EVIDENCE_KINDS)[number])) errors.push(`${path}.kind: unsupported evidence kind`);
  if (state && !EVIDENCE_STATES.includes(state as (typeof EVIDENCE_STATES)[number])) errors.push(`${path}.state: unsupported evidence state`);

  const factsValue = value.facts;
  let facts: GroundingEvidence['facts'] | undefined;
  if (!isRecord(factsValue)) {
    errors.push(`${path}.facts: expected an object`);
  } else {
    checkKeys(factsValue, ['blocking_reasons', 'status_label', 'next_holder_label', 'document_label', 'value_label'], `${path}.facts`, errors);
    const blocking = factsValue.blocking_reasons;
    let blockingReasons: string[] | undefined;
    if (blocking !== undefined) {
      if (!Array.isArray(blocking) || blocking.length > 12 || blocking.some((item) => typeof item !== 'string' || item.length > 240)) {
        errors.push(`${path}.facts.blocking_reasons: expected at most 12 short strings`);
      } else {
        blockingReasons = blocking;
      }
    }
    const statusLabel = nullableStringAt(factsValue, 'status_label', `${path}.facts`, errors, 160);
    const nextHolderLabel = nullableStringAt(factsValue, 'next_holder_label', `${path}.facts`, errors, 160);
    const documentLabel = nullableStringAt(factsValue, 'document_label', `${path}.facts`, errors, 160);
    const valueLabel = nullableStringAt(factsValue, 'value_label', `${path}.facts`, errors, 240);
    const parsedFacts: GroundingEvidence['facts'] = {};
    if (blockingReasons !== undefined) parsedFacts.blocking_reasons = blockingReasons;
    if (statusLabel !== undefined) parsedFacts.status_label = statusLabel;
    if (nextHolderLabel !== undefined) parsedFacts.next_holder_label = nextHolderLabel;
    if (documentLabel !== undefined) parsedFacts.document_label = documentLabel;
    if (valueLabel !== undefined) parsedFacts.value_label = valueLabel;
    facts = parsedFacts;
  }

  if (evidenceId && kind && label && state && source && sourceVersion && facts) {
    return {
      evidence_id: evidenceId,
      kind: kind as GroundingEvidence['kind'],
      label,
      state: state as GroundingEvidence['state'],
      facts,
      source,
      source_version: sourceVersion,
    };
  }
  return undefined;
}

export function validateGroundingPacket(input: unknown): ValidationResult<GroundingPacket> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['packet: expected an object'] };
  checkKeys(input, ['contract_version', 'request_id', 'question', 'intent', 'evidence', 'allowed_links', 'constraints'], 'packet', errors);

  if (input.contract_version !== 'grounding.v1') errors.push('packet.contract_version: unsupported contract');
  const requestId = stringAt(input, 'request_id', 'packet', errors, 128);
  if (requestId && !REQUEST_ID.test(requestId)) errors.push('packet.request_id: invalid correlation ID');
  const question = stringAt(input, 'question', 'packet', errors, MAX_QUESTION_CHARS);
  const intent = stringAt(input, 'intent', 'packet', errors, 64);
  if (intent && !INTENTS.includes(intent as AssistantIntent)) errors.push('packet.intent: unsupported intent');

  const evidenceValue = input.evidence;
  const evidence: GroundingEvidence[] = [];
  if (!Array.isArray(evidenceValue) || evidenceValue.length > MAX_EVIDENCE) {
    errors.push('packet.evidence: expected at most 64 items');
  } else {
    evidenceValue.forEach((item, index) => {
      const parsed = parseEvidence(item, index, errors);
      if (parsed) evidence.push(parsed);
    });
  }
  if (new Set(evidence.map((item) => item.evidence_id)).size !== evidence.length) errors.push('packet.evidence: IDs must be unique');

  const linksValue = input.allowed_links;
  const allowedLinks: GroundingLink[] = [];
  if (!Array.isArray(linksValue) || linksValue.length > MAX_LINKS) {
    errors.push('packet.allowed_links: expected at most 16 items');
  } else {
    linksValue.forEach((item, index) => {
      const parsed = parseLink(item, `allowed_links[${index}]`, errors);
      if (parsed) allowedLinks.push(parsed);
    });
  }

  const constraintsValue = input.constraints;
  let maxAnswerChars: number | undefined;
  if (!isRecord(constraintsValue)) {
    errors.push('packet.constraints: expected an object');
  } else {
    checkKeys(constraintsValue, ['must_refuse_without_evidence', 'max_answer_chars'], 'packet.constraints', errors);
    if (constraintsValue.must_refuse_without_evidence !== true) errors.push('packet.constraints.must_refuse_without_evidence: must be true');
    if (typeof constraintsValue.max_answer_chars !== 'number' || !Number.isInteger(constraintsValue.max_answer_chars) || constraintsValue.max_answer_chars < 80 || constraintsValue.max_answer_chars > MAX_ANSWER_CHARS) {
      errors.push('packet.constraints.max_answer_chars: expected an integer between 80 and 4000');
    } else {
      maxAnswerChars = constraintsValue.max_answer_chars;
    }
  }

  if (errors.length > 0 || requestId === undefined || question === undefined || intent === undefined || maxAnswerChars === undefined) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      contract_version: 'grounding.v1',
      request_id: requestId,
      question,
      intent: intent as AssistantIntent,
      evidence,
      allowed_links: allowedLinks,
      constraints: { must_refuse_without_evidence: true, max_answer_chars: maxAnswerChars },
    },
  };
}

function sentenceList(items: string[]): string {
  return items.map((item) => `• ${item}`).join('\n');
}

function deterministicAnswer(packet: GroundingPacket): AnswerEnvelope {
  const evidence = packet.evidence;
  const links = packet.allowed_links;
  const ids = (items: GroundingEvidence[]) => items.map((item) => item.evidence_id);
  const eligible = evidence.filter((item) => item.state === 'eligible');
  const blocked = evidence.filter((item) => item.state === 'blocked');
  const waiting = evidence.filter((item) => item.state === 'waiting' || item.kind === 'queue_item');
  const open = evidence.filter((item) => item.state === 'open' || item.kind === 'application_status');
  const missing = evidence.filter((item) => item.state === 'missing' || item.kind === 'document_requirement');

  switch (packet.intent) {
    case 'what_can_i_apply_for':
      if (eligible.length === 0) return { contract_version: 'answer.v1', outcome: 'refuse', answer: 'I do not have an authorized application available to list right now.', evidence_ids: [], links };
      return { contract_version: 'answer.v1', outcome: 'answer', answer: `You can start ${eligible.length} application${eligible.length === 1 ? '' : 's'} right now:\n${sentenceList(eligible.map((item) => item.label))}`, evidence_ids: ids(eligible), links };
    case 'why_cant_i_apply':
      if (blocked.length === 0) return { contract_version: 'answer.v1', outcome: 'refuse', answer: 'I do not have an authorized blocking reason for that application.', evidence_ids: [], links };
      return { contract_version: 'answer.v1', outcome: 'answer', answer: blocked.map((item) => `${item.label}:\n${sentenceList(item.facts.blocking_reasons ?? ['The current record does not show why it is blocked.'])}`).join('\n'), evidence_ids: ids(blocked), links };
    case 'my_queue':
      if (waiting.length === 0) return { contract_version: 'answer.v1', outcome: 'answer', answer: 'Your authorized queue is clear.', evidence_ids: [], links };
      return { contract_version: 'answer.v1', outcome: 'answer', answer: `There ${waiting.length === 1 ? 'is' : 'are'} ${waiting.length} item${waiting.length === 1 ? '' : 's'} waiting on you:\n${sentenceList(waiting.map((item) => `${item.label}${item.facts.status_label ? `: ${item.facts.status_label}` : ''}`))}`, evidence_ids: ids(waiting), links };
    case 'my_open_items':
      if (open.length === 0) return { contract_version: 'answer.v1', outcome: 'answer', answer: 'You have no authorized applications in progress.', evidence_ids: [], links };
      return { contract_version: 'answer.v1', outcome: 'answer', answer: `You have ${open.length} application${open.length === 1 ? '' : 's'} in progress:\n${sentenceList(open.map((item) => `${item.label}${item.facts.status_label ? `: ${item.facts.status_label}` : ''}`))}`, evidence_ids: ids(open), links };
    case 'vault_gaps':
      if (missing.length === 0) return { contract_version: 'answer.v1', outcome: 'answer', answer: 'No missing authorized document requirement was supplied.', evidence_ids: [], links };
      return { contract_version: 'answer.v1', outcome: 'answer', answer: `The authorized record shows ${missing.length} missing document${missing.length === 1 ? '' : 's'}:\n${sentenceList(missing.map((item) => item.facts.document_label ?? item.label))}`, evidence_ids: ids(missing), links };
    case 'my_profile_facts':
      if (evidence.length === 0) return { contract_version: 'answer.v1', outcome: 'refuse', answer: 'I do not have an authorized profile fact to report.', evidence_ids: [], links };
      return { contract_version: 'answer.v1', outcome: 'answer', answer: sentenceList(evidence.map((item) => `${item.label}: ${item.facts.value_label ?? 'not recorded'}`)), evidence_ids: ids(evidence), links };
    case 'whats_next':
    case 'explain_workflow':
      if (evidence.length === 0) return { contract_version: 'answer.v1', outcome: 'refuse', answer: 'I do not have an authorized workflow fact to explain.', evidence_ids: [], links };
      return { contract_version: 'answer.v1', outcome: 'answer', answer: sentenceList(evidence.map((item) => `${item.label}${item.facts.status_label ? `: ${item.facts.status_label}` : ''}${item.facts.next_holder_label ? ` — next: ${item.facts.next_holder_label}` : ''}`)), evidence_ids: ids(evidence), links };
    case 'unknown':
      return { contract_version: 'answer.v1', outcome: 'refuse', answer: 'I cannot answer that from the authorized information supplied.', evidence_ids: [], links };
  }
}

export function validateAnswerEnvelope(input: unknown, packet: GroundingPacket): ValidationResult<AnswerEnvelope> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['answer: expected an object'] };
  checkKeys(input, ['contract_version', 'outcome', 'answer', 'evidence_ids', 'links'], 'answer', errors);
  if (input.contract_version !== 'answer.v1') errors.push('answer.contract_version: unsupported contract');
  const outcome = input.outcome;
  if (outcome !== 'answer' && outcome !== 'refuse' && outcome !== 'fallback') errors.push('answer.outcome: unsupported outcome');
  const answer = stringAt(input, 'answer', 'answer', errors, packet.constraints.max_answer_chars);
  const evidenceIds = input.evidence_ids;
  if (!Array.isArray(evidenceIds) || evidenceIds.length > MAX_EVIDENCE || evidenceIds.some((id) => typeof id !== 'string' || !EVIDENCE_ID.test(id))) errors.push('answer.evidence_ids: invalid evidence ID list');
  const knownEvidence = new Set(packet.evidence.map((item) => item.evidence_id));
  if (Array.isArray(evidenceIds) && evidenceIds.some((id) => typeof id === 'string' && !knownEvidence.has(id))) errors.push('answer.evidence_ids: references evidence not supplied by MOSAIC');
  const linksValue = input.links;
  const links: GroundingLink[] = [];
  if (!Array.isArray(linksValue) || linksValue.length > MAX_LINKS) {
    errors.push('answer.links: expected at most 16 items');
  } else {
    linksValue.forEach((item, index) => {
      const parsed = parseLink(item, `answer.links[${index}]`, errors);
      if (parsed) links.push(parsed);
    });
  }
  const allowedLinkKeys = new Set(packet.allowed_links.map((link) => `${link.label}\u0000${link.href}`));
  if (links.some((link) => !allowedLinkKeys.has(`${link.label}\u0000${link.href}`))) errors.push('answer.links: contains a link not allowed by MOSAIC');
  if (outcome === 'answer' && Array.isArray(evidenceIds) && evidenceIds.length === 0) errors.push('answer.evidence_ids: factual answers require evidence');
  if (errors.length > 0 || answer === undefined || !Array.isArray(evidenceIds)) return { ok: false, errors };
  return { ok: true, value: { contract_version: 'answer.v1', outcome: outcome as AnswerEnvelope['outcome'], answer, evidence_ids: evidenceIds as string[], links } };
}

export function answerFromPacket(packetInput: unknown): ValidationResult<AnswerEnvelope> {
  const packet = validateGroundingPacket(packetInput);
  if (!packet.ok) return packet;
  const answer = deterministicAnswer(packet.value);
  return validateAnswerEnvelope(answer, packet.value);
}
