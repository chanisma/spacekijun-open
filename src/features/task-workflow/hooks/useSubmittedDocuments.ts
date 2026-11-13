// ========================================
// 낸 양식 문서 — 책임자가 열어 보고 엑셀로 값을 받는다 (2026-10-06 — 작업 UI 검토)
//
// 종전 제출 현황은 낸 문서의 «제목 글자»만 보였다 — 등록부가 약속한 «값으로 모여 표로 보고 언제든 문서로
// 다시 연다»를 화면이 지키지 못했다. 서버 변경은 없다: 책임자는 RLS(can_view_task_spec_document →
// action_submission ∧ can_manage_collect)로 이미 낸 문서 행을 읽을 수 있다.
//
// 열 이름은 양식 스펙에서 — `field_values` 의 키는 `purpose` 같은 식별자라 그대로는 못 읽는다. 문서가 가리키는
// **양식 버전**의 스펙을 쓰므로 양식이 나중에 바뀌어도 제출 시점 이름이 나온다(옛 값 제출 표와 같은 규칙).
// ========================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { specSubmissionData } from '@/lib/taskSubmissionCsv';

interface SubmittedDocumentRow {
  id: string;
  title: string | null;
  template_version_id: string;
  plan: Record<string, unknown>;
  field_values: Record<string, unknown>;
  row_values: Record<string, unknown> | null;
}

/** 낸 문서들의 값 → 문서 id 별 { 열 이름: 값 } + 열 순서 */
export function useSubmittedDocumentValues(documentIds: string[], enabled: boolean) {
  const ids = [...new Set(documentIds)].sort();
  return useQuery({
    queryKey: ['task-action', 'submitted-documents', ids.join('|')],
    enabled: enabled && ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_action_document')
        .select('id, title, template_version_id, plan, field_values, row_values')
        .in('id', ids);
      if (error) throw error;
      const rows = (data ?? []) as unknown as SubmittedDocumentRow[];
      // 같은 작업의 제출은 한 양식이다(낸 것이 있으면 양식을 못 바꾼다) — 첫 문서의 양식으로 열 이름을 얻는다
      let schema: { key: string; label: string }[] = [];
      const versionId = rows[0]?.template_version_id;
      if (versionId) {
        try {
          const [{ getSpecTemplateById }, { derivePlanSchema, normalizeSpecPlanKeys }] = await Promise.all([
            import('../services/specTemplateService'),
            import('../document/spec'),
          ]);
          const template = await getSpecTemplateById(versionId);
          schema = derivePlanSchema(normalizeSpecPlanKeys(template.spec)).map((f) => ({ key: f.key, label: f.label?.trim() || f.key }));
        } catch {
          schema = []; // 스펙을 못 읽어도 값은 보인다 — 키를 이름으로 쓴다
        }
      }
      const table = specSubmissionData(
        rows.map((row) => ({
          assignee_name: null,
          unit_key: null,
          submitted_at: '',
          plan: row.plan ?? {},
          field_values: row.field_values ?? {},
          row_values: row.row_values ?? {},
        })),
        schema,
      );
      const byId = new Map(rows.map((row, index) => [row.id, table.values[index]]));
      return { columns: table.columns, byId };
    },
  });
}

/**
 * 낸 문서를 한글 파일로 — 저장된 **값**으로 다시 만든다(LLM·DB 재조회 없음 — 제출 시점 그대로).
 * 받는 쪽 화면에서 그대로 쓰도록 파일을 내려받게 한다.
 */
export async function downloadSubmittedDocument(documentId: string, fallbackName: string): Promise<void> {
  const { getSpecDocumentById, rebuildSpecDocumentBlob } = await import('@/services/taskSpecSubmissionService');
  const doc = await getSpecDocumentById(documentId);
  if (!doc) throw new Error('문서를 찾지 못했습니다 — 지워졌거나 볼 수 없습니다.');
  const blob = await rebuildSpecDocumentBlob(doc);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(doc.title || fallbackName).replace(/[\\/:*?"<>|]/g, '_')}.hwpx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
