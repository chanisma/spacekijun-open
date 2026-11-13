// ========================================
// NEIS 화면 사용 방법 — 시연 계획(순수 로직) (2026-10-05)
//
// 앱의 다른 기능은 사용 방법 씬을 손으로 그린다(feature-guide-dialog 스킬). 나이스 화면은
// 수백 개라 손으로 그릴 수 없으므로 **수집본 + 안내에서 씬을 생성**한다. 그래도 문법은 같다 —
// 왼쪽은 시연, 오른쪽은 그 단계의 말, 포인터는 자리 상수에서 유도(구성으로 보장).
//
// 여기는 «무엇을 어디서 보여 줄지»만 정한다. 그리기는 components/neis/NeisGuideScenes.tsx.
// ========================================

import {
  NEIS_EFFECT_LABEL,
  findNeisTarget,
  neisBodyAfterQuery,
  neisButtonEffect,
  neisStepTargets,
  type NeisBox,
  type NeisCapture,
  type NeisCaptureView,
  type NeisGuide,
  type NeisTabsElement,
} from './neisScreenModel';

// ── 자리 계산 ───────────────────────────────────────────

/**
 * 안쪽 탭 칸 하나하나의 자리 — 수집본에는 탭 줄 전체의 자리만 있다. 그림(NeisViewLayer)과
 * 포인터가 **이 함수 하나**를 함께 써서 포인터가 탭 위에 오는 것을 보장한다.
 *   buttons : 같은 폭으로 나눈다(나이스 단계 버튼이 그렇게 생겼다)
 *   folder  : 글자 수에 비례한 폭(넘치면 줄 폭에 맞춰 줄인다)
 */
export const NEIS_TAB_GAP = 8;
export function neisTabItemBoxes(element: NeisTabsElement): NeisBox[] {
  const [x, y, w, h] = element.box;
  const n = element.items.length;
  if (n === 0) return [];
  if (element.via === 'buttons') {
    const each = (w - NEIS_TAB_GAP * (n - 1)) / n;
    return element.items.map((_, i) => [x + i * (each + NEIS_TAB_GAP), y, each, h]);
  }
  const natural = element.items.map((item) => item.length * 13 + 34);
  const total = natural.reduce((a, b) => a + b, 0);
  const k = total > w ? w / total : 1;
  let cursor = x;
  return natural.map((width) => {
    const box: NeisBox = [cursor, y, width * k, h];
    cursor += width * k + 2;
    return box;
  });
}

/** 대상 ID 의 자리(화면 루트 기준) — 요소·그리드 칸·안쪽 탭 칸 */
export function neisTargetBox(view: NeisCaptureView, target: string): NeisBox | null {
  const hit = findNeisTarget(view, target);
  if (!hit) return null;
  if (hit.column) return hit.column.box;
  if (hit.element.kind === 'tabs' && target.startsWith('tab:')) {
    const index = hit.element.items.indexOf(target.slice(4));
    return index >= 0 ? neisTabItemBoxes(hit.element)[index] : hit.element.box;
  }
  return hit.element.box;
}

export function neisUnionBox(boxes: NeisBox[]): NeisBox | null {
  if (boxes.length === 0) return null;
  const x1 = Math.min(...boxes.map((b) => b[0]));
  const y1 = Math.min(...boxes.map((b) => b[1]));
  const x2 = Math.max(...boxes.map((b) => b[0] + b[2]));
  const y2 = Math.max(...boxes.map((b) => b[1] + b[3]));
  return [x1, y1, x2 - x1, y2 - y1];
}

export interface NeisCameraShot {
  scale: number;
  /** 내용의 왼쪽 위가 뷰포트의 어디에 오나 */
  x: number;
  y: number;
}

