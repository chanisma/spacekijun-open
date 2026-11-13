// 스펙 번들 내보내기: 스펙 검수 결과를 외부 AI 에이전트가 읽을 수 있는 한 파일로 묶는다.
//
// 왜 스펙만으론 부족한가: locator는 `{section, table:{index}, row, col}`이나 앵커 지문 같은
// **엔진 상대 주소**라, 문서를 파싱하지 않은 에이전트는 그것만 보고 아무것도 못 한다.
// 그래서 타깃마다 "지금 그 자리에 뭐라고 적혀 있는지"(currentText)와 계획 스키마·빈 계획
// 골격을 함께 싣는다. 그러면 번들 하나로 "무엇을 어디에 채워야 하는가"가 자립적으로 읽힌다.
//
// 에이전트의 산출물은 **plan JSON**이다(HWPX 바이트가 아니라). 계획 검토의 JSON 모드에
// 그대로 붙여넣으면 검증된 채움 엔진이 문서를 만든다 — 에이전트가 XML을 직접 건드리며
// 줄 캐시·표 재조립 같은 함정을 다시 밟을 이유가 없다.
//
// 일반화 원칙(README): 여기에도 특정 양식 지식을 두지 않는다.

import { derivePlanSchema, type PlanFieldSchema } from './planSchema';
import { parseHwpxSection } from './hwpxIndex';
import { resolveLocator, resolvedRegionText } from './locator';
import {
  isPersonKind,
  type Plan, type RowGroupTarget, type TableGroupTarget, type Target, type WorkSpec,
} from './types';

/** 타깃 1건의 사람이 읽을 수 있는 설명(현재 문서 내용 포함) */
export interface SpecBundleTarget {
  id: string;
  kind: Target['kind'];
  label?: string;
  instruction?: string;
  /** 이 타깃이 읽는 plan 키(없으면 타깃 id가 곧 키) */
  planKey?: string;
  required?: boolean;
  locator: Target['locator'];
  /** 반복 행의 열 구성(있을 때) */
  columns?: Array<{ col: number; kind: string; source?: string; instruction?: string }>;
  /** 표 묶음의 셀 구성 + 소제목(있을 때) — 항목마다 이 표가 한 개씩 생성된다 */
  cells?: Array<{ row: number; col: number; kind: string; source?: string; instruction?: string }>;
  caption?: { anchor: string; source: string };
  /** 지금 그 구역에 적혀 있는 원문 — locator만으론 알 수 없는 결정적 맥락 */
  currentText: string;
  /** 구역을 찾지 못함(스펙이 문서와 어긋남) */
  stale?: true;
}

export interface SpecBundle {
  kind: 'spacekijun.action-spec-bundle';
  version: 1;
  template: {
    name?: string;
    sourceFileName?: string;
    templateVersion?: number;
    contentSha256?: string;
    sectionCount: number;
  };
  spec: WorkSpec;
  planSchema: PlanFieldSchema[];
  /** 빈 계획 골격 — 에이전트는 이 모양 그대로 값을 채워 돌려주면 된다 */
  planSkeleton: Plan;
  targets: SpecBundleTarget[];
  readme: string[];
}

const CURRENT_TEXT_LIMIT = 4000;

export interface SpecBundleMeta {
  name?: string;
  sourceFileName?: string;
  templateVersion?: number;
  contentSha256?: string;
}

/** 계획 골격 — planSchema에서 빈 값 생성(서비스의 emptyPlanFromSchema와 같은 규칙) */
function skeletonOf(schema: PlanFieldSchema[]): Plan {
  const plan: Plan = {};
  for (const f of schema) plan[f.key] = f.type === 'array' ? [] : f.type === 'number' ? 0 : '';
  return plan;
}

function planKeyOf(s?: string): string | undefined {
  return /(?:^|[^A-Za-z0-9_])plan\.([A-Za-z0-9_]+)/.exec(s ?? '')?.[1];
}

