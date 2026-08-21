import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { enqueueSnackbar } from 'twenty-sdk/front-component';
import { IDS } from 'src/constants/ids';

type Dimension = {
  score: number | null;
  weight: number;
  ratio: number | null;
  applicable: boolean;
};

type Requirement = {
  requirement: string;
  status: string;
  kind?: string;
  category?: string;
};

type Job = {
  jobId: string;
  title: string;
  company: string;
  crmStatus: string;
  approval?: string;
  fitScore?: number | null;
  fitRoute?: string | null;
  fitDimensions?: Record<string, Dimension> | null;
  mustHaveCoverage?: number | null;
  hardFailures?: string[];
  matchedRequirements?: Requirement[];
  roleFamily?: string | null;
  locations?: string[];
  workMode?: string;
  employmentType?: string;
  applicationUrl?: string;
  canonicalUrl?: string;
  source?: string;
  postedAt?: string | null;
  discoveredAt?: string | null;
  resumeHash?: string | null;
  description?: string;
};

type Run = {
  id: string;
  type: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  processed?: number;
  discovered?: number;
  filtered?: number;
  errors?: unknown[];
};

type Snapshot = {
  summary: Record<string, number>;
  jobs: Job[];
  runs: Run[];
  updatedAt?: string;
};

type ConfirmState = {
  title: string;
  body: string;
  action: () => Promise<void>;
  danger?: boolean;
} | null;

const api = new RestApiClient();
const PAGE_SIZE = 25;

const STATUS_LABELS: Record<string, string> = {
  DISCOVERED: 'New',
  AWAITING_APPROVAL: 'Awaiting review',
  APPROVED: 'Approved',
  QUEUED: 'Queued',
  APPLICATION_IN_PROGRESS: 'Applying',
  APPLYING: 'Applying',
  SUBMITTED: 'Submitted',
  ATTENTION_REQUIRED: 'Needs attention',
  FAILED: 'Failed',
  FILTERED_OUT: 'Filtered out',
  CLOSED: 'Closed',
  SUBMISSION_UNCONFIRMED: 'Submission unconfirmed',
};

const DIMENSION_LABELS: Record<string, string> = {
  roleAlignment: 'Role alignment',
  mustHaveTechnology: 'Must-have tech',
  experienceAlignment: 'Experience',
  responsibilityAlignment: 'Responsibilities',
  workModeLocation: 'Work mode',
  niceToHaveTechnology: 'Nice-to-have tech',
  domainAlignment: 'Domain',
  otherRequirements: 'Other requirements',
};

const statusLabel = (status: string) =>
  STATUS_LABELS[status] ??
  status.replaceAll('_', ' ').toLowerCase().replace(/^./, (value) => value.toUpperCase());

const dimensionLabel = (key: string) => DIMENSION_LABELS[key] ?? key;

const statusGroup = (key: string, status: string) =>
  key === 'all' ||
  (key === 'discovered' && status === 'DISCOVERED') ||
  (key === 'awaiting' && status === 'AWAITING_APPROVAL') ||
  (key === 'approved' && status === 'APPROVED') ||
  (key === 'applying' && ['QUEUED', 'APPLICATION_IN_PROGRESS', 'APPLYING'].includes(status)) ||
  (key === 'submitted' && status === 'SUBMITTED') ||
  (key === 'attention' && ['ATTENTION_REQUIRED', 'FAILED', 'SUBMISSION_UNCONFIRMED'].includes(status));

const fmtDate = (value?: string | null) => (value ? new Date(value).toLocaleString() : '—');

