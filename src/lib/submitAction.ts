// ========================================
// 제출 받기 작업 (submit.file / submit.document / submit.physical) — 클라이언트 단일 출처 (2026-10-01)
//
// 설계: docs/plans/2026-10-01-submission-action-overhaul.md
// 입력 받기와 같은 요청·명단 표(collect_request / collect_target)를 쓰고, 제출물은 action_submission 이다.
// 서버가 정본이다 — 여기는 설정 모양·검증 문구·표 모델뿐이고 판정을 베끼지 않는다.
//   · 설정(config.submit)은 update_collect_config 로 저장(매니저 전원)
//   · 대상이 «이 할 일의 담당자»뿐이면 작업을 만들 때 서버가 요청을 저절로 보낸다
//   · 담당자가 대상인 열린 제출 요청을 전부 채우면 그 담당자가 완료된다(서버 트리거·RPC)
// ========================================

import type { TaskFile } from '@/types/tasks';
import { parseAudienceRule, validateAudienceRule, type AudienceRule } from './audienceRule';

export type SubmitActionType = 'submit.file' | 'submit.document' | 'submit.physical';
export type SubmitKind = 'file' | 'document' | 'physical';

export const SUBMIT_ACTION_TYPES: SubmitActionType[] = ['submit.file', 'submit.document', 'submit.physical'];

export function isSubmitActionType(type: string | null | undefined): type is SubmitActionType {
  return (SUBMIT_ACTION_TYPES as string[]).includes(type ?? '');
}

export function submitKindOf(type: SubmitActionType): SubmitKind {
  return type === 'submit.file' ? 'file' : type === 'submit.document' ? 'document' : 'physical';
}

/**
 * 제출 상태 낱말 — 종류마다 한 벌(2026-10-06). 실물은 «내는» 것이 아니라 책임자가 «받는» 것이라, 실물에서
 * «안 낸 사람»은 사실 «아직 안 받은 사람»이다. 현황·대상자 화면·엑셀이 이것만 쓴다.
 */
export const SUBMIT_STATE_LABEL: Record<SubmitKind, { done: string; pending: string; pendingPeople: string; progress: string }> = {
  file: { done: '냄', pending: '안 냄', pendingPeople: '안 낸', progress: '제출' },
  document: { done: '냄', pending: '안 냄', pendingPeople: '안 낸', progress: '제출' },
  physical: { done: '받음', pending: '받기 전', pendingPeople: '아직 안 받은', progress: '받음' },
};

export const SUBMIT_KIND_LABEL: Record<SubmitKind, string> = {
  file: '파일 제출',
  document: '양식 문서 제출',
  physical: '실물 제출',
};

/** 새 작업의 기본 제목 — 서버 update_collect_config 의 기본값과 같다 */
export const SUBMIT_DEFAULT_TITLE: Record<SubmitActionType, string> = {
  'submit.file': '파일 제출 받기',
  'submit.document': '양식 문서 제출 받기',
  'submit.physical': '실물 제출 받기',
};

export interface SubmitTemplateRef {
  id: string;
  name?: string | null;
  familyId?: string | null;
}

export interface SubmitConfig {
  title: string;
  audience: AudienceRule;
  /** YYYY-MM-DD — 비면 할 일 마감을 쓴다(서버 my_collect_requests 와 같은 규칙) */
  dueDate: string;
  guide: string;
  /** 양식 문서 — 담당자가 채울 양식 */
  template: SubmitTemplateRef | null;
  /** 실물 — 매니저가 붙인 제출 양식(구글 공용 드라이브) */
  forms: TaskFile[];
}

/** 대상 기본값 = 이 할 일의 담당자 — 서버 submit_cfg_of 와 같다 */
export const DEFAULT_SUBMIT_AUDIENCE: AudienceRule = { include: [{ type: 'task_assignees' }], exclude: [] };

export function defaultSubmitConfig(type: SubmitActionType): SubmitConfig {
  return {
    title: SUBMIT_DEFAULT_TITLE[type],
    audience: DEFAULT_SUBMIT_AUDIENCE,
    dueDate: '',
    guide: '',
    template: null,
    forms: [],
  };
}

/** 저장된 config(작업 행의 config 전체 또는 config.submit) → 설정. 비어 있으면 기본값 */
export function parseSubmitConfig(type: SubmitActionType, raw: unknown): SubmitConfig {
  const base = defaultSubmitConfig(type);
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const cfg = (record.submit && typeof record.submit === 'object' ? record.submit : record) as Record<string, unknown>;
  const audience = cfg.audience ? parseAudienceRule(cfg.audience) : base.audience;
  const template = cfg.template && typeof cfg.template === 'object' && typeof (cfg.template as SubmitTemplateRef).id === 'string'
    ? (cfg.template as SubmitTemplateRef)
    : null;
  return {
    title: typeof cfg.title === 'string' && cfg.title.trim() ? cfg.title : base.title,
    audience: audience.include.length > 0 || audience.exclude.length > 0 ? audience : base.audience,
    dueDate: typeof cfg.dueDate === 'string' ? cfg.dueDate.slice(0, 10) : '',
    guide: typeof cfg.guide === 'string' ? cfg.guide : '',
    template,
    forms: Array.isArray(cfg.forms) ? (cfg.forms as TaskFile[]).filter((f) => f && typeof f.url === 'string' && f.url) : [],
  };
}

/** 설정 → 저장 JSON(config.submit). 종류에 없는 칸은 싣지 않는다 */
export function serializeSubmitConfig(type: SubmitActionType, cfg: SubmitConfig): Record<string, unknown> {
  return {
    title: cfg.title.trim(),
    audience: cfg.audience,
    dueDate: cfg.dueDate || '',
    guide: cfg.guide.trim(),
    ...(type === 'submit.document' ? { template: cfg.template } : {}),
    ...(type === 'submit.physical' ? { forms: cfg.forms } : {}),
  };
}

