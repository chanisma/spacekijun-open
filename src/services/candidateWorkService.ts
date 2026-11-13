/**
 * 업무 후보 → Work·Task 저장 (2026-10-05). 초안·검증은 `src/lib/candidateToWork.ts`, 여기는 쓰기만.
 *
 * 연간 가져오기(`workRolloverService.executeWorkRollover`)와 같은 모양이다 — RPC·트랜잭션 없이
 * 업무 하나를 넣고 할 일을 한 번에 넣은 뒤, 할 일이 실패하면 업무를 지워 되돌린다.
 * 담당자가 든 할 일은 `guard_task_structure` 가 «그 업무의 매니저·만든 사람·관리자»에게만 연다 —
 * 업무를 만든 사람이 곧 `created_by` 라 통과한다(매니저 목록에 자기가 없어도).
 */
import { supabase } from '@/integrations/supabase/client';
import { unifiedAuth } from '@/services/unifiedAuth';
import type { CandidateWorkInsert } from '@/lib/candidateToWork';

export interface CandidateWorkResult {
  workId: string;
  taskCount: number;
}

export async function createWorkFromCandidate(insert: CandidateWorkInsert): Promise<CandidateWorkResult> {
  if (!insert.work.name) throw new Error('업무 이름을 입력해 주세요.');
  if (insert.managers.length === 0) throw new Error('책임자를 한 명 이상 지정해 주세요.');

  const myResourceId = await unifiedAuth.getCurrentResourceId();

  // 매니저 — 이름과 재직 여부를 저장 직전에 다시 확인한다(화면의 목록은 열어 둔 사이 바뀔 수 있다)
  const { data: managerRows, error: managerError } = await supabase
    .from('resource')
    .select('id, name')
    .in('id', insert.managers.map((m) => m.id))
    .eq('status', 'active');
  if (managerError) throw new Error(`책임자를 확인하지 못했습니다: ${managerError.message}`);
  const managerName = new Map((managerRows ?? []).map((r) => [r.id as string, r.name as string]));
  const managers = insert.managers.filter((m) => managerName.has(m.id)).map((m) => ({ id: m.id, name: managerName.get(m.id) ?? m.name }));
  if (managers.length === 0) throw new Error('재직 중인 책임자를 한 명 이상 지정해 주세요.');

  const { data: work, error: workError } = await supabase
    .from('work')
    .insert({
      name: insert.work.name,
      description: insert.work.description,
      manager_id: managers[0].id,
      status: 'active',
      keywords: insert.work.keywords,
      meta: { ...insert.work.meta, managers } as never,
    })
    .select('id')
    .single();
  if (workError || !work) throw new Error(`업무를 만들지 못했습니다: ${workError?.message ?? '알 수 없는 오류'}`);
  const workId = work.id as string;

  if (insert.tasks.length > 0) {
    const { error: taskError } = await supabase.from('task').insert(
      insert.tasks.map((t) => ({
        event_id: workId,
        title: t.title,
        description: t.description,
        type: t.type,
        order_index: t.order_index,
        due_date: t.due_date,
        keywords: t.keywords,
        meta: t.meta as never,
        status: 'pending',
        created_by: myResourceId,
      })),
    );
    if (taskError) {
      const { error } = await supabase.from('work').delete().eq('id', workId);
      throw new Error(
        error
          ? `할 일을 만들지 못했습니다(${taskError.message}) — 만들던 업무를 지우지도 못했습니다(${error.message}). 목록에서 직접 지워 주세요.`
          : `할 일을 만들지 못했습니다(${taskError.message}) — 만들던 업무는 되돌렸습니다.`,
      );
    }
  }
  return { workId, taskCount: insert.tasks.length };
}