/**
 * 카메라 — 나이스 화면(폭 ≈1,600px)을 시연 창(≈900px)에 통째로 넣으면 글자가 7px 이 된다.
 * 그래서 먼저 전체를 보여 주고(어디쯤인지), 대상 쪽으로 다가간다(읽을 수 있게).
 * `focus` 가 없으면 전체 맞춤. 확대는 `maxScale` 을 넘지 않고, 화면 밖으로 밀려나지 않게 붙든다.
 */
export function neisCamera(
  viewport: { w: number; h: number },
  content: { w: number; h: number },
  focus?: NeisBox | null,
  { maxScale = 1, pad = 56 }: { maxScale?: number; pad?: number } = {},
): NeisCameraShot {
  const fit = Math.min(viewport.w / content.w, viewport.h / content.h, maxScale);
  const place = (size: number, view: number, scale: number, center: number | null, top: boolean) => {
    const span = size * scale;
    if (span <= view) return top ? 0 : (view - span) / 2;
    const want = center == null ? 0 : view / 2 - center * scale;
    return Math.min(0, Math.max(view - span, want));
  };
  if (!focus) {
    return { scale: fit, x: place(content.w, viewport.w, fit, null, false), y: place(content.h, viewport.h, fit, null, true) };
  }
  const [fx, fy, fw, fh] = focus;
  const want = Math.min(viewport.w / (fw + pad * 2), viewport.h / (fh + pad * 2), maxScale);
  const scale = Math.max(fit, want);
  return {
    scale,
    x: place(content.w, viewport.w, scale, fx + fw / 2, false),
    y: place(content.h, viewport.h, scale, fy + fh / 2, true),
  };
}

// ── 단계 구성 ───────────────────────────────────────────

export type NeisPlanKind = 'find' | 'flow' | 'overview' | 'caution' | 'more';

/** «알아 둘 것» 단계에 싣는 묻고 답하기 수 — 넘치면 오른쪽 글이 시연보다 길어진다 */
export const NEIS_FAQ_IN_PLAN = 3;

export interface NeisPlanStep {
  id: string;
  kind: NeisPlanKind;
  /** 단계 표시줄(2~5자) */
  label: string;
  title: string;
  detail?: string;
  points: string[];
  /** 씬 위쪽 한 줄 — 없으면 흐름 제목·단계 제목으로 */
  band?: string;
  /** 그릴 화면(view) */
  viewId: string;
  /** 포인터가 차례로 누를 대상(find·caution·overview 에서는 비춰 줄 대상) */
  targets: string[];
}

export interface NeisPlanInput {
  capture: NeisCapture;
  guide: NeisGuide | null;
  /** 몇째 흐름인가(안내가 있을 때) */
  flowIndex?: number;
  /** 메뉴목록의 담임 역할 — 비어 있으면 업무분장 담당자 메뉴 */
  roles?: string[];
}

