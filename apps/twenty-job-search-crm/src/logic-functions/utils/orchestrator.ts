const baseUrl = () => {
  const value = process.env.JOB_APPLY_ORCHESTRATOR_URL?.trim();
  if (!value) throw new Error('JOB_APPLY_ORCHESTRATOR_URL is not configured.');
  return value.replace(/\/$/, '');
};

const headers = () => {
  const token = process.env.JOB_APPLY_ORCHESTRATOR_TOKEN?.trim();
  return {
    'content-type': 'application/json',
    ...(token ? { 'x-job-apply-token': token } : {}),
  };
};

export const orchestratorJson = async <T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> => {
  const method = options.method ?? 'GET';
  const init: RequestInit = { method, headers: headers() };
  if (options.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${baseUrl()}${path}`, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload?.error ?? `Orchestrator returned HTTP ${response.status}`);
  return payload as T;
};

export const orchestratorBytes = async (path: string) => {
  const token = process.env.JOB_APPLY_ORCHESTRATOR_TOKEN?.trim();
  const response = await fetch(`${baseUrl()}${path}`, {
    headers: token ? { 'x-job-apply-token': token } : {},
  });
  if (!response.ok) throw new Error(`Orchestrator returned HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};
