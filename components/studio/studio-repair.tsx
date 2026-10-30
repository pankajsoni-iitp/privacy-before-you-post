'use client';

import { useState } from 'react';
import { Check, CircleAlert, Download, Eraser, Play, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { ModuleStatus } from '@/lib/privacy/scan-engine';
import { RepairResult, RepairSettings, ScanReport, Verification } from '@/lib/privacy/studio-pipeline';
import { runStudioTests, TestResult } from '@/lib/privacy/studio-tests';

export interface RepairDownload {
  name: string;
  note: string;
  url: string;
}

export interface RepairOptions extends RepairSettings {
  autoRescan: boolean;
}

interface RepairPanelProps {
  report: ScanReport;
  settings: RepairOptions;
  onSettings: (next: RepairOptions) => void;
  repair: RepairResult | null;
  downloads: RepairDownload[];
  verification: Verification | null;
  onRepair: () => void;
  onRescan: () => void;
}

const STATE_CLASS: Record<ModuleStatus['state'], string> = {
  Checked: 'ok',
  'No input supplied': 'idle',
  'Not configured': 'warn',
  Disabled: 'idle',
};

export function RepairPanel({ report, settings, onSettings, repair, downloads, verification, onRepair, onRescan }: RepairPanelProps): JSX.Element {
  const hasTextOutputs = report.subtitleCues.length > 0 || report.transcriptUnits.length > 0 || report.thumbnailBytes !== null;
  return (
    <>
      <div className="panel-header">
        <div><span className="section-kicker">REPAIR & EXPORT</span><h2>Create repaired copies and verify them</h2></div>
        <Eraser size={18} />
      </div>

      <div className="studio-repair-settings">
        <label className="studio-checkbox">
          <input type="checkbox" checked={settings.stripMetadata} onChange={(event) => onSettings({ ...settings, stripMetadata: event.target.checked })} />
          Strip all metadata from the thumbnail copy
        </label>
        <label className="studio-checkbox">
          <input type="checkbox" checked={settings.autoRescan} onChange={(event) => onSettings({ ...settings, autoRescan: event.target.checked })} />
          Auto re-scan exported copies
        </label>
        <label><span>Box padding (px)</span><input type="range" min={0} max={40} defaultValue={8} disabled /><small>Used by visual repair, which is not in this build.</small></label>
        <label><span>Time margin (s)</span><input type="range" min={0} max={5} step={0.5} defaultValue={1} disabled /><small>Used by video repair, which is not in this build.</small></label>
        <label><span>Blur strength</span><input type="range" min={1} max={40} defaultValue={12} disabled /><small>Used by visual repair, which is not in this build.</small></label>
      </div>

      <div className="studio-actions">
        <button className="button primary" onClick={onRepair} disabled={!hasTextOutputs && !report.videoName}><Eraser size={14} /> Create repaired copies</button>
      </div>

      {repair && (
        <div className="studio-downloads">
          {downloads.length === 0 && <p className="studio-note">Nothing was exported. Add subtitles, a transcript, or a PNG thumbnail to create copies.</p>}
          {downloads.map((item) => (
            <a key={item.name} className="studio-download" href={item.url} download={item.name}>
              <Download size={15} />
              <span><b>{item.name}</b><small>{item.note}</small></span>
            </a>
          ))}
          {repair.notes.map((note) => <p key={note} className="studio-note"><CircleAlert size={13} /> {note}</p>)}
        </div>
      )}

      {repair && !settings.autoRescan && !verification && (
        <div className="studio-actions"><button className="button outline" onClick={onRescan}><RefreshCw size={14} /> Re-scan repaired copies</button></div>
      )}

      {verification && (
        <div className="studio-verification">
          <div className="section-kicker">EXPORT & RESCAN VERIFICATION</div>
          <div className="studio-verify-grid">
            <div className="studio-fact"><span>Original unchanged</span><b>{verification.originalUnchanged === null ? 'Not checked' : verification.originalUnchanged ? 'Yes' : 'No'}</b></div>
            <div className="studio-fact"><span>Findings before</span><b>{verification.findingsBefore}</b></div>
            <div className="studio-fact"><span>Resolved</span><b>{verification.resolved}</b></div>
            <div className="studio-fact"><span>Remaining</span><b>{verification.findingsAfter}</b></div>
          </div>
          <div className="studio-matrix">
            {verification.modules.map((module) => (
              <div key={module.id} className="studio-matrix-cell">
                <span>{module.label}</span>
                <b className={`studio-chip ${STATE_CLASS[module.state]}`}>{module.state}</b>
              </div>
            ))}
          </div>
          {verification.notes.map((note) => <p key={note} className="studio-note"><Check size={13} /> {note}</p>)}
          {verification.remaining.length > 0 && (
            <p className="studio-note"><TriangleAlert size={13} /> {verification.remaining.length} finding{verification.remaining.length === 1 ? ' is' : 's are'} still present. Review them in the findings table.</p>
          )}
        </div>
      )}
    </>
  );
}

export function TestSuite(): JSX.Element {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = async (): Promise<void> => {
    setRunning(true);
    setResults(await runStudioTests());
    setRunning(false);
  };

  const passed = results?.filter((result) => result.passed).length ?? 0;

  return (
    <>
      <div className="panel-header">
        <div><span className="section-kicker">AUTOMATED TEST SUITE</span><h2>{results ? `${passed} of ${results.length} checks passed` : '12 built-in checks'}</h2></div>
        <ShieldCheck size={18} />
      </div>
      <div className="studio-actions">
        <button className="button primary" onClick={() => { void run(); }} disabled={running}><Play size={14} /> {running ? 'Running checks' : 'Run test suite'}</button>
      </div>
      {results && (
        <ul className="studio-test-list">
          {results.map((result) => (
            <li key={result.id} className={result.passed ? 'pass' : 'fail'}>
              <span className={`studio-chip ${result.passed ? 'ok' : 'warn'}`}>{result.passed ? <Check size={14} /> : <CircleAlert size={14} />} {result.passed ? 'PASSED' : 'FAILED'}</span>
              <span className="studio-test-copy"><b>{result.name}</b><small>{result.detail} · {result.ms.toFixed(1)} ms</small></span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const LIMITATIONS = [
  'Video frames are not decoded, so frame text (OCR), face detection, and license plate checks do not run.',
  'Speech is not recognized from the audio track. Only a transcript you supply is scanned.',
  'The video is not re-encoded, so no repaired video copy is produced and container metadata stays in the original.',
  'JPG thumbnails are scanned for text, but their metadata is not removed.',
  'Detection uses fixed patterns. Unusual formats can be missed, and some look-alike numbers can be flagged.',
  'Nothing is uploaded. Files are read in this browser tab and are cleared when you reset the workspace.',
  'A clean result is not a guarantee. Review the Not configured checks yourself before publishing.',
];

export function Limitations(): JSX.Element {
  return (
    <>
      <div className="panel-header">
        <div><span className="section-kicker">LIMITATIONS</span><h2>Scope and false-negative risks</h2></div>
        <CircleAlert size={18} />
      </div>
      <ul className="studio-limits">
        {LIMITATIONS.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </>
  );
}