const styles: Record<string, CSSProperties> = {
  shell: {
    padding: 24,
    minHeight: '100%',
    background: 'var(--t-color-gray-0)',
    color: 'var(--t-color-gray-90)',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 18,
    flexWrap: 'wrap',
  },
  title: { fontSize: 28, fontWeight: 700, margin: '5px 0 6px' },
  sub: { fontSize: 14, color: 'var(--t-color-gray-60)', maxWidth: 800, lineHeight: 1.5 },
  gate: {
    padding: '12px 14px',
    border: '1px solid var(--t-color-blue-20)',
    borderRadius: 10,
    background: 'var(--t-color-blue-10)',
    fontSize: 13,
    color: 'var(--t-color-blue-80)',
    marginBottom: 18,
    lineHeight: 1.45,
  },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit,minmax(125px,1fr))',
    gap: 10,
    marginBottom: 18,
  },
  metric: {
    border: '1px solid var(--t-color-gray-20)',
    borderRadius: 10,
    padding: 14,
    background: 'var(--t-color-gray-0)',
    cursor: 'pointer',
    textAlign: 'left',
  },
  metricActive: { border: '1px solid var(--t-color-blue-50)', background: 'var(--t-color-blue-10)' },
  num: { fontSize: 24, fontWeight: 700 },
  label: { fontSize: 12, color: 'var(--t-color-gray-55)', marginTop: 5 },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    padding: 10,
    border: '1px solid var(--t-color-gray-20)',
    borderRadius: 10,
    background: 'var(--t-color-gray-5)',
    alignItems: 'center',
    marginBottom: 10,
  },
  button: {
    border: '1px solid var(--t-color-gray-25)',
    background: 'var(--t-color-gray-0)',
    padding: '8px 11px',
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  primary: {
    border: 0,
    background: 'var(--t-color-blue-60)',
    color: 'white',
    padding: '8px 12px',
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 650,
    cursor: 'pointer',
  },
  danger: {
    border: '1px solid var(--t-color-red-20)',
    background: 'var(--t-color-red-10)',
    color: 'var(--t-color-red-70)',
    padding: '8px 11px',
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  input: {
    border: '1px solid var(--t-color-gray-25)',
    background: 'var(--t-color-gray-0)',
    color: 'inherit',
    padding: '8px 10px',
    borderRadius: 7,
    fontSize: 12,
    minWidth: 170,
  },
  number: { width: 72, minWidth: 72 },
  tableWrap: { border: '1px solid var(--t-color-gray-20)', borderRadius: 10, overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 820 },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    color: 'var(--t-color-gray-50)',
    fontWeight: 600,
    background: 'var(--t-color-gray-5)',
    borderBottom: '1px solid var(--t-color-gray-20)',
  },
  td: { padding: '11px 12px', borderBottom: '1px solid var(--t-color-gray-15)', verticalAlign: 'top' },
  company: { fontWeight: 650 },
  muted: { color: 'var(--t-color-gray-55)', marginTop: 3, lineHeight: 1.4 },
  link: { color: 'var(--t-color-blue-70)', fontWeight: 600, textDecoration: 'none' },
  detail: { padding: '12px 16px', background: 'var(--t-color-gray-5)', borderBottom: '1px solid var(--t-color-gray-20)' },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 },
  card: { border: '1px solid var(--t-color-gray-20)', borderRadius: 8, padding: 10, background: 'var(--t-color-gray-0)' },
  error: {
    padding: '12px 14px',
    border: '1px solid var(--t-color-red-20)',
    background: 'var(--t-color-red-10)',
    color: 'var(--t-color-red-70)',
    borderRadius: 8,
    marginBottom: 10,
  },
  loading: { padding: 32, textAlign: 'center', color: 'var(--t-color-gray-55)' },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 11,
    color: 'var(--t-color-gray-50)',
    padding: '9px 2px',
    gap: 10,
    flexWrap: 'wrap',
  },
  runs: { marginTop: 18, borderTop: '1px solid var(--t-color-gray-20)', paddingTop: 14 },
  run: {
    display: 'grid',
    gridTemplateColumns: '100px 1fr auto',
    gap: 10,
    padding: '7px 0',
    fontSize: 12,
    borderBottom: '1px solid var(--t-color-gray-10)',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--t-color-gray-80)',
    display: 'grid',
    placeItems: 'center',
    padding: 20,
    zIndex: 9999,
  },
  modal: {
    width: 'min(520px,100%)',
    background: 'var(--t-color-gray-0)',
    color: 'var(--t-color-gray-90)',
    border: '1px solid var(--t-color-gray-20)',
    borderRadius: 12,
    padding: 18,
    boxShadow: '0 18px 60px rgba(0,0,0,.25)',
  },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
};

const pill = (status: string): CSSProperties => {
  const success = status === 'SUBMITTED' || status === 'APPROVED';
  const review = status === 'AWAITING_APPROVAL';
  const error = status.includes('ATTENTION') || status === 'FAILED' || status === 'SUBMISSION_UNCONFIRMED';
  return {
    display: 'inline-flex',
    padding: '4px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 650,
    background: success
      ? 'var(--t-color-green-10)'
      : review
        ? 'var(--t-color-yellow-10)'
        : error
          ? 'var(--t-color-red-10)'
          : 'var(--t-color-gray-10)',
    color: success
      ? 'var(--t-color-green-70)'
      : review
        ? 'var(--t-color-yellow-80)'
        : error
          ? 'var(--t-color-red-70)'
          : 'var(--t-color-gray-70)',
  };
};

