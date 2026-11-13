// ========================================
// 연결된 작업 패널 — 관리 / 사용 두 보기 (2026-09-23)
//
// 같은 연결 목록을 두 입장에서 본다:
//   관리 = 연결을 **편집**하는 사람(업무 흐름 소유자 ∨ admin) — 무엇을 가리키는지·해제·설정
//   사용 = 연결된 작업을 **수행**하는 사람(담당자·그 밖의 열람자) — 무엇을 눌러 하면 되는지
// 둘 다인 사람에게만 토글을 준다. 판정은 전부 여기, 패널은 그리기만 한다.
// ========================================

import { neisActionTitle, neisRefPath, parseNeisActionConfig } from '@/lib/neisScreens';
import { isSubmitActionType, parseSubmitConfig } from '@/lib/submitAction';
import { externalActionSummary, parseExternalActionConfig } from '@/lib/externalScreens';
import { describeAudienceRule } from '@/lib/audienceRule';
import { collectSummary, parseCollectConfig } from '@/lib/collectInput';
import { parseMessageConfig } from '@/lib/taskMessage';
import type { TaskActionDefinition } from '../actionRegistry';
import type { TaskAction } from '../types';

export type ActionPanelMode = 'manage' | 'use';

export interface PanelModeInput {
  /** 연결·해제·설정 권한 — 업무 흐름 소유자 ∨ admin(종전 readOnly 의 반대) */
  canManage: boolean;
  /** 이 할 일의 담당자인가 */
  isAssignee: boolean;
  /** 진입점이 원하는 기본 보기 — 할 일 목록은 use, 업무 흐름은 manage */
  preferred: ActionPanelMode;
}

export interface PanelModes {
  modes: ActionPanelMode[];
  initial: ActionPanelMode;
}

/**
 * 보여 줄 보기. 관리 권한이 없으면 사용뿐이다(담당자가 아니어도 — 볼 수 있는 사람에게
 * 편집 UI 를 비활성으로 보여 주는 것보다 쓸 수 있는 것만 보여 주는 편이 낫다).
 * 관리자이지만 담당자가 아니면 관리뿐이다 — 사용 보기는 "내가 할 일"이라 의미가 없다.
 */
export function resolvePanelModes({ canManage, isAssignee, preferred }: PanelModeInput): PanelModes {
  if (!canManage) return { modes: ['use'], initial: 'use' };
  if (!isAssignee) return { modes: ['manage'], initial: 'manage' };
  return { modes: ['manage', 'use'], initial: preferred };
}

/**
 * 타인 소유 연결에서도 실행할 수 있는 유형 — 서버(`start_task_action_run`·RUN 정책)가 정본.
 * 여기 값을 늘리기 전에 서버 완화를 먼저 해야 한다(TaskActionPanel 주석 참고).
 */
export const SHARED_RUNNABLE_TYPES = new Set<string>(['document.spec_fill']);

export type UseViewAffordance =
  /** NEIS 화면 안내(편집·기록 없이) */
  | { kind: 'guide'; label: string }
  /** 실행 러너 열기 */
  | { kind: 'run'; label: string }
  /** 이 사람은 수행할 수 없다 — 이유를 말한다 */
  | { kind: 'none'; reason: string };

/** 사용 보기에서 이 작업의 주 동작 */
export function affordanceForUse(
  action: TaskAction,
  definition: TaskActionDefinition | null,
  viewer: { userId: string | null; canUseDefinition: boolean; collectTarget?: boolean; canManage?: boolean },
): UseViewAffordance {
  if (!definition) return { kind: 'none', reason: '지원하지 않는 작업 유형입니다.' };
  // ⚠️ kind='external' 은 이제 NEIS 만이 아니다 — 문구를 유형으로 가른다(2026-09-24)
  if (definition.type === 'external.screen') return { kind: 'guide', label: '처리 안내 보기' };
  if (definition.kind === 'external') return { kind: 'guide', label: '나이스 화면 안내 보기' };
  // 입력 받기의 응답자는 할 일 담당자와 다르다 — 응답은 내 할 일의 「입력 요청」에서 한다
  // 러너가 보는 사람에 따라 입력 화면(대상)·현황(만든 사람)·둘 다를 연다(2026-09-24)
  // 책임자 = 만든 사람 ∨ 서버가 관리할 수 있다고 한 사람(공동 책임자 — 2026-10-06)
  const owner = Boolean(viewer.canManage) || Boolean(viewer.userId && viewer.userId === action.created_by);
  if (action.action_type === 'collect.input') {
    if (viewer.collectTarget) return { kind: 'run', label: owner ? '입력하기·현황 보기' : '입력하기' };
    return owner
      ? { kind: 'run', label: '입력 현황 보기' }
      : { kind: 'none', reason: '이 입력 요청의 대상이 아닙니다.' };
  }
  // 제출 받기(2026-10-01) — 입력 받기와 같은 결: 대상이면 내기, 만든 사람이면 현황
  if (isSubmitActionType(action.action_type)) {
    if (viewer.collectTarget) return { kind: 'run', label: owner ? '제출하기·현황 보기' : '제출하기' };
    return owner
      ? { kind: 'run', label: '제출 현황 보기' }
      : { kind: 'none', reason: '이 제출 요청의 대상이 아닙니다.' };
  }
  // 메시지는 매니저가 보낸다 — 받는 사람은 알림으로 받는다
  if (action.action_type === 'message.send') {
    return owner
      ? { kind: 'run', label: '메시지 쓰기·보내기' }
      : { kind: 'none', reason: '책임자가 보내는 메시지입니다. 받은 메시지는 알림에서 확인합니다.' };
  }
  if (!viewer.canUseDefinition) {
    return { kind: 'none', reason: definition.adminOnly ? '관리자 전용 작업입니다.' : '이 작업을 쓸 권한이 없습니다.' };
  }
  if (SHARED_RUNNABLE_TYPES.has(action.action_type)) return { kind: 'run', label: '양식으로 내 문서 만들기' };
  // 그 밖의 유형은 RUN 쓰기가 연결 소유자에게만 열린다
  if (viewer.userId && viewer.userId === action.created_by) {
    const label =
      definition.kind === 'link' ? '기능 화면 열기' : definition.kind === 'embed' ? '열어서 처리하기' : '실행하기';
    return { kind: 'run', label };
  }
  return { kind: 'none', reason: '관리자가 처리하는 작업입니다.' };
}

