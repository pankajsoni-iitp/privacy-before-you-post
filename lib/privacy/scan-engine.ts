export type FindingCategory =
  | 'Email'
  | 'Phone'
  | 'Street Address/GPS'
  | 'Secret/API Key'
  | 'Payment card'
  | 'Metadata'
  | 'Face'
  | 'License Plate';

export type Modality =
  | 'Video Frame OCR'
  | 'Visual Objects'
  | 'Audio Speech'
  | 'Subtitles'
  | 'Container Metadata'
  | 'Supplied Thumbnail';

export type FindingAction = 'redact' | 'ignore';

export interface ScanFinding {
  id: string;
  modality: Modality;
  category: FindingCategory;
  confidence: number;
  location: string;
  masked: string;
  raw: string;
  action: FindingAction;
}

export interface Unit {
  label: string;
  text: string;
}

export type ModuleId = 'ocr' | 'face' | 'plate' | 'audio' | 'subtitles' | 'metadata' | 'thumbnail';

export type ModuleState = 'Checked' | 'No input supplied' | 'Not configured' | 'Disabled';

export interface ModuleStatus {
  id: ModuleId;
  label: string;
  state: ModuleState;
}

export interface ScanInput {
  hasVideo: boolean;
  hasSubtitles: boolean;
  hasTranscript: boolean;
  hasThumbnail: boolean;
  enabled: Record<ModuleId, boolean>;
}

export const MODULE_LABELS: Record<ModuleId, string> = {
  ocr: 'Frame OCR',
  face: 'Face Detection',
  plate: 'License Plates',
  audio: 'Audio Speech PII',
  subtitles: 'Subtitles',
  metadata: 'Metadata',
  thumbnail: 'Thumbnail',
};

export const MODULE_IDS: ModuleId[] = ['ocr', 'face', 'plate', 'audio', 'subtitles', 'metadata', 'thumbnail'];

export const REDACTED_MARK = '[REDACTED]';

type TextCategory = Exclude<FindingCategory, 'Metadata' | 'Face' | 'License Plate'>;

interface Detection {
  category: TextCategory;
  start: number;
  end: number;
  raw: string;
  masked: string;
  confidence: number;
}

interface Rule {
  category: TextCategory;
  pattern: RegExp;
  confidence: number;
  accept?: (raw: string) => boolean;
  mask: (raw: string) => string;
}

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits.charAt(i));
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

const RULES: Rule[] = [
  {
    category: 'Payment card',
    pattern: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g,
    confidence: 97,
    accept: (raw) => {
      const digits = digitsOf(raw);
      return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
    },
    mask: (raw) => `•••• •••• •••• ${digitsOf(raw).slice(-4)}`,
  },
  {
    category: 'Street Address/GPS',
    pattern: /(?<![\d.])[-+]?\d{1,2}\.\d{4,}\s*,\s*[-+]?\d{1,3}\.\d{4,}(?![\d.])/g,
    confidence: 92,
    accept: (raw) => {
      const [lat = '', lon = ''] = raw.split(',');
      return Math.abs(Number(lat)) <= 90 && Math.abs(Number(lon)) <= 180;
    },
    mask: () => '•••.•••• , •••.••••',
  },
  {
    category: 'Email',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    confidence: 98,
    mask: (raw) => raw.replace(/^(.)[^@]*@/, '$1•••@'),
  },
  {
    category: 'Phone',
    pattern: /(?<![\w.])\+?\d[\d\s().-]{8,}\d(?![\w.])/g,
    confidence: 94,
    accept: (raw) => {
      const length = digitsOf(raw).length;
      return length >= 10 && length <= 15;
    },
    mask: (raw) => `•••• ••${digitsOf(raw).slice(-2)}`,
  },
  {
    category: 'Street Address/GPS',
    pattern: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Boulevard|Blvd|Drive|Dr|Way)\b\.?/g,
    confidence: 84,
    mask: () => '••• [street name hidden]',
  },
  {
    category: 'Secret/API Key',
    pattern: /\b(?:sk_(?:live|test)_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,})\b|\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*["']?[^\s"',;]{6,}/gi,
    confidence: 95,
    mask: () => '•••••• (secret hidden)',
  },
];

export function detectInText(text: string): Detection[] {
  const found: Detection[] = [];
  for (const rule of RULES) {
    for (const match of Array.from(text.matchAll(rule.pattern))) {
      const raw = match[0];
      const start = match.index ?? 0;
      const end = start + raw.length;
      if (rule.accept && !rule.accept(raw)) continue;
      if (found.some((existing) => start < existing.end && end > existing.start)) continue;
      found.push({ category: rule.category, start, end, raw, masked: rule.mask(raw), confidence: rule.confidence });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

export function findingId(modality: Modality, unitIndex: number, start: number): string {
  return `${modality}:${unitIndex}:${start}`;
}

export function scanUnits(units: Unit[], modality: Modality): ScanFinding[] {
  return units.flatMap((unit, unitIndex) =>
    detectInText(unit.text).map((detection) => ({
      id: findingId(modality, unitIndex, detection.start),
      modality,
      category: detection.category,
      confidence: detection.confidence,
      location: unit.label,
      masked: detection.masked,
      raw: detection.raw,
      action: 'redact' as const,
    })),
  );
}

export function redactUnits(units: Unit[], modality: Modality, redactIds: Set<string>): string[] {
  return units.map((unit, unitIndex) => {
    const spans = detectInText(unit.text)
      .filter((detection) => redactIds.has(findingId(modality, unitIndex, detection.start)))
      .sort((a, b) => b.start - a.start);
    let output = unit.text;
    for (const span of spans) {
      output = `${output.slice(0, span.start)}${REDACTED_MARK}${output.slice(span.end)}`;
    }
    return output;
  });
}

export function moduleStatuses(input: ScanInput): ModuleStatus[] {
  const stateFor = (id: ModuleId, available: boolean | null): ModuleState => {
    if (!input.enabled[id]) return 'Disabled';
    if (available === null) return 'Not configured';
    return available ? 'Checked' : 'No input supplied';
  };
  return [
    { id: 'ocr', label: MODULE_LABELS.ocr, state: stateFor('ocr', null) },
    { id: 'face', label: MODULE_LABELS.face, state: stateFor('face', null) },
    { id: 'plate', label: MODULE_LABELS.plate, state: stateFor('plate', null) },
    { id: 'audio', label: MODULE_LABELS.audio, state: stateFor('audio', input.hasTranscript ? true : null) },
    { id: 'subtitles', label: MODULE_LABELS.subtitles, state: stateFor('subtitles', input.hasSubtitles) },
    { id: 'metadata', label: MODULE_LABELS.metadata, state: stateFor('metadata', input.hasVideo) },
    { id: 'thumbnail', label: MODULE_LABELS.thumbnail, state: stateFor('thumbnail', input.hasThumbnail) },
  ];
}