const Dashboard = () => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('fit');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [prepareLimit, setPrepareLimit] = useState(100);
  const [applyLimit, setApplyLimit] = useState(20);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setSnapshot(await api.get<Snapshot>('/s/job-search/snapshot'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!confirm) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirm(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [confirm]);

  const action = async (name: string, route: string, body: unknown = {}) => {
    setBusy(name);
    setError('');
    try {
      const result = await api.post<{ snapshot?: Snapshot }>(route, body);
      setSnapshot(result.snapshot ?? (await api.get<Snapshot>('/s/job-search/snapshot')));
      setSelected(new Set());
      await enqueueSnackbar({
        message: name === 'run' ? 'Discovery, scoring and verified résumé preparation completed.' : 'Job search updated.',
        variant: 'success',
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      await enqueueSnackbar({ message, variant: 'error' });
    } finally {
      setBusy('');
    }
  };

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const rows = (snapshot?.jobs ?? [])
      .filter((job) => !['FILTERED_OUT', 'CLOSED'].includes(job.crmStatus))
      .filter((job) => statusGroup(filter, job.crmStatus))
      .filter((job) => {
        if (!normalizedQuery) return true;
        const corpus = `${job.company} ${job.title} ${(job.locations || []).join(' ')} ${job.roleFamily || ''}`.toLowerCase();
        return corpus.includes(normalizedQuery);
      });

    return [...rows].sort((a, b) =>
      sort === 'recent'
        ? String(b.postedAt || b.discoveredAt || '').localeCompare(String(a.postedAt || a.discoveredAt || ''))
        : (b.fitScore ?? -1) - (a.fitScore ?? -1),
    );
  }, [snapshot, filter, query, sort]);

  useEffect(() => setPage(1), [filter, query, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageJobs = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ids = [...selected];
  const allPageSelected = pageJobs.length > 0 && pageJobs.every((job) => selected.has(job.jobId));

  const metric = (key: string, label: string, value?: number) => (
    <button
      type="button"
      style={{ ...styles.metric, ...(filter === key ? styles.metricActive : {}) }}
      onClick={() => setFilter(filter === key ? 'all' : key)}
      aria-pressed={filter === key}
    >
      <div style={styles.num}>{loading ? '—' : value ?? 0}</div>
      <div style={styles.label}>{label}</div>
    </button>
  );

  const togglePageSelection = (checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const job of pageJobs) checked ? next.add(job.jobId) : next.delete(job.jobId);
      return next;
    });
  };

  const toggleJobSelection = (jobId: string, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      checked ? next.add(jobId) : next.delete(jobId);
      return next;
    });
  };

  return (
    <div style={styles.shell}>
      <div style={styles.header}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-color-gray-50)', letterSpacing: '.04em' }}>
            JOB APPLY • CONTROL CENTER
          </div>
          <h1 style={styles.title}>Your job search, in one queue.</h1>
          <div style={styles.sub}>
            Discover roles, filter by your actual targets, inspect why each job scored the way it did, review the exact hash-locked résumé, and only then approve submission.
          </div>
        </div>
        <div style={{ ...pill('APPROVED'), padding: '7px 10px' }}>● Approval gate active</div>
      </div>

      <div style={styles.gate}>
        <strong>Find &amp; prepare</strong> discovers new jobs, filters them, scores fit, and builds a verified résumé for each match. <strong>It never submits an application.</strong> Submission only begins after approval and a separate confirmed Apply action.
      </div>

      {error && (
        <div role="alert" style={styles.error}>
          <strong>Could not update the dashboard.</strong> {error}{' '}
          <button type="button" style={{ ...styles.button, marginLeft: 8 }} onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      <div style={styles.metrics}>
        {metric('discovered', 'New', snapshot?.summary?.discovered)}
        {metric('awaiting', 'Awaiting review', snapshot?.summary?.awaitingApproval)}
        {metric('approved', 'Approved', snapshot?.summary?.approved)}
        {metric('applying', 'Applying', snapshot?.summary?.applying)}
        {metric('submitted', 'Submitted', snapshot?.summary?.submitted)}
        {metric('attention', 'Needs attention', (snapshot?.summary?.attention ?? 0) + (snapshot?.summary?.failed ?? 0))}
      </div>

      <div style={styles.toolbar}>
        <button
          style={styles.primary}
          disabled={Boolean(busy)}
          onClick={() => void action('run', '/s/job-search/run-all', { prepareLimit })}
        >
          {busy === 'run' ? 'Running discovery → scoring → résumés…' : 'Find & prepare'}
        </button>
        <label style={styles.muted}>
          Prepare limit{' '}
          <input
            aria-label="Prepare limit"
            style={{ ...styles.input, ...styles.number }}
            type="number"
            min={1}
            max={500}
            value={prepareLimit}
            onChange={(event) => setPrepareLimit(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
        <button
          style={styles.button}
          disabled={!ids.length || Boolean(busy)}
          onClick={() => void action('approve', '/s/job-search/approve', { jobIds: ids })}
        >
          Approve selected ({ids.length})
        </button>
        <button
          style={styles.danger}
          disabled={!ids.length || Boolean(busy)}
          onClick={() =>
            setConfirm({
              title: `Reject ${ids.length} selected job${ids.length === 1 ? '' : 's'}?`,
              body: 'Rejected jobs are closed and removed from this review queue. This does not submit anything.',
              danger: true,
              action: () => action('reject', '/s/job-search/reject', { jobIds: ids }),
            })
          }
        >
          Reject selected
        </button>
        <span style={{ flex: 1 }} />
        <input
          style={styles.input}
          aria-label="Search jobs"
          placeholder="Search company or role…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select style={styles.input} aria-label="Sort jobs" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="fit">Highest fit first</option>
          <option value="recent">Newest first</option>
        </select>
        <button style={styles.button} disabled={loading || Boolean(busy)} onClick={() => void refresh()}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <label style={styles.muted}>
          Apply limit{' '}
          <input
            aria-label="Apply limit"
            style={{ ...styles.input, ...styles.number }}
            type="number"
            min={1}
            max={100}
            value={applyLimit}
            onChange={(event) => setApplyLimit(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
        <button
          style={styles.primary}
          disabled={Boolean(busy) || (snapshot?.summary?.approved ?? 0) === 0}
          onClick={() =>
            setConfirm({
              title: 'Submit approved applications?',
              body: `This starts the real browser submission queue for up to ${applyLimit} approved jobs. Reviewed résumé hashes are checked again before submission.`,
              action: () => action('apply', '/s/job-search/apply-approved', { limit: applyLimit }),
            })
          }
        >
          {busy === 'apply' ? 'Applying…' : `Apply approved (${snapshot?.summary?.approved ?? 0})`}
        </button>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Job review queue</caption>
          <thead>
            <tr>
              <th style={styles.th} scope="col">
                <input
                  aria-label="Select all jobs on this page"
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={(event) => togglePageSelection(event.target.checked)}
                />
              </th>
              <th style={styles.th} scope="col">Company / role</th>
              <th style={styles.th} scope="col">Fit</th>
              <th style={styles.th} scope="col">Status</th>
              <th style={styles.th} scope="col">Résumé</th>
              <th style={styles.th} scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {pageJobs.map((job) => (
              <Fragment key={job.jobId}>
                <tr>
                  <td style={styles.td}>
                    <input
                      aria-label={`Select ${job.title} at ${job.company}`}
                      type="checkbox"
                      checked={selected.has(job.jobId)}
                      onChange={(event) => toggleJobSelection(job.jobId, event.target.checked)}
                    />
                  </td>
                  <td style={styles.td}>
                    <div style={styles.company}>{job.company}</div>
                    <div style={styles.muted}>
                      {job.applicationUrl || job.canonicalUrl ? (
                        <a style={styles.link} href={job.applicationUrl || job.canonicalUrl} target="_blank" rel="noreferrer">
                          {job.title} ↗
                        </a>
                      ) : job.title}
                      {job.locations?.length ? ` · ${job.locations.join(', ')}` : ''}
                      {job.workMode ? ` · ${job.workMode}` : ''}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <strong>{job.fitScore ?? '—'}</strong>
                    {job.mustHaveCoverage != null && (
                      <div style={styles.muted}>{Math.round(job.mustHaveCoverage * 100)}% must-have</div>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span style={pill(job.crmStatus)}>{statusLabel(job.crmStatus)}</span>
                  </td>
                  <td style={styles.td}>
                    {job.resumeHash ? (
                      <>
                        <a
                          style={styles.link}
                          href={`/s/job-search/resume?jobId=${encodeURIComponent(job.jobId)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Preview exact PDF
                        </a>
                        <div style={styles.muted} title={job.resumeHash}>SHA-256 {job.resumeHash.slice(0, 12)}…</div>
                      </>
                    ) : (
                      <span style={styles.muted}>Not generated yet</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <button
                      type="button"
                      style={styles.button}
                      aria-expanded={expanded === job.jobId}
                      onClick={() => setExpanded(expanded === job.jobId ? null : job.jobId)}
                    >
                      {expanded === job.jobId ? 'Hide' : 'Explain'}
                    </button>
                  </td>
                </tr>

                {expanded === job.jobId && (
                  <tr>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <div style={styles.detail}>
                        <div style={styles.detailGrid}>
                          <div style={styles.card}>
                            <strong>Fit breakdown</strong>
                            {job.fitDimensions ? (
                              Object.entries(job.fitDimensions)
                                .filter(([, dimension]) => dimension?.applicable)
                                .map(([key, dimension]) => (
                                  <div key={key} style={{ ...styles.muted, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                    <span>{dimensionLabel(key)}</span>
                                    <span>{dimension.ratio == null ? '—' : `${Math.round(dimension.ratio * 100)}%`}</span>
                                  </div>
                                ))
                            ) : (
                              <div style={styles.muted}>No breakdown available for older runs.</div>
                            )}
                            {job.hardFailures?.length ? (
                              <div style={{ ...styles.muted, color: 'var(--t-color-red-70)', marginTop: 6 }}>
                                Hard failures: {job.hardFailures.join(', ')}
                              </div>
                            ) : null}
                          </div>

                          <div style={styles.card}>
                            <strong>Requirements</strong>
                            {job.matchedRequirements?.length ? (
                              job.matchedRequirements.slice(0, 8).map((requirement, index) => (
                                <div
                                  key={`${requirement.requirement}-${index}`}
                                  style={{
                                    ...styles.muted,
                                    color: requirement.status === 'met' ? 'var(--t-color-green-70)' : 'var(--t-color-red-70)',
                                  }}
                                >
                                  {requirement.status === 'met' ? '✓' : '○'} {requirement.requirement}
                                </div>
                              ))
                            ) : (
                              <div style={styles.muted}>No parsed requirements available for older runs.</div>
                            )}
                          </div>

                          <div style={styles.card}>
                            <strong>Source & timing</strong>
                            <div style={styles.muted}>Source: {job.source || '—'}</div>
                            <div style={styles.muted}>Posted: {fmtDate(job.postedAt)}</div>
                            <div style={styles.muted}>Discovered: {fmtDate(job.discoveredAt)}</div>
                            <div style={styles.muted}>Role family: {job.roleFamily || '—'}</div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>

        {loading && <div style={styles.loading}>Loading your job queue…</div>}
        {!loading && !error && !pageJobs.length && (
          <div style={styles.loading}>
            {snapshot?.jobs?.length
              ? 'No jobs match the current filters.'
              : 'No jobs yet. Configure your profile and sources, then run Find & prepare.'}
          </div>
        )}
      </div>

      <div style={styles.footer}>
        <span>
          Showing {visible.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, visible.length)} of {visible.length} matching jobs · last updated {fmtDate(snapshot?.updatedAt)}
        </span>
        <span>
          <button style={styles.button} disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>{' '}
          <span style={{ padding: '0 8px' }}>Page {page} / {pageCount}</span>{' '}
          <button style={styles.button} disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button>
        </span>
      </div>

      <div style={styles.runs}>
        <strong>Recent runs</strong>
        {snapshot?.runs?.length ? (
          snapshot.runs.slice(0, 5).map((run) => (
            <div key={run.id} style={styles.run}>
              <span>{run.type}</span>
              <span>
                {run.status}
                {run.processed != null ? ` · ${run.processed} processed` : ''}
                {run.discovered != null ? ` · ${run.discovered} discovered` : ''}
                {run.filtered != null ? ` · ${run.filtered} filtered` : ''}
              </span>
              <span>{fmtDate(run.finishedAt || run.startedAt)}</span>
            </div>
          ))
        ) : (
          <div style={styles.muted}>No runs recorded yet.</div>
        )}
      </div>

      {confirm && (
        <div
          style={styles.overlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirm(null);
          }}
        >
          <div style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title" style={{ margin: '0 0 8px', fontSize: 18 }}>{confirm.title}</h2>
            <div style={styles.sub}>{confirm.body}</div>
            <div style={styles.modalActions}>
              <button style={styles.button} autoFocus onClick={() => setConfirm(null)}>Cancel</button>
              <button
                style={confirm.danger ? styles.danger : styles.primary}
                onClick={() => {
                  const run = confirm.action;
                  setConfirm(null);
                  void run();
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: IDS.dashboard_fc,
  name: 'job-search-dashboard',
  description: 'Job discovery, resume review, approval and application control center.',
  component: Dashboard,
});
