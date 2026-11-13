// 할 일 제출 설정 판정 **단일 출처** (2026-09-03).
//
// 제출 방식(파일 / 양식 문서)은 카드 칩·제출 다이얼로그·할 일 편집·상세 모달 **네 곳**이
// 각자 읽는다. 판정을 복붙하면 한 곳만 고쳐지는 사고가 난다 — 이 저장소에는 그 전례가
// 여럿 있다(`getMyTaskStatus` 를 단일 출처로 뺀 이유와 같다).
//
// React 비의존 순수 모듈이라 회귀 테스트에서 그대로 쓴다.
import type { Task, TaskFile } from '@/types/tasks';

/**
 * - `physical`(2026-10-01): 담당자가 **실물로** 낸다. 시스템에 파일이 없으므로 완료는 매니저의
 *   [받음] 체크로만 기록된다(`mark_task_physical_submission` — 받음 = kind 'physical' 행 + 완료).
 *   매니저가 붙인 제출 양식은 `forms` 로 담당자 제출 화면에 보인다.
 */
export type SubmissionMode = 'file' | 'spec' | 'spreadsheet' | 'physical';
export interface SubmissionColumn { key: string; label: string }
export type SubmissionVisibility = 'own' | 'all';

export interface SubmissionTemplateRef {
  id: string;
  name?: string | null;
  /**
   * 양식 계보 id. 새 버전이 등록되면 핀한 `id` 가 보관본이 되어 러너의 양식 잠금이
   * **조용히 풀린다**(보관본은 목록에 없어 못 찾는다). 제출 모드에서 잠금이 풀리면
   * 담당자가 아무 양식이나 고르게 되므로, 이 값으로 현재 버전을 되찾아 다시 잠근다.
   */
  familyId?: string | null;
}

export interface SubmissionConfig {
  required: boolean;
  guide: string;
  mode: SubmissionMode;
  actionId: string | null;
  template: SubmissionTemplateRef | null;
  columns: SubmissionColumn[];
  visibility: SubmissionVisibility;
  /** physical 모드의 제출 양식 파일 */
  forms: TaskFile[];
}

/**
 * 할 일의 제출 설정을 읽는다. **`mode` 가 없으면 `'file'`** — 2026-09-03 이전 데이터 호환.
 */
export function getSubmissionConfig(task: Pick<Task, 'meta'> | null | undefined): SubmissionConfig {
  const s = task?.meta?.submission;
  const template = s?.template && typeof s.template.id === 'string' && s.template.id
    ? { id: s.template.id, name: s.template.name ?? null, familyId: s.template.familyId ?? null }
    : null;
  return {
    required: s?.required === true,
    guide: typeof s?.guide === 'string' ? s.guide : '',
    mode: s?.mode === 'spec' || s?.mode === 'spreadsheet' || s?.mode === 'physical' ? s.mode : 'file',
    forms: Array.isArray(s?.forms) ? s.forms.filter(f => f && typeof f.url === 'string' && f.url) : [],
    columns: s?.columns ?? [],
    visibility: s?.visibility === 'all' ? 'all' : 'own',
    actionId: typeof s?.actionId === 'string' && s.actionId ? s.actionId : null,
    template,
  };
}

/** 이 할 일이 **값(양식 문서) 제출**을 받는가 — 제출이 켜져 있고 방식이 spec일 때만 */
export function isSpecSubmission(task: Pick<Task, 'meta'> | null | undefined): boolean {
  const c = getSubmissionConfig(task);
  return c.required && c.mode === 'spec';
}

/** 이 할 일이 **파일 제출**을 받는가 */
export function isFileSubmission(task: Pick<Task, 'meta'> | null | undefined): boolean {
  const c = getSubmissionConfig(task);
  return c.required && c.mode === 'file';
}

/** 이 할 일이 **실물로** 받는가 — 완료는 매니저의 [받음]으로만 기록된다 */
export function isPhysicalSubmission(task: Pick<Task, 'meta'> | null | undefined): boolean {
  const c = getSubmissionConfig(task);
  return c.required && c.mode === 'physical';
}

/** 제출이 켜져 있는가(방식 무관) — 완료 조건이 '체크'가 아니라 '제출'인지 */
export function isSubmissionRequired(task: Pick<Task, 'meta'> | null | undefined): boolean {
  return getSubmissionConfig(task).required;
}

/** 화면 라벨 — 칩·버튼·안내가 같은 낱말을 쓰게 한다 */
export function submissionModeLabel(mode: SubmissionMode): string {
  return mode === 'spreadsheet' ? '스프레드시트 작성'
    : mode === 'spec' ? '양식 문서 제출'
    : mode === 'physical' ? '실물 제출'
    : '파일 제출';
}

