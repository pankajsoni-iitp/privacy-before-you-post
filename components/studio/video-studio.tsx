'use client';

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, FileText, Film, FileImage, Mic, Moon, RotateCcw, ScanSearch, ShieldCheck, Sparkles, Sun, Upload, X } from 'lucide-react';
import { ModuleId, FindingAction, MODULE_IDS, MODULE_LABELS } from '@/lib/privacy/scan-engine';
import { buildSampleThumbnail, SAMPLE_SUBTITLES, SAMPLE_TRANSCRIPT } from '@/lib/privacy/studio-samples';
import { buildRepair, MAX_TEXT_BYTES, MAX_THUMBNAIL_BYTES, RepairResult, runScan, ScanReport, verifyRepair, Verification, validateVideoFile } from '@/lib/privacy/studio-pipeline';
import { ModuleMatrix, RiskTimeline, FindingsTable, VideoSummary } from './studio-findings';
import { Limitations, RepairDownload, RepairOptions, RepairPanel, TestSuite } from './studio-repair';

const ALL_ENABLED: Record<ModuleId, boolean> = { ocr: true, face: true, plate: true, audio: true, subtitles: true, metadata: true, thumbnail: true };

interface TextInput {
  name: string;
  text: string;
}

interface ImageInput {
  name: string;
  bytes: Uint8Array;
}

type ScanStatus = 'idle' | 'scanning' | 'done' | 'error';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function FileSlot({ icon: Icon, title, hint, accept, file, onPick, onClear }: { icon: typeof Film; title: string; hint: string; accept: string; file: string | null; onPick: (file: File) => void; onClear: () => void }): JSX.Element {
  return (
    <label className={`studio-slot ${file ? 'filled' : ''}`}>
      <span className="studio-slot-icon"><Icon size={16} /></span>
      <span className="studio-slot-copy">
        <b>{title}</b>
        <small>{file ?? hint}</small>
      </span>
      {file ? (
        <button type="button" className="studio-icon-button" aria-label={`Remove ${title.toLowerCase()}`} onClick={(event) => { event.preventDefault(); onClear(); }}><X size={14} /></button>
      ) : (
        <span className="studio-slot-action"><Upload size={14} /></span>
      )}
      <input type="file" accept={accept} onChange={(event: ChangeEvent<HTMLInputElement>) => { const picked = event.target.files?.[0]; if (picked) onPick(picked); event.target.value = ''; }} hidden />
    </label>
  );
}

