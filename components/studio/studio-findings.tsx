'use client';

import { useState } from 'react';
import { Check, CircleAlert, EyeOff, Film, Info, LockKeyhole } from 'lucide-react';
import { FindingAction, FindingCategory, Modality, ModuleStatus, ScanFinding } from '@/lib/privacy/scan-engine';
import { cueLabel } from '@/lib/privacy/subtitles';
import { ScanReport } from '@/lib/privacy/studio-pipeline';

const MODALITY_FILTERS: Array<Modality | 'All'> = ['All', 'Video Frame OCR', 'Visual Objects', 'Audio Speech', 'Subtitles', 'Container Metadata', 'Supplied Thumbnail'];
const CATEGORY_FILTERS: Array<FindingCategory | 'All'> = ['All', 'Email', 'Phone', 'Street Address/GPS', 'Secret/API Key', 'Payment card', 'Face', 'License Plate', 'Metadata'];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function VideoSummary({ report }: { report: ScanReport }): JSX.Element {
  const counts = MODALITY_FILTERS.slice(1).map((modality) => ({
    modality,
    count: report.findings.filter((finding) => finding.modality === modality).length,
  }));
  return (
    <section className="panel studio-section studio-summary">
      <div className="panel-header">
        <div><span className="section-kicker">SCAN RESULT</span><h2>{report.findings.length === 0 ? 'No flagged content found' : `${report.findings.length} finding${report.findings.length === 1 ? '' : 's'} need review`}</h2></div>
        <Film size={18} />
      </div>
      <div className="studio-summary-grid">
        <div className="studio-fact"><span>Video</span><b>{report.videoName ?? 'Not supplied'}</b><small>{report.videoName ? `${formatBytes(report.videoSize)} · ${report.videoFormat ?? 'Unknown'}` : 'Companion files only'}</small></div>
        <div className="studio-fact"><span>Original SHA-256</span><b className="mono">{report.videoSha256 ? `${report.videoSha256.slice(0, 16)}…` : 'Not computed'}</b><small>Used to confirm the original is unchanged</small></div>
        <div className="studio-fact"><span>Bounding-box inspector</span><b>Not available</b><small>Needs a visual detection engine</small></div>
      </div>
      <div className="studio-count-row">
        {counts.map((item) => <span key={item.modality} className={item.count > 0 ? 'has-count' : ''}>{item.modality} <b>{item.count}</b></span>)}
      </div>
      <details className="studio-logs">
        <summary>Engine progress and job log</summary>
        <ol>{report.logs.map((line) => <li key={line}>{line}</li>)}</ol>
      </details>
    </section>
  );
}

const STATE_CLASS: Record<ModuleStatus['state'], string> = {
  Checked: 'ok',
  'No input supplied': 'idle',
  'Not configured': 'warn',
  Disabled: 'idle',
};

export function ModuleMatrix({ modules }: { modules: ModuleStatus[] }): JSX.Element {
  return (
    <>
      <div className="panel-header">
        <div><span className="section-kicker">7-CHECK MATRIX</span><h2>What was checked</h2></div>
        <Info size={18} />
      </div>
      <div className="studio-matrix">
        {modules.map((module) => (
          <div key={module.id} className="studio-matrix-cell">
            <span>{module.label}</span>
            <b className={`studio-chip ${STATE_CLASS[module.state]}`}>{module.state}</b>
          </div>
        ))}
      </div>
      <p className="studio-note">Modules marked Not configured are not run in this build, so a clean result for them does not mean the content is clean.</p>
    </>
  );
}