/** 보내기 전에 화면이 말할 문제 — 서버 submit_config_error 와 같은 판정 */
export function validateSubmitConfig(type: SubmitActionType, cfg: SubmitConfig): string | null {
  const rule = validateAudienceRule(cfg.audience);
  if (rule) return rule;
  if (type === 'submit.document' && !cfg.template?.id) return '양식을 고르세요.';
  return null;
}

// ── 현황 표 ────────────────────────────────────────────────────────────────

export interface SubmissionRow {
  id: string;
  resource_id: string;
  name: string | null;
  kind: SubmitKind;
  file_name: string | null;
  file_url: string | null;
  google_drive_id: string | null;
  mime_type: string | null;
  file_size: number | null;
  document_id: string | null;
  document_title: string | null;
  received_at: string | null;
  /** 과제 단위 키 — 단위 축 요청만(2026-10-01) */
  unit_key?: string | null;
  created_at: string;
  updated_at: string;
}

/** 과제 단위 — task.meta.units 와 같은 모양 */
export interface SubmitUnit {
  key: string;
  label: string;
}
/** task.meta.unitProgress — { 단위키: { 사람id: {status} } }, 항목 존재 = 맡음 */
export type SubmitUnitProgress = Record<string, Record<string, { status?: string }>>;

/** 이 사람이 맡은 단위(배정·선택) — 서버 submission_held_units 와 같은 판정 */
export function heldUnits(units: SubmitUnit[], progress: SubmitUnitProgress, resourceId: string | null): SubmitUnit[] {
  if (!resourceId) return [];
  return units.filter((u) => Boolean(progress[u.key]?.[resourceId]));
}

/** 아직 아무도 맡지 않은 단위 — 대상자가 골라 내면 맡게 된다 */
export function unclaimedUnits(units: SubmitUnit[], progress: SubmitUnitProgress): SubmitUnit[] {
  return units.filter((u) => Object.keys(progress[u.key] ?? {}).length === 0);
}

export interface SubmitBoardTarget {
  id: string;
  resource_id: string | null;
  name: string;
  reasons: string[];
  removed: boolean;
}

export interface SubmitPersonRow {
  target: SubmitBoardTarget;
  submissions: SubmissionRow[];
  /** 채웠는가 — 실물은 [받음] 행이 곧 채움(서버 submission_target_complete 와 같다) */
  done: boolean;
  /** 마지막 제출 시각 */
  lastAt: string | null;
  /** 단위 축 — 이 사람이 맡은 단위와 낸 것 여부 */
  units?: { unit: SubmitUnit; done: boolean }[];
}

/**
 * 대상(사람)마다 한 줄 — 빠진 대상은 아래로, 안 낸 사람이 먼저.
 * 단위 축(`unitAxis`)이면 «다 냄» = 맡은 단위가 하나 이상이고 전부 냈다(맡은 단위가 없으면 낼 것도 없다).
 */
export function buildSubmitRows(
  targets: SubmitBoardTarget[],
  submissions: SubmissionRow[],
  unitAxis?: { units: SubmitUnit[]; progress: SubmitUnitProgress },
): SubmitPersonRow[] {
  const byPerson = new Map<string, SubmissionRow[]>();
  for (const s of submissions) {
    const list = byPerson.get(s.resource_id) ?? [];
    list.push(s);
    byPerson.set(s.resource_id, list);
  }
  const rows = targets.map((target) => {
    const mine = target.resource_id ? byPerson.get(target.resource_id) ?? [] : [];
    const lastAt = mine.reduce<string | null>((m, s) => (!m || s.updated_at > m ? s.updated_at : m), null);
    if (unitAxis) {
      const held = heldUnits(unitAxis.units, unitAxis.progress, target.resource_id);
      const units = held.map((unit) => ({ unit, done: mine.some((s) => s.unit_key === unit.key) }));
      return { target, submissions: mine, lastAt, units, done: units.length > 0 && units.every((u) => u.done) };
    }
    return { target, submissions: mine, done: mine.length > 0, lastAt };
  });
  return rows.sort((a, b) =>
    Number(a.target.removed) - Number(b.target.removed)
    || Number(a.done) - Number(b.done)
    || a.target.name.localeCompare(b.target.name, 'ko'));
}

export function submitProgress(rows: SubmitPersonRow[]) {
  const live = rows.filter((r) => !r.target.removed && r.target.resource_id);
  const done = live.filter((r) => r.done).length;
  return { total: live.length, done, pending: live.filter((r) => !r.done).map((r) => r.target.name) };
}

/**
 * 파일 제출 취소 확인 문구 (2026-10-05) — 종전엔 휴지통 한 번에 바로 지워졌다.
 * 기록과 함께 드라이브 파일도 지워지고(deleteActionSubmission), 그 사람(단위)에게 남은 제출이 없으면
 * 완료가 진행 중으로 돌아간다(서버 submission_sync_assignee). 되돌리려면 파일을 다시 올려야 한다.
 * @param ownerName 남의 제출을 지울 때(책임자) 그 사람 이름 — 본인이면 생략
 */
export function withdrawSubmissionConfirmMessage(fileName: string | null | undefined, ownerName?: string | null): string {
  const what = fileName ? `"${fileName}"` : '이 파일';
  const head = ownerName ? `${ownerName} 님의 ${what} 제출을 취소할까요?` : `${what} 제출을 취소할까요?`;
  return `${head}\n드라이브의 파일도 함께 지워집니다. 남은 제출물이 없으면 완료가 진행 중으로 돌아가고, 다시 내려면 파일을 새로 올려야 합니다.`;
}