export function buildSpecBundle(spec: WorkSpec, sections: string[], meta: SpecBundleMeta = {}): SpecBundle {
  const indexes = sections.map(parseHwpxSection);
  const planSchema = derivePlanSchema(spec);

  const targets: SpecBundleTarget[] = spec.targets.map((t) => {
    const base: SpecBundleTarget = {
      id: t.id,
      kind: t.kind,
      label: t.label,
      instruction: t.instruction,
      required: t.required,
      locator: t.locator,
      currentText: '',
    };
    const src = (t as { source?: string; select?: string; rowSource?: string });
    // source 없는 prose·이름 타깃은 타깃 id가 곧 plan 키다(derivePlanSchema와 같은 규칙)
    base.planKey = planKeyOf(src.source ?? src.select ?? src.rowSource)
      ?? (t.kind === 'prose' || isPersonKind(t.kind) ? t.id : undefined);
    if (t.kind === 'rowGroup') {
      base.columns = ((t as RowGroupTarget).rowSchema ?? []).map((c) => ({
        col: c.col, kind: c.kind, source: c.source, instruction: c.instruction,
      }));
    }
    if (t.kind === 'tableGroup') {
      const tg = t as TableGroupTarget;
      base.caption = tg.caption;
      base.cells = (tg.cellSchema ?? []).map((c) => ({
        row: c.addr.row, col: c.addr.col, kind: c.kind ?? 'scalar',
        source: c.source, instruction: c.instruction,
      }));
    }
    try {
      const res = resolveLocator(indexes, t.locator);
      if (res.kind === 'stale') return { ...base, stale: true };
      base.currentText = resolvedRegionText(res, indexes).replace(/\s+/g, ' ').trim().slice(0, CURRENT_TEXT_LIMIT);
    } catch {
      return { ...base, stale: true };
    }
    return base;
  });

  return {
    kind: 'spacekijun.action-spec-bundle',
    version: 1,
    template: {
      name: meta.name,
      sourceFileName: meta.sourceFileName,
      templateVersion: meta.templateVersion,
      contentSha256: meta.contentSha256,
      sectionCount: sections.length,
    },
    spec,
    planSchema,
    planSkeleton: skeletonOf(planSchema),
    targets,
    readme: [
      '이 파일은 SPACEKIJUN "HWPX 스펙 기반 문서 생성"의 스펙 번들이다.',
      '같은 폴더의 template.hwpx가 채울 대상 원본 양식이다.',
      '',
      '[무엇인가]',
      '- spec: 문서의 채울 자리(타깃)와 그 위치(locator)를 정의한 계약.',
      '- targets[].currentText: 지금 그 자리에 적혀 있는 원문. 표기 형식·분량의 기준이다.',
      '- planSchema / planSkeleton: 채워야 할 값의 이름·타입·모양.',
      '',
      '[작업 순서 — 두 단계를 모두 수행할 것]',
      '',
      '1단계. 계획(plan) JSON 작성 — "무엇을 어디에 채울지"',
      '- planSkeleton과 같은 모양으로 값만 채워 plan.json으로 저장한다.',
      '- 배열 필드(반복 행)는 행 객체의 배열이다. 각 행은 planSchema[].itemFields의 키를 쓴다',
      '  (예: {"c0": "값", "c1": 0}). 2차원 배열로 반환하지 말 것.',
      '- kind가 tableGroup인 타깃도 배열이다. 항목 **하나당 같은 서식의 표가 한 개** 생성되며',
      '  targets[].cells가 그 표의 어느 셀에 어떤 키가 들어가는지, caption이 표 소제목을 알려준다.',
      '- kind가 prose인 타깃은 그 타깃 id를 키로 하는 문자열이며, 문서에 그대로 실릴 본문이다.',
      '  currentText의 문장 구조·어조·분량(자수·문단 수)을 따르되 내용은 새로 쓴다.',
      '- kind가 personTeacher/personStudent인 타깃은 **학교 명단에서 고른 사람 이름**이다. 그 타깃 id를',
      '  키로 하는 문자열이며 이름을 ", "로 잇는다(예: "김철수, 이영희").',
      '  **이름을 지어내지 말 것** — 실재하는 교사·학생만 들어갈 수 있으므로, 자료에 이름이 없으면',
      '  빈 문자열 ""로 두고 사람이 앱의 계획 검토에서 고르게 한다.',
      '- kind가 keep인 타깃은 건드리지 않는다. computed는 수식으로 계산되므로 채우지 않아도 된다.',
      '- choice는 options의 value(없으면 label) 중 하나와 정확히 일치해야 한다.',
      '',
      '2단계. 한글 문서 생성 — 계획을 실제 HWPX에 적용',
      '- 계획만 만들고 끝내지 말 것. 아래 명령으로 완성된 .hwpx까지 만들어야 작업이 끝난다.',
      '- SPACEKIJUN 저장소에서:',
      '    npx tsx scripts/task-work-spec-apply/apply-plan.mts \\',
      '      --bundle <이 파일> --plan <plan.json> --template <template.hwpx> --out <결과.hwpx>',
      '  (--template 생략 시 번들과 같은 폴더의 template.hwpx, --out 생략 시 plan 옆에 저장)',
      '- 이 명령은 앱과 **같은 채움 엔진**을 쓴다. 실행 후 출력되는 "채우지 못한 타깃"과',
      '  "검증 경고"를 확인하고, 남은 항목이 있으면 plan을 고쳐 다시 실행한다.',
      '',
      '[HWPX XML을 손으로 고치지 말 것]',
      '- 문서를 바꾸는 방법은 위 2단계 명령뿐이다. XML 직접 편집은 아래 이유로 실패한다.',
      '- locator는 이 엔진의 파싱 순서를 전제한 상대 주소라 외부에서 그대로 해석할 수 없다.',
      '- HWPX는 문단마다 줄 나눔 캐시(<hp:linesegarray>)를 들고 있어, 텍스트만 바꾸면',
      '  옛 줄 폭에 새 글자가 밀려 들어가 렌더가 깨진다. 표 행 증감은 더 복잡하다.',
      '- 위 명령은 이 캐시 재계산까지 처리한다.',
      '',
      '[앱에서 이어서 하려면]',
      '- plan.json 내용을 러너 "계획 검토" 단계의 JSON 모드에 붙여넣어도 같은 결과가 나온다',
      '  (이쪽은 실행 이력·완성본 저장까지 남는다).',
    ],
  };
}
