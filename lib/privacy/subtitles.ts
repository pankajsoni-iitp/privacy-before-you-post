import { Unit } from './scan-engine';

export interface Cue {
  start: string;
  end: string;
  text: string;
  startMs: number;
}

const TIMESTAMP = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/;

export function toMilliseconds(stamp: string): number | null {
  const match = TIMESTAMP.exec(stamp.trim());
  if (!match) return null;
  const [, hours = '0', minutes = '0', seconds = '0', fraction = '0'] = match;
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(fraction.padEnd(3, '0'));
}

export function parseCues(input: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of input.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    const arrow = lines.findIndex((line) => line.includes('-->'));
    if (arrow === -1) continue;
    const [startRaw = '', endRaw = ''] = lines[arrow].split('-->').map((part) => part.trim().split(/\s+/)[0] ?? '');
    const startMs = toMilliseconds(startRaw);
    const endMs = toMilliseconds(endRaw);
    const text = lines.slice(arrow + 1).join('\n').trim();
    if (startMs === null || endMs === null || !text) continue;
    cues.push({ start: startRaw, end: endRaw, text, startMs });
  }
  return cues;
}

export function cueLabel(index: number, cue: Cue): string {
  return `Cue ${index + 1} · ${cue.start}`;
}

export function cueUnits(cues: Cue[]): Unit[] {
  return cues.map((cue, index) => ({ label: cueLabel(index, cue), text: cue.text }));
}

export function formatSrt(cues: Cue[], texts: string[]): string {
  return `${cues
    .map((cue, index) => `${index + 1}\n${cue.start.replace('.', ',')} --> ${cue.end.replace('.', ',')}\n${texts[index]}`)
    .join('\n\n')}\n`;
}

function collectTranscriptText(value: unknown, units: Unit[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTranscriptText(item, units);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'text' && typeof child === 'string' && child.trim() !== '') {
        units.push({ label: `Segment ${units.length + 1}`, text: child });
      } else {
        collectTranscriptText(child, units);
      }
    }
  }
}

export function transcriptUnits(input: string): Unit[] {
  try {
    const units: Unit[] = [];
    collectTranscriptText(JSON.parse(input) as unknown, units);
    return units;
  } catch {
    return cueUnits(parseCues(input));
  }
}