/** 관리 보기 카드의 한 줄 요약 — 이 연결이 **무엇을 가리키는지** */
export function manageSummaryFor(action: Pick<TaskAction, 'config'>, definition: TaskActionDefinition | null): string {
  if (!definition) return '지원하지 않는 작업 유형';
  if (definition.type === 'external.screen') {
    return externalActionSummary(parseExternalActionConfig(action.config));
  }
  if (definition.kind === 'external') {
    const config = parseNeisActionConfig(action.config);
    if (config.screens.length === 0) return '화면 미지정 — 설정에서 나이스 화면을 고르세요';
    return `${neisActionTitle(config).replace(/^NEIS · /, '')}${config.note ? ' · 안내 있음' : ''}`;
  }
  if (definition.type === 'collect.input') {
    const collect = (action.config as { collect?: unknown } | null)?.collect;
    if (!collect) return '설정 전 — [열기]에서 대상과 입력 항목을 정하세요';
    const config = parseCollectConfig(action.config);
    return collectSummary(config, describeAudienceRule(config.audience));
  }
  if (isSubmitActionType(definition.type)) {
    const cfg = parseSubmitConfig(definition.type, action.config);
    const extra = definition.type === 'submit.document'
      ? (cfg.template?.name ? ` · 양식 ${cfg.template.name}` : ' · 양식 미지정')
      : definition.type === 'submit.physical' && cfg.forms.length > 0 ? ` · 양식 ${cfg.forms.length}개` : '';
    return `${describeAudienceRule(cfg.audience)}${extra}`;
  }
  if (definition.type === 'message.send') {
    const message = parseMessageConfig(action.config);
    if (!message.body.trim()) return '작성 전 — [열기]에서 받는 사람과 메시지를 정하세요';
    return `${describeAudienceRule(message.audience)} · ${message.body.trim().slice(0, 40)}`;
  }
  const template = (action.config as { defaultTemplate?: { name?: string } } | null)?.defaultTemplate;
  if (definition.type === 'document.spec_fill') {
    return template?.name ? `기본 양식 · ${template.name}` : '기본 양식 없음 — 실행하는 사람이 고릅니다';
  }
  if (definition.kind === 'link' || definition.kind === 'embed') {
    return definition.route ? `화면 · ${definition.route}` : definition.description;
  }
  return definition.description;
}

/** 사용 보기 카드의 한 줄 설명 — **무엇을 하면 되는지** */
export function summaryForUse(action: TaskAction, definition: TaskActionDefinition | null): string {
  if (!definition) return '';
  if (definition.type === 'external.screen') {
    // 제목이 이미 «시스템 · 화면»이다 — 둘째 줄은 제목에 없는 것(매니저의 안내)
    const config = parseExternalActionConfig(action.config);
    if (!config.system) return '아직 어디서 처리하는지 지정되지 않았습니다.';
    if (config.note) return config.note;
    const first = config.screens[0];
    if (!first) return `${config.system} 에서 처리합니다.`;
    const more = config.screens.length > 1 ? ` 외 화면 ${config.screens.length - 1}개` : '';
    return `${first.path ?? first.name}${more}`;
  }
  if (definition.kind === 'external') {
    // 제목이 이미 화면 이름이다("NEIS · 자료등록") — 둘째 줄은 제목에 없는 것: 매니저의 안내,
    // 없으면 나이스에서 찾아갈 메뉴 경로(2026-09-23: "나이스 자료등록 화면에서 처리합니다"가 되풀이였다)
    const config = parseNeisActionConfig(action.config);
    if (config.screens.length === 0) return '아직 화면이 지정되지 않았습니다.';
    if (config.note) return config.note;
    const path = neisRefPath(config.screens[0]).slice(0, -1).join(' › ');
    const more = config.screens.length > 1 ? ` 외 화면 ${config.screens.length - 1}개` : '';
    return `${path}${more}`;
  }
  if (definition.type === 'document.spec_fill') return '지정된 양식의 빈칸을 채워 문서를 만듭니다.';
  if (definition.type === 'collect.input') {
    const config = parseCollectConfig(action.config);
    return collectSummary(config, describeAudienceRule(config.audience));
  }
  if (isSubmitActionType(definition.type)) {
    const cfg = parseSubmitConfig(definition.type, action.config);
    return cfg.guide.trim() || definition.description;
  }
  return definition.description;
}
