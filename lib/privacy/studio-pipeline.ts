import { inspectBinary, inspectThumbnail, detectFormat, MediaFormat, sha256Hex, SCAN_WINDOW_BYTES, stripPngMetadata } from './media-containers';
import { Cue, cueUnits, formatSrt, parseCues, transcriptUnits } from './subtitles';
import { moduleStatuses, ModuleId, ModuleStatus, redactUnits, scanUnits, ScanFinding, FindingAction, Unit } from './scan-engine';

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_TEXT_BYTES = 5 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 25 * 1024 * 1024;
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'mkv', 'avi'];

export interface ScanInputs {
  video: File | null;
  subtitles: { name: string; text: string } | null;
  transcript: { name: string; text: string } | null;
  thumbnail: { name: string; bytes: Uint8Array } | null;
  enabled: Record<ModuleId, boolean>;
}

export interface ScanReport {
  videoName: string | null;
  videoSize: number;
  videoFormat: MediaFormat | null;
  videoSha256: string | null;
  subtitleCues: Cue[];
  subtitleUnits: Unit[];
  transcriptUnits: Unit[];
  thumbnailName: string | null;
  thumbnailBytes: Uint8Array | null;
  findings: ScanFinding[];
  modules: ModuleStatus[];
  logs: string[];
  scannedAt: number;
}

export interface RepairOutput {
  name: string;
  note: string;
  blob: Blob;
}

export interface RepairResult {
  outputs: RepairOutput[];
  notes: string[];
  subtitleSrt: string | null;
  transcriptText: string | null;
  thumbnailBytes: Uint8Array | null;
}

export interface Verification {
  originalUnchanged: boolean | null;
  findingsBefore: number;
  findingsAfter: number;
  resolved: number;
  remaining: ScanFinding[];
  modules: ModuleStatus[];
  notes: string[];
}

export interface RepairSettings {
  stripMetadata: boolean;
}

function fileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function validateVideoFile(file: File): string | null {
  if (!VIDEO_EXTENSIONS.includes(fileExtension(file.name))) return 'Choose an MP4, WebM, MOV, MKV, or AVI video.';
  if (file.size > MAX_VIDEO_BYTES) return 'The video is larger than the 500 MB limit.';
  return null;
}

