/**
 * KSML Uploader — Admin page.
 *
 * Upload an Excel of (class, characteristic) pairs, PREVIEW what will be pushed
 * (auto-detected columns, counts, sample) WITHOUT touching SAP, then COMMIT to
 * assign each characteristic to its class in SAP via Z_CLS_ADD_CHAR_BAPI.
 *
 * Web port of drivers/v2_grouped_runner.py — same race-safe grouped push, but
 * the backend does the work.
 */

import React, { useState, useCallback } from 'react';
import { Upload as UploadIcon, FileSpreadsheet, ShieldAlert, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '../../../shared/components/ui-tw';
import { message } from '../../../lib/message';
import { APP_CONFIG } from '../../../constants/app/config';

interface PreviewData {
  pairs: { mc: string; attr: string }[];
  classes: number;
  detectedColumns: { classColumn: string | null; attrColumn: string | null };
  totalRows: number;
  skipped: number;
  warnings: string[];
  sample: { mc: string; attr: string }[];
}

interface CommitReport {
  env: string;
  test: boolean;
  classes: number;
  pairs: number;
  added: number;
  already: number;
  failed: number;
  durationMs: number;
  results: { mc: string; attr: string; status: string; subrc: string; msg: string; attempt: number }[];
}

export default function KsmlUploaderPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [report, setReport] = useState<CommitReport | null>(null);
  const [env, setEnv] = useState<'qa' | 'prod'>('qa');
  const [testMode, setTestMode] = useState(true); // default to SAP test-mode for safety
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);

  const token = () => localStorage.getItem('authToken');

  const reset = () => { setPreview(null); setReport(null); };

  const onPickFile = (f: File | null) => {
    setFile(f);
    reset();
  };

  const doPreview = useCallback(async () => {
    if (!file) { message.warning('Choose an Excel file first'); return; }
    setLoading(true);
    setReport(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${APP_CONFIG.api.baseURL}/ksml/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Preview failed');
      setPreview(json as PreviewData);
      message.success(`Parsed ${json.pairs.length} pairs across ${json.classes} classes`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  }, [file]);

  const doCommit = useCallback(async () => {
    if (!file || !preview) return;
    const verb = testMode ? 'validate (SAP test mode)' : 'WRITE to SAP';
    const ok = window.confirm(
      `You are about to ${verb} on ${env.toUpperCase()}:\n\n` +
      `• ${preview.pairs.length} pairs\n• ${preview.classes} classes\n\n` +
      (testMode ? 'Test mode makes NO permanent changes.' : '⚠️ This performs LIVE writes to SAP.') +
      `\n\nContinue?`,
    );
    if (!ok) return;

    setCommitting(true);
    setReport(null);
    const loadingId = message.loading(`${testMode ? 'Validating' : 'Pushing'} to SAP (${env})… this can take several minutes`);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('env', env);
      fd.append('test', String(testMode));
      const res = await fetch(`${APP_CONFIG.api.baseURL}/ksml/commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });
      const json = await res.json();
      message.dismiss(loadingId);
      if (!res.ok || !json.success) throw new Error(json.error || 'Commit failed');
      setReport(json as CommitReport);
      if (json.failed > 0) message.warning(`Done with ${json.failed} failure(s)`);
      else message.success(`Done — added ${json.added}, already ${json.already}`);
    } catch (e) {
      message.dismiss(loadingId);
      message.error(e instanceof Error ? e.message : 'Commit failed');
    } finally {
      setCommitting(false);
    }
  }, [file, preview, env, testMode]);

  const failedRows = report?.results.filter((r) => r.status === 'failed') ?? [];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <UploadIcon className="h-6 w-6 text-[#FF6F61]" /> KSML Uploader
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload an Excel of <b>(class, characteristic)</b> pairs to assign characteristics to classes in SAP
          (audit-clean via <code>Z_CLS_ADD_CHAR_BAPI</code>, KLART=026). Columns are auto-detected.
        </p>
      </div>

      {/* Step 1 — File */}
      <div className="rounded-lg border bg-card p-4">
        <label className="flex cursor-pointer items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-md border border-dashed px-4 py-2 text-sm hover:bg-muted">
            <FileSpreadsheet className="h-4 w-4" /> Choose Excel (.xlsx / .xls)
          </span>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          {file && <span className="text-sm text-muted-foreground">{file.name}</span>}
        </label>

        <div className="mt-3">
          <Button onClick={doPreview} disabled={!file || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Preview
          </Button>
        </div>
      </div>

      {/* Step 2 — Preview */}
      {preview && (
        <div className="mt-4 rounded-lg border bg-card p-4">
          <h2 className="mb-2 font-semibold">Preview (no SAP calls made)</h2>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Classes" value={preview.classes} />
            <Stat label="Pairs" value={preview.pairs.length} />
            <Stat label="Rows read" value={preview.totalRows} />
            <Stat label="Skipped" value={preview.skipped} />
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Detected columns → class: <b>{preview.detectedColumns.classColumn}</b>, characteristic:{' '}
            <b>{preview.detectedColumns.attrColumn}</b>
          </div>
          {preview.warnings.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-amber-600">
              {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}

          {preview.sample.length > 0 && (
            <div className="mt-3 max-h-48 overflow-auto rounded border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr><th className="px-2 py-1">Class</th><th className="px-2 py-1">Characteristic</th></tr>
                </thead>
                <tbody>
                  {preview.sample.map((p, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1 font-mono">{p.mc}</td>
                      <td className="px-2 py-1 font-mono">{p.attr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.pairs.length > preview.sample.length && (
                <div className="px-2 py-1 text-[11px] text-muted-foreground">
                  … and {preview.pairs.length - preview.sample.length} more
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Commit controls */}
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">Environment:</span>
                <select
                  value={env}
                  onChange={(e) => setEnv(e.target.value as 'qa' | 'prod')}
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="qa">QA</option>
                  <option value="prod">PROD</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
                SAP test mode (no permanent write)
              </label>
            </div>
            {env === 'prod' && !testMode && (
              <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-600">
                <ShieldAlert className="h-3.5 w-3.5" /> LIVE PROD write — this commits changes to SAP.
              </p>
            )}
            <Button
              onClick={doCommit}
              disabled={committing || preview.pairs.length === 0}
              className="mt-3 bg-[#FF6F61] hover:bg-[#ff5b4d]"
            >
              {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadIcon className="h-4 w-4" />}
              {testMode ? 'Validate on ' : 'Push to '} {env.toUpperCase()}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4 — Report */}
      {report && (
        <div className="mt-4 rounded-lg border bg-card p-4">
          <h2 className="mb-2 font-semibold">
            Result — {report.env.toUpperCase()} {report.test && <span className="text-amber-600">(test mode)</span>}
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Added" value={report.added} tone="green" />
            <Stat label="Already present" value={report.already} />
            <Stat label="Failed" value={report.failed} tone={report.failed ? 'red' : undefined} />
            <Stat label="Duration" value={`${Math.round(report.durationMs / 1000)}s`} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {report.pairs} pairs across {report.classes} classes.
            {!report.test && ' Verify KSML + CDHDR counts in SAP.'}
          </p>

          {failedRows.length > 0 && (
            <div className="mt-3 max-h-64 overflow-auto rounded border border-red-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-red-50">
                  <tr>
                    <th className="px-2 py-1">Class</th><th className="px-2 py-1">Char</th>
                    <th className="px-2 py-1">SUBRC</th><th className="px-2 py-1">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {failedRows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1 font-mono">{r.mc}</td>
                      <td className="px-2 py-1 font-mono">{r.attr}</td>
                      <td className="px-2 py-1">{r.subrc}</td>
                      <td className="px-2 py-1">{r.msg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2 flex items-center gap-1 text-sm">
            {report.failed === 0
              ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> All pairs processed successfully.</>
              : <><XCircle className="h-4 w-4 text-red-600" /> {report.failed} pair(s) failed — see above.</>}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'green' | 'red' }) {
  const color = tone === 'green' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : 'text-foreground';
  return (
    <div className="rounded border bg-background p-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}