export function RiskTimeline({ report }: { report: ScanReport }): JSX.Element {
  const cues = report.subtitleCues;
  if (cues.length === 0) {
    return (
      <>
        <div className="panel-header"><div><span className="section-kicker">RISK TIMELINE</span><h2>Timeline</h2></div></div>
        <p className="studio-note">The timeline needs timed subtitles. Add an SRT or VTT file to see where in the video each finding appears.</p>
      </>
    );
  }
  const labels = cues.map((cue, index) => cueLabel(index, cue));
  return (
    <>
      <div className="panel-header"><div><span className="section-kicker">RISK TIMELINE</span><h2>Where findings appear</h2></div></div>
      <div className="studio-timeline" role="list">
        {cues.map((cue, index) => {
          const hits = report.findings.filter((finding) => finding.location === labels[index]).length;
          return (
            <div key={labels[index]} role="listitem" className={`studio-timeline-cell ${hits > 0 ? 'hit' : ''}`} title={`${cue.start} · ${hits} finding${hits === 1 ? '' : 's'}`}>
              <span>{cue.start.slice(0, 8)}</span>
            </div>
          );
        })}
      </div>
      <p className="studio-note">Each block is one subtitle cue. Highlighted blocks contain at least one finding.</p>
    </>
  );
}

export function FindingsTable({ findings, actions, onChange }: { findings: ScanFinding[]; actions: Record<string, FindingAction>; onChange: (next: Record<string, FindingAction>) => void }): JSX.Element {
  const [modality, setModality] = useState<Modality | 'All'>('All');
  const [category, setCategory] = useState<FindingCategory | 'All'>('All');
  const [showRaw, setShowRaw] = useState(false);
  const visible = findings.filter((finding) => (modality === 'All' || finding.modality === modality) && (category === 'All' || finding.category === category));
  const actionFor = (finding: ScanFinding): FindingAction => actions[finding.id] ?? finding.action;
  const setAll = (action: FindingAction): void => onChange(Object.fromEntries(findings.map((finding): [string, FindingAction] => [finding.id, action])));
  const redactCount = findings.filter((finding) => actionFor(finding) === 'redact').length;

  return (
    <>
      <div className="panel-header">
        <div><span className="section-kicker">FINDINGS REVIEW</span><h2>{findings.length} finding{findings.length === 1 ? '' : 's'} · {redactCount} marked to redact</h2></div>
        <EyeOff size={18} />
      </div>
      <div className="studio-filters">
        <label><span>Modality</span>
          <select value={modality} onChange={(event) => setModality(event.target.value as Modality | 'All')}>
            {MODALITY_FILTERS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label><span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as FindingCategory | 'All')}>
            {CATEGORY_FILTERS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="studio-checkbox">
          <input type="checkbox" checked={showRaw} onChange={(event) => setShowRaw(event.target.checked)} />
          Show unmasked text
        </label>
      </div>
      <div className="studio-bulk">
        <button className="button outline small" onClick={() => setAll('redact')} disabled={findings.length === 0}>Redact all</button>
        <button className="button outline small" onClick={() => setAll('ignore')} disabled={findings.length === 0}>Ignore all</button>
        <button className="button ghost small" onClick={() => onChange({})} disabled={findings.length === 0}>Apply recommended</button>
      </div>

      {findings.length === 0 ? (
        <div className="success-callout"><Check size={19} /><div><b>Nothing flagged</b><p>The checks that ran did not find personal details. Checks marked Not configured were not run.</p></div></div>
      ) : (
        <div className="studio-table-wrap">
          <table className="studio-table">
            <thead>
              <tr><th>Modality</th><th>Category</th><th>Confidence</th><th>Location</th><th>Evidence</th><th>Action</th></tr>
            </thead>
            <tbody>
              {visible.map((finding) => (
                <tr key={finding.id}>
                  <td>{finding.modality}</td>
                  <td>{finding.category}</td>
                  <td>{finding.confidence}%</td>
                  <td>{finding.location}</td>
                  <td className="mono">{showRaw && finding.raw ? finding.raw : finding.masked}</td>
                  <td>
                    <select value={actionFor(finding)} onChange={(event) => onChange({ ...actions, [finding.id]: event.target.value as FindingAction })} aria-label={`Action for ${finding.category}`}>
                      <option value="redact">Redact</option>
                      <option value="ignore">Ignore</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p className="studio-note">No findings match these filters.</p>}
        </div>
      )}
      <p className="studio-note"><LockKeyhole size={13} /> Masked by default. Unmasked text stays in this browser tab only.</p>
      {findings.some((finding) => finding.modality === 'Container Metadata') && (
        <p className="studio-note"><CircleAlert size={13} /> Container metadata cannot be removed from the video in this build. Those findings stay open after repair.</p>
      )}
    </>
  );
}