function shortLabel(text: string): string {
  const clean = text.replace(/#\d+$/, '').replace(/^[a-z]+:/, '').split('/').pop()!.split('>').pop()!;
  return clean.length > 6 ? `${clean.slice(0, 5)}…` : clean;
}

function writeButtons(view: NeisCaptureView) {
  return view.elements.filter((e) => e.kind === 'button' && neisButtonEffect(e.label) === 'write');
}

function findStep(input: NeisPlanInput, viewId: string): NeisPlanStep {
  const { capture, roles } = input;
  const via = capture.reachedVia ?? '';
  const tab = via.split('>')[0]?.trim();
  const points = [
    via ? `나이스 경로: ${via}` : `화면 이름: ${capture.name}`,
    roles && roles.length > 0
      ? `상단의 담임 탭(${roles.join('·')})에서도 보입니다.`
      : `업무분장으로 이 메뉴를 받은 사람의 나이스에만 보입니다${tab ? ` — 수집 계정에서는 「${tab}」 탭 아래에 있었습니다` : ''}.`,
  ];
  if (capture.alsoVia?.length) points.push(`같은 화면이 「${capture.alsoVia.join('」·「')}」 탭에도 있습니다.`);
  return {
    id: 'find',
    kind: 'find',
    label: '화면 찾기',
    title: `나이스에서 「${capture.name}」 화면을 엽니다`,
    detail: '왼쪽 메뉴검색에 화면 이름을 넣으면 경로가 나옵니다. 상단 탭을 하나씩 펼쳐 찾는 것보다 빠르고, 같은 이름이 여러 탭에 있어도 경로로 가려낼 수 있습니다.',
    points,
    viewId,
    targets: [],
  };
}

/**
 * 사용 방법 한 편의 단계 — [화면 찾기] → (안내의 절차 | 화면 구성) → [주의].
 * 안내가 없어도 수집본만으로 앞뒤가 생긴다 — 모든 수집된 화면에 사용 방법이 있다.
 */
export function buildNeisWalkthroughPlan(input: NeisPlanInput): NeisPlanStep[] {
  const { capture, guide } = input;
  if (capture.status !== 'ok' || capture.views.length === 0) return [];
  const flow = guide?.flows[input.flowIndex ?? 0];
  // 안내가 없으면 요소가 가장 많은 탭을 보여 준다 — 첫 탭이 승인 단추 하나뿐인 화면이 있다(건강기록부전송관리)
  const richest = [...capture.views].sort((a, b) => b.elements.length - a.elements.length)[0];
  const view = (flow?.view && capture.views.find((v) => v.id === flow.view)) || (flow ? capture.views[0] : richest);
  const steps: NeisPlanStep[] = [findStep(input, view.id)];
  // 누가·무엇을 먼저 — 화면을 열기 전에 알아야 하는 것이라 [화면 찾기]에 싣는다(설명서의 업무담당·선행처리)
  if (guide?.who) steps[0].points.unshift(`담당: ${guide.who}`);
  if (guide?.before?.length) steps[0].points.push(...guide.before.map((item) => `먼저 끝나 있어야 할 일: ${item}`));
  // 조회했을 때 뜬 알림 = 선행 조건(«조사가능일이 아닙니다» 등) — 모르면 «안 열린다»로 막힌다
  const alerts = [...new Set(capture.views.flatMap((v) => v.query?.alerts ?? []))];
  if (alerts.length) steps[0].points.push(...alerts.map((a) => `조회하면 이런 알림이 뜰 수 있습니다: «${a}»`));

  if (flow) {
    flow.steps.forEach((step, index) => {
      let targets = neisStepTargets(step).filter((target) => findNeisTarget(view, target));
      // 안쪽 탭 화면이면 첫 단계에서 그 탭부터 누른다 — 안내를 쓴 사람이 적지 않아도
      if (index === 0 && view.tab && capture.views.length > 1 && !targets.includes(`tab:${view.tab}`)) {
        targets = [`tab:${view.tab}`, ...targets];
      }
      const first = targets.find((t) => !t.startsWith('tab:')) ?? targets[0];
      steps.push({
        id: `flow-${index}`,
        kind: 'flow',
        label: step.label ?? (first ? shortLabel(findNeisTarget(view, first)?.column?.label ?? first) : `${index + 1}단계`),
        title: step.text,
        ...(step.detail ? { detail: step.detail } : {}),
        points: step.points ?? [],
        viewId: view.id,
        targets,
      });
    });
  } else {
    const conditions = view.elements.filter((e) => e.kind === 'field' && e.region === 'search');
    const grids = view.elements.filter((e) => e.kind === 'grid');
    const notes = view.elements.filter((e) => e.kind === 'note');
    const hasSearch = view.elements.some((e) => e.kind === 'button' && e.label === '조회');
    const afterQuery = neisBodyAfterQuery(view);
    const report = view.elements.some((e) => e.kind === 'report');
    const points: string[] = [];
    if (conditions.length) points.push(`조회 조건: ${conditions.map((f) => (f.kind === 'field' && f.required ? `${f.label}(필수)` : f.label)).join(', ')}`);
    if (grids.length) points.push(`표: ${grids.map((g) => g.label).join(', ')}`);
    if (capture.views.length > 1) points.push(`화면 안 탭 ${capture.views.length}개: ${capture.views.map((v) => v.tab).join(', ')}`);
    points.push(...notes.slice(0, 2).map((n) => n.label));
    steps.push({
      id: 'overview',
      kind: 'overview',
      label: '화면 구성',
      title: `「${capture.name}」 화면에서 보이는 것`,
      band: report ? '조회하면 아래 보고서에 문서가 그려진다'
        : afterQuery ? '조회해야 본문이 나오는 화면' : hasSearch ? '조회 조건을 넣고 [조회] — 아래 표가 채워진다' : '화면 구성',
      detail: `${report
        ? '이 화면의 본문은 보고서 뷰어입니다. [조회]하면 출력용 문서가 쪽 단위로 그려지고, 위 도구 막대로 쪽을 넘기거나 파일로 저장·인쇄합니다. '
        : afterQuery
          ? '이 화면은 처음 열면 본문이 비어 있고, 조회 조건을 넣고 [조회]를 눌러야 본문(목록·입력칸)이 그려집니다. '
          : hasSearch ? '위쪽 회색 띠에 조회 조건을 넣고 [조회]를 누르면 아래 표가 채워집니다. ' : ''}`
        + `${capture.views.length > 1 ? `화면 안 탭 ${capture.views.length}개 중 「${view.tab}」을 보여 줍니다. ` : ''}`
        + '이 화면의 절차 안내는 아직 없어 구조만 보여 줍니다.',
      points,
      viewId: view.id,
      targets: [...conditions, ...grids, ...view.elements.filter((e) => e.kind === 'report')].map((e) => e.id).slice(0, 6),
    });
  }

  const writes = writeButtons(view);
  const cautions = guide?.cautions ?? [];
  if (writes.length > 0 || cautions.length > 0) {
    const names = [...new Set(writes.map((b) => b.label.replace(/#\d+$/, '')))];
    steps.push({
      id: 'caution',
      kind: 'caution',
      label: '주의',
      title: '자료를 바꾸는 버튼',
      band: '자료를 바꾸는 버튼 — 누르기 전에 확인',
      detail: '빨갛게 표시한 버튼은 나이스 자료를 바꿉니다(저장·삭제·마감 등). 무엇이 바뀌는지 확인한 뒤 누르세요 — 생활기록부에 남는 자료일 수 있습니다.',
      points: [...cautions, ...(names.length ? [`${NEIS_EFFECT_LABEL.write}: ${names.join(', ')}`] : [])],
      viewId: view.id,
      targets: writes.map((b) => b.id),
    });
  }

  // 알아 둘 것 — 현장 문의(나이스지원 답변)와 다음에 이어지는 일. 시연할 동작이 없어 맨 뒤에 둔다
  const faq = (guide?.faq ?? []).slice(0, NEIS_FAQ_IN_PLAN);
  const after = guide?.after ?? [];
  if (faq.length > 0 || after.length > 0) {
    steps.push({
      id: 'more',
      kind: 'more',
      label: '알아 둘 것',
      title: faq.length ? '자주 묻는 것' : '다음에 이어지는 일',
      band: '이 화면을 쓰는 사람들이 실제로 물은 것',
      detail: faq.length
        ? '학교 현장의 문의에 나이스지원이 답한 것입니다(나이스 사용자 설명서). 화면만 보고는 알 수 없는 규칙이 여기 많습니다.'
        : '이 화면에서 한 일이 다음 업무의 재료가 됩니다.',
      points: [
        ...faq.map((item) => `${item.q} → ${item.a}`),
        ...after.map((item) => `다음: ${item}`),
      ],
      viewId: view.id,
      targets: [],
    });
  }
  return steps;
}
