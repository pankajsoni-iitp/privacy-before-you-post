import { detectInText, findingId, Modality, ScanFinding } from './scan-engine';

export type MediaFormat = 'MP4 / MOV' | 'WebM / MKV' | 'AVI' | 'PNG' | 'JPEG' | 'Unknown';

export const SCAN_WINDOW_BYTES = 16 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const TEXT_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt']);
const STRIPPED_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function asciiAt(bytes: Uint8Array, start: number, end: number): string {
  let value = '';
  for (let i = start; i < Math.min(end, bytes.length); i += 1) value += String.fromCharCode(bytes[i]);
  return value;
}

export function detectFormat(bytes: Uint8Array): MediaFormat {
  if (bytes.length >= 12 && ['ftyp', 'moov', 'mdat', 'free', 'wide'].includes(asciiAt(bytes, 4, 8))) return 'MP4 / MOV';
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'WebM / MKV';
  if (bytes.length >= 12 && asciiAt(bytes, 0, 4) === 'RIFF' && asciiAt(bytes, 8, 12) === 'AVI ') return 'AVI';
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return 'PNG';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'JPEG';
  return 'Unknown';
}

function printableRuns(bytes: Uint8Array, baseOffset: number): Array<{ offset: number; value: string }> {
  const runs: Array<{ offset: number; value: string }> = [];
  let start = -1;
  let buffer = '';
  for (let i = 0; i <= bytes.length; i += 1) {
    const byte = i < bytes.length ? bytes[i] : 0;
    if (byte >= 0x20 && byte <= 0x7e) {
      if (start === -1) start = i;
      buffer += String.fromCharCode(byte);
      continue;
    }
    if (start !== -1 && buffer.length >= 6) runs.push({ offset: baseOffset + start, value: buffer });
    start = -1;
    buffer = '';
  }
  return runs;
}

const LOCATION_ATOM = [0xa9, 0x78, 0x79, 0x7a];

export function inspectBinary(bytes: Uint8Array, baseOffset: number, modality: Modality): ScanFinding[] {
  const findings: ScanFinding[] = [];
  for (const run of printableRuns(bytes, baseOffset)) {
    for (const detection of detectInText(run.value)) {
      const position = run.offset + detection.start;
      findings.push({
        id: `${modality}:bytes:${position}`,
        modality,
        category: detection.category,
        confidence: detection.confidence,
        location: `Byte ${position}`,
        masked: detection.masked,
        raw: detection.raw,
        action: 'redact',
      });
    }
  }
  for (let i = 0; i + LOCATION_ATOM.length <= bytes.length; i += 1) {
    if (LOCATION_ATOM.every((byte, offset) => bytes[i + offset] === byte)) {
      findings.push({
        id: `${modality}:location:${baseOffset + i}`,
        modality,
        category: 'Street Address/GPS',
        confidence: 90,
        location: `Byte ${baseOffset + i}`,
        masked: 'Location atom (values hidden)',
        raw: '',
        action: 'redact',
      });
    }
  }
  return findings;
}

export interface PngChunk {
  type: string;
  start: number;
  end: number;
  data: Uint8Array;
}

export function readPngChunks(bytes: Uint8Array): PngChunk[] | null {
  if (detectFormat(bytes) !== 'PNG') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  let position = 8;
  while (position + 12 <= bytes.length) {
    const length = view.getUint32(position);
    const end = position + 12 + length;
    if (end > bytes.length) break;
    const type = asciiAt(bytes, position + 4, position + 8);
    chunks.push({ type, start: position, end, data: bytes.subarray(position + 8, position + 8 + length) });
    position = end;
    if (type === 'IEND') break;
  }
  return chunks;
}

function latin1(data: Uint8Array): string {
  return new TextDecoder('latin1').decode(data);
}

export function inspectThumbnail(bytes: Uint8Array): ScanFinding[] {
  const modality: Modality = 'Supplied Thumbnail';
  const chunks = readPngChunks(bytes);
  if (!chunks) return inspectBinary(bytes.subarray(0, SCAN_WINDOW_BYTES), 0, modality);
  const findings: ScanFinding[] = [];
  for (const chunk of chunks) {
    if (TEXT_CHUNKS.has(chunk.type) || chunk.type === 'eXIf' || chunk.type === 'tIME') {
      findings.push({
        id: `${modality}:chunk:${chunk.start}`,
        modality,
        category: 'Metadata',
        confidence: 80,
        location: `${chunk.type} chunk at byte ${chunk.start}`,
        masked: `${chunk.type} chunk (contents hidden)`,
        raw: '',
        action: 'redact',
      });
    }
    if (TEXT_CHUNKS.has(chunk.type)) {
      for (const detection of detectInText(latin1(chunk.data))) {
        findings.push({
          id: findingId(modality, chunk.start, detection.start),
          modality,
          category: detection.category,
          confidence: detection.confidence,
          location: `${chunk.type} chunk at byte ${chunk.start}`,
          masked: detection.masked,
          raw: detection.raw,
          action: 'redact',
        });
      }
    }
  }
  return findings;
}

export function stripPngMetadata(bytes: Uint8Array): Uint8Array | null {
  const chunks = readPngChunks(bytes);
  if (!chunks) return null;
  const kept = chunks.filter((chunk) => !STRIPPED_CHUNKS.has(chunk.type));
  const total = 8 + kept.reduce((sum, chunk) => sum + (chunk.end - chunk.start), 0);
  const output = new Uint8Array(total);
  output.set(bytes.subarray(0, 8), 0);
  let position = 8;
  for (const chunk of kept) {
    output.set(bytes.subarray(chunk.start, chunk.end), position);
    position += chunk.end - chunk.start;
  }
  return output;
}

const CRC_TABLE: number[] = Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

export function buildPng(textEntries: Array<{ keyword: string; value: string }>): Uint8Array {
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, 1);
  headerView.setUint32(4, 1);
  header[8] = 8;
  header[9] = 2;
  const parts: Uint8Array[] = [new Uint8Array(PNG_SIGNATURE), pngChunk('IHDR', header)];
  for (const entry of textEntries) {
    const body = new TextEncoder().encode(`${entry.keyword}\u0000${entry.value}`);
    parts.push(pngChunk('tEXt', body));
  }
  parts.push(pngChunk('IEND', new Uint8Array(0)));
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let position = 0;
  for (const part of parts) {
    output.set(part, position);
    position += part.length;
  }
  return output;
}

export async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