/**
 * 저장할 `meta.submission` 패치를 만든다.
 *
 * **끌 때도 키를 지우지 않고 `required:false` 로 남긴다** — update 경로가 meta 얕은 병합이라
 * 키를 빼도 사라지지 않는다(기존 파일 제출과 같은 규약). `actionId`·`template` 이 남아도
 * `required` 가 false 면 어떤 경로도 읽지 않는다.
 */
export function buildSubmissionMetaPatch(input: {
  required: boolean;
  guide?: string;
  mode?: SubmissionMode;
  actionId?: string | null;
  template?: SubmissionTemplateRef | null;
  columns?: SubmissionColumn[];
  visibility?: SubmissionVisibility;
  forms?: TaskFile[];
}): NonNullable<Task['meta']>['submission'] {
  const mode: SubmissionMode = input.mode ?? 'file';
  return {
    required: input.required,
    guide: input.guide?.trim() ? input.guide.trim() : undefined,
    mode,
    // 방식을 바꾸면 양식 파일 목록도 함께 비운다(얕은 병합이라 키를 빼면 옛 값이 살아남는다)
    forms: mode === 'physical' ? (input.forms ?? []) : [],
    ...(mode === 'spreadsheet' ? {
      columns: (input.columns ?? []).map(c => ({ key: c.key, label: c.label.trim() })),
      visibility: input.visibility ?? 'own',
    } : {}),
    ...(mode === 'spec'
      ? {
        actionId: input.actionId ?? undefined,
        template: input.template
          ? {
            id: input.template.id,
            name: input.template.name ?? null,
            familyId: input.template.familyId ?? null,
          }
          : undefined,
      }
      : {}),
  };
}

export interface SubmissionValidationInput {
  required: boolean;
  mode: SubmissionMode;
  templateId: string | null;
  /** `task.meta.deadlines` — 2개 이상이면 제출을 켤 수 없다 */
  deadlineCount: number;
  /** 이미 있는 제출물의 방식들(있으면 방식 전환·양식 변경을 막는다) */
  existingKinds?: SubmissionMode[];
  /** 이미 있는 spec 제출물이 하나라도 있으면 양식을 바꿀 수 없다 */
  templateChanged?: boolean;
  columns?: SubmissionColumn[];
  /** 과제 단위 수 — 실물 제출은 단위 업무와 함께 쓸 수 없다 */
  unitCount?: number;
}

/**
 * 저장 전 검증 — 화면이 막지 못한 조합을 여기서 잡는다.
 *
 * 서버 RPC 도 같은 것들을 거부하지만(3중 방어의 마지막 층), 저장을 눌러 놓고 나중에
 * 담당자가 제출할 때 실패하면 **매니저는 그 사실을 모른다**. 그래서 여기서 먼저 말한다.
 */
export function validateSubmissionConfig(input: SubmissionValidationInput): string[] {
  const errors: string[] = [];
  if (!input.required) return errors;
  if (input.mode === 'spreadsheet') {
    const columns = input.columns ?? [];
    if (!columns.length || columns.length > 30 || columns.some(c => !c.label.trim() || c.label.trim().length > 80)) {
      errors.push('컬럼은 1~30개, 컬럼명은 1~80자로 입력해 주세요.');
    }
    if (new Set(columns.map(c => c.label.trim())).size !== columns.length) errors.push('컬럼명은 서로 다르게 입력해 주세요.');
  }

  // 다중 마감과 상호 배타 — 회차별 완료가 meta.deadlineProgress 에 따로 있어
  // "제출=완료" 한 줄로 표현되지 않는다(방식과 무관하게 성립)
  if (input.deadlineCount > 1) {
    errors.push('마감이 여러 번인 할 일에는 제출을 켤 수 없습니다. 회차별 완료와 함께 쓸 수 없습니다.');
  }
  // 실물 수령은 담당자 단위로만 기록한다 — 단위별 [받음]은 만들지 않았다(서버도 거부)
  if (input.mode === 'physical' && (input.unitCount ?? 0) > 0) {
    errors.push('과제 단위 할 일에는 실물로 받기를 쓸 수 없습니다.');
  }
  if (input.mode === 'spec' && !input.templateId) {
    errors.push('양식 문서로 받으려면 양식을 골라야 합니다.');
  }
  // 이미 제출물이 있으면 방식을 바꿀 수 없다 — 이종 행이 섞이면 현황·분석이 무너진다
  const kinds = new Set(input.existingKinds ?? []);
  if (kinds.size > 0 && !kinds.has(input.mode)) {
    errors.push(
      `이미 ${submissionModeLabel([...kinds][0])} 방식으로 제출된 것이 있어 방식을 바꿀 수 없습니다. `
      + '기존 제출물을 먼저 정리하세요.',
    );
  }
  // 양식을 바꾸면 이미 낸 사람과 앞으로 낼 사람이 다른 서식을 쓰게 된다
  if (input.mode === 'spec' && input.templateChanged && kinds.has('spec')) {
    errors.push('이미 제출된 문서가 있어 양식을 바꿀 수 없습니다.');
  }
  return errors;
}
