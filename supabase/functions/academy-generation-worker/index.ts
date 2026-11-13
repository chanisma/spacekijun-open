declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateStage } from '../_shared/inquiryStages.ts';
import { aiLogContext, aiLogFetch, logAiRequestFailure } from '../_shared/aiCallLog.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
Deno.serve(async req => {
  const supplied = req.headers.get('x-academy-worker');
  if (!supplied) return new Response('Unauthorized', { status: 401 });
  const { data: secret, error } = await db.rpc('academy_generation_worker_secret');
  if (error || supplied !== secret) return new Response('Unauthorized', { status: 401 });
  // One invocation handles one bounded stage. Cron/DB checkpoints launch the next.
  EdgeRuntime.waitUntil(work());
  return Response.json({ accepted: true }, { status: 202 });
});

async function work() {
  const claimed = await db.rpc('academy_generation_claim');
  if (claimed.error) { console.error('generation_claim_failed'); return; }
  const job = claimed.data?.[0];
  if (!job) return;
  // 설계 의뢰 작업 큐 — 기능은 작업이 온 화면(surface: academy · inquiry-design)
  const startedAt = Date.now();
  const logCtx = aiLogContext('academy-generation-worker', job.surface === 'inquiry-design' ? 'inquiry-design' : 'academy', null, {
    action: `generation.${job.stage}`, userId: job.owner_id ?? null, studentId: job.student_id ?? null,
  });
  try {
    let result, usage;
    if (job.stage !== 'save') {
      const input = { ...job.input, stageCorrection: job.error?.startsWith('INVALID_OUTPUT:') ? job.error : undefined };
      // Resolve graph candidates from the authorized, immutable version; never trust IDs from the browser.
      const version = input.kgVersionId;
      input.existingEntities = [];
      if (version) {
        const rows = await db.from('student_kg_entities').select('entity_id,label,type,properties').eq('student_id', job.student_id).eq('kg_version_id', version);
        if (rows.error) throw Error('CONTEXT_READ_FAILED');
        const selected = new Set((input.selectedSources ?? []).map((s: Record<string, any>) => s.source_entity_id ?? s.snapshot?.entity_id));
        input.existingEntities = (rows.data ?? []).sort((a,b) => Number(selected.has(b.entity_id))-Number(selected.has(a.entity_id))).slice(0,120).map(e => ({ id:e.entity_id,label:e.label,type:e.type,sources:Array.isArray(e.properties?.sources) ? e.properties.sources.slice(0,6) : [],grade:e.properties?.grade,subject:e.properties?.subject,concepts:e.properties?.concepts?.slice(0,8),evidence:String(e.properties?.evidence ?? '').slice(0,1200) }));
      }
      const generated = await generateStage(job.stage, input, job.design, job.provider, { openai: Deno.env.get('OPENAI_API_KEY'), solar: Deno.env.get('SOLAR_API_KEY') ?? Deno.env.get('UPSTAGE_API_KEY') }, aiLogFetch(logCtx));
      result = generated.result; usage = generated.usage;
    }
    const saved = await db.rpc('academy_generation_checkpoint', { p_id:job.id,p_lease:job.lease,p_output:result ?? null,p_usage:usage ?? {} });
    if (saved.error) throw Error('CHECKPOINT_SAVE_FAILED');
    console.info('academy_generation_stage', JSON.stringify({ id:job.id,stage:job.stage,attempt:job.attempts,provider:job.provider,elapsed_ms:usage?.elapsed_ms,status:'saved' }));
  } catch (error) {
    const reason = error instanceof Error ? error.name === 'TimeoutError' ? 'PROVIDER_TIMEOUT' : error.message : 'GENERATION_FAILED';
    console.error('academy_generation_stage', JSON.stringify({ id:job.id,stage:job.stage,attempt:job.attempts,error:reason }));
    logAiRequestFailure(logCtx, reason, { startedAt, detail: { job: job.id, attempt: job.attempts } });
    await db.rpc('academy_generation_checkpoint', { p_id:job.id,p_lease:job.lease,p_error:reason });
  }
}
