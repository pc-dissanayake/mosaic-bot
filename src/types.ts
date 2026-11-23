export const INTENTS = [
  'my_open_items',
  'my_queue',
  'vault_gaps',
  'what_can_i_apply_for',
  'why_cant_i_apply',
  'whats_next',
  'explain_workflow',
  'my_profile_facts',
  'unknown',
] as const;

export type AssistantIntent = (typeof INTENTS)[number];

export const EVIDENCE_KINDS = [
  'workflow_eligibility',
  'workflow_explanation',
  'application_status',
  'queue_item',
  'document_requirement',
  'profile_fact',
  'system_limitation',
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_STATES = [
  'eligible',
  'blocked',
  'open',
  'waiting',
  'complete',
  'missing',
  'present',
  'unknown',
] as const;

export type EvidenceState = (typeof EVIDENCE_STATES)[number];

export interface GroundingLink {
  label: string;
  href: string;
}

export interface EvidenceFacts {
  blocking_reasons?: string[];
  status_label?: string | null;
  next_holder_label?: string | null;
  document_label?: string | null;
  value_label?: string | null;
}

export interface GroundingEvidence {
  evidence_id: string;
  kind: EvidenceKind;
  label: string;
  state: EvidenceState;
  facts: EvidenceFacts;
  source: string;
  source_version: string;
}

export interface GroundingPacket {
  contract_version: 'grounding.v1';
  request_id: string;
  question: string;
  intent: AssistantIntent;
  evidence: GroundingEvidence[];
  allowed_links: GroundingLink[];
  constraints: {
    must_refuse_without_evidence: true;
    max_answer_chars: number;
  };
}

export type AnswerOutcome = 'answer' | 'refuse' | 'fallback';

export interface AnswerEnvelope {
  contract_version: 'answer.v1';
  outcome: AnswerOutcome;
  answer: string;
  evidence_ids: string[];
  links: GroundingLink[];
}