export function VideoStudio(): JSX.Element {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [video, setVideo] = useState<File | null>(null);
  const [subtitles, setSubtitles] = useState<TextInput | null>(null);
  const [transcript, setTranscript] = useState<TextInput | null>(null);
  const [thumbnail, setThumbnail] = useState<ImageInput | null>(null);
  const [includeTranscript, setIncludeTranscript] = useState(true);
  const [enabled, setEnabled] = useState<Record<ModuleId, boolean>>(ALL_ENABLED);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [progress, setProgress] = useState({ percent: 0, phase: 'Add a video or companion files to begin' });
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [actions, setActions] = useState<Record<string, FindingAction>>({});
  const [settings, setSettings] = useState<RepairOptions>({ stripMetadata: true, autoRescan: true });
  const [repair, setRepair] = useState<RepairResult | null>(null);
  const [downloads, setDownloads] = useState<RepairDownload[]>([]);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [dragging, setDragging] = useState(false);
  const runRef = useRef(0);
  const urlsRef = useRef<string[]>([]);

  const revokeDownloads = (): void => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current = [];
    setDownloads([]);
  };

  useEffect(() => () => { urlsRef.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  const hasInput = video !== null || subtitles !== null || transcript !== null || thumbnail !== null;

  const resetScanOutputs = (): void => {
    setReport(null);
    setActions({});
    setRepair(null);
    setVerification(null);
    revokeDownloads();
  };

  const chooseVideo = (file: File): void => {
    const problem = validateVideoFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setVideo(file);
    setStatus('idle');
    resetScanOutputs();
  };

  const chooseTextFile = async (file: File, kind: 'subtitles' | 'transcript'): Promise<void> => {
    if (file.size > MAX_TEXT_BYTES) {
      setError('That text file is larger than 5 MB.');
      return;
    }
    try {
      const input = { name: file.name, text: await file.text() };
      setError(null);
      if (kind === 'subtitles') setSubtitles(input);
      else setTranscript(input);
      resetScanOutputs();
    } catch {
      setError(`Could not read ${file.name}. Try saving it again and choosing it once more.`);
    }
  };

  const chooseThumbnail = async (file: File): Promise<void> => {
    if (file.size > MAX_THUMBNAIL_BYTES) {
      setError('That image is larger than 25 MB.');
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setError(null);
      setThumbnail({ name: file.name, bytes });
      resetScanOutputs();
    } catch {
      setError(`Could not read ${file.name}. Try saving it again and choosing it once more.`);
    }
  };

  const loadSample = (): void => {
    setError(null);
    setSubtitles({ name: 'sample-subtitles.srt', text: SAMPLE_SUBTITLES });
    setTranscript({ name: 'sample-transcript.json', text: SAMPLE_TRANSCRIPT });
    setThumbnail({ name: 'sample-thumbnail.png', bytes: buildSampleThumbnail() });
    setIncludeTranscript(true);
    resetScanOutputs();
  };

  const reset = (): void => {
    runRef.current += 1;
    setVideo(null);
    setSubtitles(null);
    setTranscript(null);
    setThumbnail(null);
    setIncludeTranscript(true);
    setEnabled(ALL_ENABLED);
    setStatus('idle');
    setProgress({ percent: 0, phase: 'Add a video or companion files to begin' });
    setError(null);
    setVerification(null);
    setRepair(null);
    setReport(null);
    setActions({});
    revokeDownloads();
  };

  const cancelScan = (): void => {
    runRef.current += 1;
    setStatus('idle');
    setProgress({ percent: 0, phase: 'Scan cancelled' });
  };

  const startScan = async (): Promise<void> => {
    const runId = runRef.current + 1;
    runRef.current = runId;
    setStatus('scanning');
    setError(null);
    resetScanOutputs();
    try {
      const result = await runScan(
        { video, subtitles, transcript: includeTranscript ? transcript : null, thumbnail, enabled },
        (percent, phase) => { if (runRef.current === runId) setProgress({ percent, phase }); },
      );
      if (runRef.current !== runId) return;
      setReport(result);
      setStatus('done');
      setProgress({ percent: 100, phase: 'Scan complete' });
    } catch (caught) {
      if (runRef.current !== runId) return;
      setError(caught instanceof Error ? caught.message : 'The scan could not finish.');
      setStatus('error');
    }
  };

  const verify = async (result: RepairResult): Promise<void> => {
    if (!report) return;
    setVerification(await verifyRepair(report, result, video, enabled));
  };

  const runRepair = async (): Promise<void> => {
    if (!report) return;
    const result = buildRepair(report, settings, actions);
    revokeDownloads();
    urlsRef.current = result.outputs.map((output) => URL.createObjectURL(output.blob));
    setDownloads(result.outputs.map((output, index) => ({ name: output.name, note: output.note, url: urlsRef.current[index] })));
    setRepair(result);
    setVerification(null);
    if (settings.autoRescan) await verify(result);
  };

  const dropVideo = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) chooseVideo(dropped);
  };

  const toggleModule = (id: ModuleId): void => setEnabled((current) => ({ ...current, [id]: !current[id] }));

  const themeClass = theme === 'light' ? 'studio-main theme-light' : 'studio-main theme-dark';

  return (
    <main className={`workspace-main ${themeClass}`}>
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> VIDEO PRIVACY STUDIO</div>
          <h1>Scanner & Repair Studio</h1>
          <p>Scan a video and its companion files for personal details, review each finding, then export a repaired copy and verify it.</p>
        </div>
        <div className="studio-heading-actions">
          <button className="button outline small" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />} {theme === 'light' ? 'Dark Navy' : 'Clean Glass'}
          </button>
          <button className="button ghost small" onClick={reset}><RotateCcw size={14} /> Reset workspace</button>
        </div>
      </div>

      <nav className="studio-jump" aria-label="Studio sections">
        <a href="#intake">Footage intake</a>
        <a href="#timeline">Risk timeline</a>
        <a href="#matrix">7-check matrix</a>
        <a href="#findings">Findings</a>
        <a href="#repair">Repair & verify</a>
        <a href="#tests">Test suite</a>
        <a href="#limits">Limitations</a>
      </nav>

      <section id="intake" className="panel studio-intake">
        <div className="studio-intake-grid">
          <div
            className={`studio-dropzone ${dragging ? 'dragging' : ''} ${video ? 'filled' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={dropVideo}
          >
            <span className="studio-drop-icon"><Film size={22} /></span>
            {video ? (
              <>
                <b>{video.name}</b>
                <small>{formatBytes(video.size)} · original file is read only, never overwritten</small>
              </>
            ) : (
              <>
                <b>Drop a video here</b>
                <small>MP4, WebM, MOV, MKV or AVI · up to 500 MB</small>
              </>
            )}
            <label className="button outline small studio-file-button">
              <Upload size={14} /> {video ? 'Replace video' : 'Choose video'}
              <input type="file" accept=".mp4,.webm,.mov,.mkv,.avi,video/*" onChange={(event) => { const picked = event.target.files?.[0]; if (picked) chooseVideo(picked); event.target.value = ''; }} hidden />
            </label>
          </div>

          <div className="studio-companions">
            <span className="section-kicker">COMPANION FILES</span>
            <FileSlot icon={FileImage} title="Thumbnail" hint="PNG or JPG" accept=".png,.jpg,.jpeg,image/png,image/jpeg" file={thumbnail?.name ?? null} onPick={(file) => { void chooseThumbnail(file); }} onClear={() => { setThumbnail(null); resetScanOutputs(); }} />
            <FileSlot icon={FileText} title="Subtitles" hint="SRT or VTT" accept=".srt,.vtt,text/vtt" file={subtitles?.name ?? null} onPick={(file) => { void chooseTextFile(file, 'subtitles'); }} onClear={() => { setSubtitles(null); resetScanOutputs(); }} />
            <FileSlot icon={Mic} title="Transcript" hint="JSON or SRT" accept=".json,.srt,application/json" file={transcript?.name ?? null} onPick={(file) => { void chooseTextFile(file, 'transcript'); }} onClear={() => { setTranscript(null); resetScanOutputs(); }} />
            <label className="studio-checkbox">
              <input type="checkbox" checked={includeTranscript} onChange={(event) => { setIncludeTranscript(event.target.checked); resetScanOutputs(); }} />
              Include transcript in this scan
            </label>
          </div>
        </div>

        <div className="studio-actions">
          <button className="button outline" onClick={loadSample} disabled={status === 'scanning'}><Sparkles size={14} /> Load sample bundle</button>
          {status === 'scanning' ? (
            <button className="button outline" onClick={cancelScan}><X size={14} /> Cancel scan</button>
          ) : (
            <button className="button primary large" onClick={() => { void startScan(); }} disabled={!hasInput}><ScanSearch size={16} /> Scan files</button>
          )}
        </div>

        <div className="studio-progress" role="status" aria-live="polite">
          <div className="studio-progress-head"><span>{progress.phase}</span><b>{progress.percent}%</b></div>
          <div className="bar-track"><div className="studio-progress-fill" style={{ width: `${progress.percent}%` }} /></div>
        </div>

        {error && <div className="studio-alert"><CircleAlert size={16} /><span>{error}</span></div>}
        {status === 'done' && !error && <div className="success-callout compact"><Check size={18} /><span>Scan finished. Review the results below.</span></div>}
      </section>

      <section id="settings" className="panel studio-settings">
        <div className="panel-header">
          <div><span className="section-kicker">SCAN CONFIGURATION</span><h2>Modules</h2></div>
          <ShieldCheck size={18} />
        </div>
        <div className="studio-module-toggles">
          {MODULE_IDS.map((id) => (
            <label key={id} className={`studio-toggle ${enabled[id] ? 'on' : ''}`}>
              <input type="checkbox" checked={enabled[id]} onChange={() => toggleModule(id)} />
              {MODULE_LABELS[id]}
            </label>
          ))}
        </div>
        <div className="studio-range-row">
          <label><span>Sample FPS: 2.0</span><input type="range" min={0.5} max={10} step={0.5} defaultValue={2} disabled /><small>Needs the frame OCR engine, which is not in this build.</small></label>
          <label><span>Minimum OCR confidence: 20%</span><input type="range" min={10} max={85} step={5} defaultValue={20} disabled /><small>Needs the frame OCR engine, which is not in this build.</small></label>
        </div>
      </section>

      {report && (
        <>
          <VideoSummary report={report} />
          <section id="matrix" className="panel studio-section"><ModuleMatrix modules={report.modules} /></section>
          <section id="timeline" className="panel studio-section"><RiskTimeline report={report} /></section>
          <section id="findings" className="panel studio-section">
            <FindingsTable findings={report.findings} actions={actions} onChange={setActions} />
          </section>
          <section id="repair" className="panel studio-section">
            <RepairPanel
              report={report}
              settings={settings}
              onSettings={setSettings}
              repair={repair}
              downloads={downloads}
              verification={verification}
              onRepair={() => { void runRepair(); }}
              onRescan={() => { if (repair) void verify(repair); }}
            />
          </section>
        </>
      )}

      <section id="tests" className="panel studio-section"><TestSuite /></section>
      <section id="limits" className="panel studio-section"><Limitations /></section>
    </main>
  );
}