async function readWindow(file: File, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

export async function runScan(inputs: ScanInputs, onProgress: (percent: number, phase: string) => void): Promise<ScanReport> {
  const logs: string[] = [];
  const log = (line: string) => logs.push(`${new Date().toLocaleTimeString()}  ${line}`);
  const findings: ScanFinding[] = [];
  let videoFormat: MediaFormat | null = null;
  let videoSha256: string | null = null;
  let subtitleCues: Cue[] = [];
  let subtitleUnits: Unit[] = [];
  let transcriptList: Unit[] = [];

  onProgress(5, 'Checking files');
  if (inputs.video) {
    const error = validateVideoFile(inputs.video);
    if (error) throw new Error(error);
    const head = await readWindow(inputs.video, 0, SCAN_WINDOW_BYTES);
    videoFormat = detectFormat(head);
    if (videoFormat === 'Unknown') throw new Error('The video does not look like an MP4, WebM, MOV, MKV, or AVI file.');
    log(`Video recognized as ${videoFormat}`);
    onProgress(20, 'Reading container metadata');
    if (inputs.enabled.metadata) {
      findings.push(...inspectBinary(head, 0, 'Container Metadata'));
      const size = inputs.video.size;
      if (size > SCAN_WINDOW_BYTES) {
        const tailStart = size - SCAN_WINDOW_BYTES;
        findings.push(...inspectBinary(await readWindow(inputs.video, tailStart, size), tailStart, 'Container Metadata'));
      }
      log(`Container metadata checked (${findings.length} signal${findings.length === 1 ? '' : 's'})`);
    }
    onProgress(40, 'Fingerprinting original file');
    videoSha256 = await sha256Hex(await inputs.video.arrayBuffer());
    log('Original SHA-256 recorded');
  }

  if (inputs.subtitles && inputs.enabled.subtitles) {
    onProgress(55, 'Scanning subtitles');
    subtitleCues = parseCues(inputs.subtitles.text);
    if (subtitleCues.length === 0) throw new Error('The subtitle file has no readable timed cues.');
    subtitleUnits = cueUnits(subtitleCues);
    findings.push(...scanUnits(subtitleUnits, 'Subtitles'));
    log(`Subtitles scanned (${subtitleCues.length} cues)`);
  }

  if (inputs.transcript && inputs.enabled.audio) {
    onProgress(70, 'Scanning transcript');
    transcriptList = transcriptUnits(inputs.transcript.text);
    if (transcriptList.length === 0) throw new Error('The transcript has no readable text segments.');
    findings.push(...scanUnits(transcriptList, 'Audio Speech'));
    log(`Transcript scanned (${transcriptList.length} segments)`);
  }

  if (inputs.thumbnail && inputs.enabled.thumbnail) {
    onProgress(85, 'Inspecting thumbnail');
    const format = detectFormat(inputs.thumbnail.bytes);
    if (format !== 'PNG' && format !== 'JPEG') throw new Error('The thumbnail must be a PNG or JPG image.');
    findings.push(...inspectThumbnail(inputs.thumbnail.bytes));
    log(`Thumbnail inspected (${format})`);
  }

  onProgress(100, 'Scan complete');
  const modules = moduleStatuses({
    hasVideo: inputs.video !== null,
    hasSubtitles: inputs.subtitles !== null,
    hasTranscript: inputs.transcript !== null,
    hasThumbnail: inputs.thumbnail !== null,
    enabled: inputs.enabled,
  });
  return {
    videoName: inputs.video?.name ?? null,
    videoSize: inputs.video?.size ?? 0,
    videoFormat,
    videoSha256,
    subtitleCues,
    subtitleUnits,
    transcriptUnits: transcriptList,
    thumbnailName: inputs.thumbnail?.name ?? null,
    thumbnailBytes: inputs.thumbnail?.bytes ?? null,
    findings,
    modules,
    logs,
    scannedAt: Date.now(),
  };
}

function redactIdsFrom(findings: ScanFinding[], actions: Record<string, FindingAction>): Set<string> {
  return new Set(
    findings
      .filter((finding) => (actions[finding.id] ?? finding.action) === 'redact' && (finding.modality === 'Subtitles' || finding.modality === 'Audio Speech'))
      .map((finding) => finding.id),
  );
}

export function buildRepair(report: ScanReport, settings: RepairSettings, actions: Record<string, FindingAction>): RepairResult {
  const redactIds = redactIdsFrom(report.findings, actions);
  const outputs: RepairOutput[] = [];
  const notes: string[] = [];
  let subtitleSrt: string | null = null;
  let transcriptText: string | null = null;
  let thumbnailBytes: Uint8Array | null = null;

  if (report.subtitleCues.length > 0) {
    const texts = redactUnits(report.subtitleUnits, 'Subtitles', redactIds);
    subtitleSrt = formatSrt(report.subtitleCues, texts);
    outputs.push({ name: 'sanitized-subtitles.srt', note: 'Subtitles with flagged text replaced', blob: new Blob([subtitleSrt], { type: 'text/plain' }) });
  }

  if (report.transcriptUnits.length > 0) {
    const texts = redactUnits(report.transcriptUnits, 'Audio Speech', redactIds);
    transcriptText = report.transcriptUnits.map((unit, index) => `${unit.label}: ${texts[index]}`).join('\n');
    outputs.push({ name: 'redacted-transcript.txt', note: 'Transcript with flagged text replaced', blob: new Blob([transcriptText], { type: 'text/plain' }) });
  }

  if (report.thumbnailBytes) {
    const format = detectFormat(report.thumbnailBytes);
    if (format === 'PNG' && settings.stripMetadata) {
      thumbnailBytes = stripPngMetadata(report.thumbnailBytes);
      if (thumbnailBytes) {
        outputs.push({ name: 'clean-thumbnail.png', note: 'PNG with text and EXIF chunks removed', blob: new Blob([thumbnailBytes], { type: 'image/png' }) });
      }
    } else if (format === 'JPEG' && settings.stripMetadata) {
      notes.push('JPG metadata removal is not available in this build, so the thumbnail was not repaired.');
    }
  }

  if (report.videoName) {
    notes.push('A repaired video copy is not available in this build because it needs a video re-encoding engine. Container metadata in the original video remains.');
  }

  return { outputs, notes, subtitleSrt, transcriptText, thumbnailBytes };
}

export async function verifyRepair(report: ScanReport, repair: RepairResult, videoFile: File | null, enabled: Record<ModuleId, boolean>): Promise<Verification> {
  const afterFindings: ScanFinding[] = report.findings.filter((finding) => finding.modality === 'Container Metadata');
  if (repair.subtitleSrt !== null) {
    afterFindings.push(...scanUnits(cueUnits(parseCues(repair.subtitleSrt)), 'Subtitles'));
  } else {
    afterFindings.push(...report.findings.filter((finding) => finding.modality === 'Subtitles'));
  }
  if (repair.transcriptText !== null) {
    afterFindings.push(...scanUnits([{ label: 'Repaired transcript', text: repair.transcriptText }], 'Audio Speech'));
  } else {
    afterFindings.push(...report.findings.filter((finding) => finding.modality === 'Audio Speech'));
  }
  if (repair.thumbnailBytes) {
    afterFindings.push(...inspectThumbnail(repair.thumbnailBytes));
  } else {
    afterFindings.push(...report.findings.filter((finding) => finding.modality === 'Supplied Thumbnail'));
  }

  let originalUnchanged: boolean | null = null;
  if (videoFile && report.videoSha256) {
    originalUnchanged = (await sha256Hex(await videoFile.arrayBuffer())) === report.videoSha256;
  }

  const notes: string[] = [];
  if (originalUnchanged === true) notes.push('The original video file is unchanged (SHA-256 matches).');
  if (originalUnchanged === false) notes.push('The original video file changed after scanning. Re-scan before trusting these results.');

  const modules = moduleStatuses({
    hasVideo: report.videoName !== null,
    hasSubtitles: report.subtitleCues.length > 0,
    hasTranscript: report.transcriptUnits.length > 0,
    hasThumbnail: report.thumbnailBytes !== null,
    enabled,
  });

  return {
    originalUnchanged,
    findingsBefore: report.findings.length,
    findingsAfter: afterFindings.length,
    resolved: Math.max(0, report.findings.length - afterFindings.length),
    remaining: afterFindings,
    modules,
    notes,
  };
}
