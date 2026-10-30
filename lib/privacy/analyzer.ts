export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Classification = 'SAFE' | 'REVIEW' | 'HIGH RISK' | 'DO NOT POST';

export interface AnalysisSource {
  name: string;
  kind: string;
  text?: string;
}

export interface PrivacyFinding {
  id: string;
  category: string;
  severity: Severity;
  confidence: number;
  evidence: string;
  source: string;
  explanation: string;
  recommendation: string;
  weight: number;
}

export interface AnalysisResult {
  id: string;
  score: number;
  classification: Classification;
  findings: PrivacyFinding[];
  inferences: string[];
  recommendations: string[];
  saferVersion: string;
  sources: AnalysisSource[];
  analyzedAt: number;
}

const masks: Array<[RegExp, string]> = [
  [/([\w.+-]+)@([\w-]+\.[\w.-]+)/gi, '$1•••@$2'],
  [/\b(?:\+?\d[\d ()-]{8,}\d)\b/g, '••• ••• ••'],
  [/\b(?:ID|student|employee)[\s:#-]*[A-Z0-9-]{5,}\b/gi, '••••••••'],
];

function maskEvidence(value: string): string {
  return masks.reduce((masked, [pattern, replacement]) => masked.replace(pattern, replacement), value).slice(0, 140);
}

function includesAny(text: string, terms: string[]): string | undefined {
  const lower = text.toLowerCase();
  return terms.find((term) => lower.includes(term));
}

function addFinding(
  findings: PrivacyFinding[],
  category: string,
  severity: Severity,
  confidence: number,
  evidence: string,
  source: string,
  explanation: string,
  recommendation: string,
  weight: number,
): void {
  findings.push({
    id: `${category}-${findings.length + 1}`,
    category,
    severity,
    confidence,
    evidence: maskEvidence(evidence),
    source,
    explanation,
    recommendation,
    weight,
  });
}

function saferText(text: string): string {
  return text
    .replace(/\b(?:at|in|near)\s+[A-Z][\w-]*(?:\s+[A-Z][\w-]*){0,3}/g, ' at a private location')
    .replace(/\b(?:tomorrow|tonight|today)\b/gi, 'soon')
    .replace(/\b(?:at|around)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, ' later')
    .replace(/#[\w-]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function analyzePrivacy(sources: AnalysisSource[]): AnalysisResult {
  const findings: PrivacyFinding[] = [];
  const combinedText = sources.map((source) => source.text ?? source.name).join('\n');
  const text = combinedText.trim();
  const sourceLabel = sources.length > 1 ? `${sources.length} items together` : sources[0]?.name ?? 'text input';

  if (/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/i.test(text)) {
    addFinding(findings, 'Personal information', 'HIGH', 98, text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/i)?.[0] ?? 'Email address detected', sourceLabel, 'An email address can connect this post to an inbox, account, or organization.', 'Remove the address or replace it with a generic contact method.', 20);
  }
  if (/(?:\+?\d[\d ()-]{8,}\d)/.test(text)) {
    addFinding(findings, 'Personal information', 'HIGH', 94, text.match(/(?:\+?\d[\d ()-]{8,}\d)/)?.[0] ?? 'Phone number detected', sourceLabel, 'A phone number is a direct contact detail that can be reused outside this post.', 'Remove or mask the number before sharing.', 25);
  }
  if (/\b(?:student|employee|account|member)\s*(?:id|number)?\s*[:#-]?\s*[A-Z0-9-]{5,}\b/i.test(text)) {
    addFinding(findings, 'Sensitive information', 'CRITICAL', 91, text.match(/\b(?:student|employee|account|member)\s*(?:id|number)?\s*[:#-]?\s*[A-Z0-9-]{5,}\b/i)?.[0] ?? 'Identifier detected', sourceLabel, 'An identifier can make a person or account easier to target or impersonate.', 'Redact the identifier completely; do not rely on a partial blur.', 40);
  }
  if (includesAny(text, ['password', 'api key', 'secret', 'token', 'private key', 'credential'])) {
    addFinding(findings, 'Sensitive information', 'CRITICAL', 96, 'Credential-like language detected', sourceLabel, 'Secrets can provide direct access to systems or accounts.', 'Remove the secret and rotate it if it has already been shared.', 50);
  }
  const locationTerm = includesAny(text, ['institute', 'university', 'campus', 'cyber lab', 'hostel', 'street', 'road', 'building', 'room', 'airport', 'cafe', 'office']);
  if (locationTerm) {
    addFinding(findings, 'Location', 'HIGH', 88, locationTerm, sourceLabel, 'A named place or recognizable setting may reveal where the content was created.', 'Generalize the location and crop or blur identifying signs.', 30);
  }
  if (/\b(?:at|around|by)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i.test(text) || /\b(?:every|each)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text)) {
    addFinding(findings, 'Routine', 'MEDIUM', 86, text.match(/\b(?:at|around|by)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i)?.[0] ?? 'Recurring timing detected', sourceLabel, 'Precise timing can reveal when someone is likely to be at a place.', 'Remove exact times or post after the activity is over.', 20);
  }
  if (/(?:tomorrow|next week|leaving for|traveling to|flight|exam|meeting)/i.test(text)) {
    addFinding(findings, 'Context', 'MEDIUM', 82, 'Future plan or event timing detected', sourceLabel, 'Future plans can expose movement, availability, or a predictable schedule.', 'Share after the event and remove precise plans.', 25);
  }
  if (/(?:#\w+|@\w+)/.test(text)) {
    addFinding(findings, 'Digital footprint', 'LOW', 90, text.match(/[#@]\w+/)?.[0] ?? 'Public handle detected', sourceLabel, 'Handles and hashtags can connect this post with other public accounts and affiliations.', 'Remove unnecessary handles or use a less identifying caption.', 10);
  }
  if (sources.some((source) => ['image', 'video', 'pdf', 'document'].includes(source.kind))) {
    addFinding(findings, 'Metadata', 'LOW', 68, 'File metadata may be present', sourceLabel, 'Files can carry timestamps, device details, or location metadata that is not visible in the preview.', 'Review metadata and export a sanitized copy before publishing.', 10);
  }
  if (sources.length > 1 && findings.length > 1) {
    addFinding(findings, 'Identity', 'HIGH', 84, 'Multiple clues can combine across files', sourceLabel, 'Small clues become more identifying when a place, time, affiliation, and person appear together.', 'Remove at least one connecting clue from the set before posting.', 20);
  }

  const score = Math.min(100, findings.reduce((total, finding) => total + finding.weight, 0));
  const classification: Classification = score <= 20 ? 'SAFE' : score <= 50 ? 'REVIEW' : score <= 75 ? 'HIGH RISK' : 'DO NOT POST';
  const inferences = findings.length === 0
    ? ['No obvious personal or contextual clues were detected by the local checker.']
    : [
        ...(findings.some((finding) => finding.category === 'Location') ? ['You may be associated with a recognizable place or institution.'] : []),
        ...(findings.some((finding) => finding.category === 'Routine') ? ['Someone may estimate when you are likely to be in a particular place.'] : []),
        ...(findings.some((finding) => finding.category === 'Identity') ? ['The combined clues may make the person or account easier to identify.'] : []),
        ...(findings.some((finding) => finding.category === 'Sensitive information') ? ['A viewer may gain information that could be used for targeting or impersonation.'] : []),
      ];
  const recommendations = Array.from(new Set(findings.map((finding) => finding.recommendation))).slice(0, 6);
  const textSource = sources.find((source) => source.text)?.text ?? '';

  return {
    id: `analysis-${Date.now()}`,
    score,
    classification,
    findings,
    inferences,
    recommendations,
    saferVersion: textSource ? saferText(textSource) : 'Review visible signs, metadata, and personal identifiers before sharing.',
    sources,
    analyzedAt: Date.now(),
  };
}
