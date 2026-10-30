import { buildPng, detectFormat, inspectThumbnail, readPngChunks, sha256Hex, stripPngMetadata } from './media-containers';
import { cueUnits, formatSrt, parseCues } from './subtitles';
import { detectInText, moduleStatuses, redactUnits, scanUnits, ScanFinding } from './scan-engine';

export interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  detail: string;
  ms: number;
}

interface TestCase {
  name: string;
  run: () => Promise<string>;
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const SAMPLE_SRT = '1\n00:00:01,000 --> 00:00:03,000\nEmail me at jane.doe@example.com\n\n2\n00:00:04,000 --> 00:00:06,000\nCall +1 415 555 0132 after class';

function hasCategory(findings: ScanFinding[], category: string): boolean {
  return findings.some((finding) => finding.category === category);
}

const TESTS: TestCase[] = [
  {
    name: 'Email address is detected and masked',
    run: async () => {
      const found = detectInText('Contact jane.doe@example.com today');
      expect(found.some((item) => item.category === 'Email'), 'Email was not detected');
      expect(!found.some((item) => item.masked.includes('jane.doe')), 'Masked value still shows the local part');
      return 'Email detected with local part hidden';
    },
  },
  {
    name: 'Phone number is detected',
    run: async () => {
      expect(detectInText('Call +1 415 555 0132 now').some((item) => item.category === 'Phone'), 'Phone was not detected');
      return 'Phone number detected';
    },
  },
  {
    name: 'GPS coordinates are detected',
    run: async () => {
      expect(detectInText('Pinned at 28.61390, 77.20900').some((item) => item.category === 'Street Address/GPS'), 'GPS was not detected');
      return 'Coordinate pair detected';
    },
  },
  {
    name: 'Version numbers are not flagged as GPS',
    run: async () => {
      expect(!detectInText('Build 1.2, 3.4 and v10.2.1 shipped').some((item) => item.category === 'Street Address/GPS'), 'Version numbers were flagged');
      return 'No false GPS match on version numbers';
    },
  },
  {
    name: 'Payment card numbers require a valid checksum',
    run: async () => {
      expect(detectInText('Card 4111 1111 1111 1111').some((item) => item.category === 'Payment card'), 'Valid card was not detected');
      expect(!detectInText('Card 4111 1111 1111 1112').some((item) => item.category === 'Payment card'), 'Invalid checksum was accepted');
      return 'Luhn-valid card detected; invalid number rejected';
    },
  },
  {
    name: 'API keys and secrets are detected',
    run: async () => {
      expect(detectInText('config sk_live_EXAMPLE1234567890').some((item) => item.category === 'Secret/API Key'), 'Secret was not detected');
      return 'Secret token detected and hidden';
    },
  },
  {
    name: 'Subtitle cues parse with timings',
    run: async () => {
      const cues = parseCues(SAMPLE_SRT);
      expect(cues.length === 2, `Expected 2 cues, found ${cues.length}`);
      expect(cues[0].startMs === 1000, 'Start time did not parse to 1000 ms');
      return '2 cues parsed with correct start time';
    },
  },
  {
    name: 'Sanitized subtitles remove email and phone',
    run: async () => {
      const units = cueUnits(parseCues(SAMPLE_SRT));
      const ids = new Set(scanUnits(units, 'Subtitles').map((finding) => finding.id));
      const cleaned = redactUnits(units, 'Subtitles', ids);
      const output = formatSrt(parseCues(SAMPLE_SRT), cleaned);
      expect(!output.includes('@') && !output.includes('555 0132'), 'Sensitive text survived sanitizing');
      return 'Email and phone replaced in exported subtitles';
    },
  },
  {
    name: 'PNG text metadata is detected and stripped',
    run: async () => {
      const png = buildPng([{ keyword: 'Author', value: 'jane.doe@example.com' }]);
      expect(hasCategory(inspectThumbnail(png), 'Email'), 'Email in PNG text chunk was not detected');
      const stripped = stripPngMetadata(png);
      expect(stripped !== null, 'PNG could not be rebuilt');
      expect(readPngChunks(stripped as Uint8Array)?.every((chunk) => chunk.type !== 'tEXt') === true, 'Text chunk survived stripping');
      return 'Text chunk found, then removed from the copy';
    },
  },
  {
    name: 'MP4 container signature is recognized',
    run: async () => {
      const header = new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0]);
      expect(detectFormat(header) === 'MP4 / MOV', 'MP4 header not recognized');
      return 'ftyp box identified as MP4 / MOV';
    },
  },
  {
    name: 'Audio speech reports Not configured without a transcript',
    run: async () => {
      const status = moduleStatuses({
        hasVideo: true,
        hasSubtitles: false,
        hasTranscript: false,
        hasThumbnail: false,
        enabled: { ocr: true, face: true, plate: true, audio: true, subtitles: true, metadata: true, thumbnail: true },
      }).find((item) => item.id === 'audio');
      expect(status?.state === 'Not configured', `Audio state was ${status?.state ?? 'missing'}`);
      return 'Audio PII shows Not configured as expected';
    },
  },
  {
    name: 'SHA-256 matches a known digest',
    run: async () => {
      const digest = await sha256Hex(new TextEncoder().encode('abc'));
      expect(digest === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'Digest mismatch');
      return 'Hash matches the published SHA-256 test vector';
    },
  },
];

export async function runStudioTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  for (let index = 0; index < TESTS.length; index += 1) {
    const test = TESTS[index];
    const started = performance.now();
    try {
      const detail = await test.run();
      results.push({ id: index + 1, name: test.name, passed: true, detail, ms: performance.now() - started });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      results.push({ id: index + 1, name: test.name, passed: false, detail, ms: performance.now() - started });
    }
  }
  return results;
}
