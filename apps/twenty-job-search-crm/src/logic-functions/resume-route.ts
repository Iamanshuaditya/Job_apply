import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';
import { IDS } from 'src/constants/ids';
import { orchestratorJson } from './utils/orchestrator';

type ResumeTicket = { url: string; expiresAt: string };

const handler = async (event: RoutePayload) => {
  const jobId = event.queryStringParameters?.jobId;
  if (!jobId) return new Response(JSON.stringify({ error: 'Missing jobId' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  try {
    const ticket = await orchestratorJson<ResumeTicket>('/api/resume-ticket', {
      method: 'POST',
      body: { jobId },
    });
    return new Response(JSON.stringify(ticket), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.resume_route,
  name: 'job-search-resume',
  description: 'Mints a short-lived browser-safe URL for the exact reviewed resume PDF.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/job-search/resume', httpMethod: 'GET', isAuthRequired: true },
});
