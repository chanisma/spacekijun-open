/**
 * 창의적 체험활동 안내 씬 회귀 (2026-09-10)
 *
 * 실행: npx tsx --tsconfig tsconfig.app.json scripts/creative-activities-guide-test/run.mts
 * (`--tsconfig` 없이 돌리면 .tsx 가 classic 런타임으로 컴파일돼 `React is not defined` 로 죽는다)
 *
 * 그림 만들기 : PREVIEW=1 npx tsx --tsconfig tsconfig.app.json scripts/creative-activities-guide-test/run.mts
 *   → `scripts/creative-activities-guide-test/.preview/scenes.html` 에 프레임을 굽는다.
 *     브라우저로 열어 겹침·넘침·잘림을 눈으로 본다(코드 통과 ≠ 픽셀 통과).
 *
 * ── 왜 정적 검사가 필요한가 ────────────────────────────────────────────────
 * 안내 씬은 **오류를 내지 않고 조용히 틀린다** — 창이 캔버스 밖으로 나가도, 포인터가 엉뚱한
 * 곳을 짚어도, 목업 라벨이 실제 화면과 달라져도 렌더는 성공한다. 특히 마지막 것이 위험하다:
 * 앱 문구가 바뀌면 안내가 **거짓말**을 하게 되는데 아무 데서도 안 터진다.
 *
 * `Scene` 은 SSR 에서 `useEffect` 가 돌지 않으므로 `paused`+`freezeAt` 으로 t 를 고정할 수 있다
 * — 시각별 프레임을 결정론적으로 뽑는 근거가 이것이다.
 */
import { createElement as h, type FC } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Scene } from '../../src/lib/walkthrough';
import { STAGE_H, STAGE_W } from '../../src/components/walkthrough/WalkthroughStage';
import { getAreaGroupLabel } from '../../src/features/creative-activities/utils/activityLabels';
import { UNCATEGORIZED, UNCATEGORIZED_LABEL, getCategoryTone } from '../../src/features/creative-activities/utils/categories';
import { LEVEL_LABEL, depthLabel } from '../../src/features/creative-activities/utils/inquiryLabels';
import { AREA } from '../../src/features/creative-activities/components/guide/tokens';
import { SCOPES } from '../../src/features/creative-activities/components/guide/tabs';
import {
  SceneFind, SceneLineage, SceneRecord, SceneReflect,
} from '../../src/features/creative-activities/components/guide/browseScenes';
import {
  SceneAccept, ScenePropose, SceneReview,
} from '../../src/features/creative-activities/components/guide/proposalScenes';
import {
  SceneSeed, SceneThemeActivities, SceneThemes,
} from '../../src/features/creative-activities/components/guide/exploreScenes';
import { themeToSeed } from '../../src/features/creative-activities/utils/inquiryToActivity';
import type { InquiryActivity, InquiryLeafTheme } from '../../src/features/creative-activities/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** 씬마다 눈여겨볼 국면(초). 마지막은 모든 모션이 끝난 뒤다. */
const SCENES: { id: string; name: string; Comp: FC; times: number[] }[] = [
  { id: 'find', name: '① 찾기 (전체·내 담당)', Comp: SceneFind, times: [1.0, 2.4, 5.0, 8.5] },
  { id: 'record', name: '② 기록 (전체·내 담당)', Comp: SceneRecord, times: [1.2, 3.8, 5.6, 8.6] },
  { id: 'reflect', name: '③ 성찰 (전체·내 담당)', Comp: SceneReflect, times: [1.2, 3.5, 6.4, 8.5] },
  { id: 'lineage', name: '④ 이어가기 (전체·내 담당)', Comp: SceneLineage, times: [1.2, 3.0, 5.6, 8.8] },
  { id: 'propose', name: '① 제안 (제안함)', Comp: ScenePropose, times: [1.2, 3.4, 5.6, 8.2] },
  { id: 'review', name: '② 관심·검토 (제안함)', Comp: SceneReview, times: [1.5, 3.0, 6.0, 8.2] },
  { id: 'accept', name: '③ 개설 (제안함)', Comp: SceneAccept, times: [1.4, 3.2, 6.5, 8.4] },
  { id: 'themes', name: '① 갈래 (탐구 탐색)', Comp: SceneThemes, times: [1.5, 3.0, 6.0, 8.4] },
  { id: 'graph', name: '② 활동·그래프 (탐구 탐색)', Comp: SceneThemeActivities, times: [1.5, 3.4, 6.0, 8.6] },
  { id: 'seed', name: '③ 기록으로 (탐구 탐색)', Comp: SceneSeed, times: [1.4, 3.0, 5.5, 8.2] },
];

/** 한 씬을 한 시각에 정적 렌더 */
const render = (Comp: FC, t: number): string =>
  renderToStaticMarkup(
    h(Scene as unknown as FC<{ paused: boolean; freezeAt: number; children: unknown }>,
      { paused: true, freezeAt: t } as never, h(Comp)),
  );

const frames = new Map<string, { name: string; t: number; html: string }[]>();

console.log('\n[① 모든 국면에서 렌더된다]');
for (const s of SCENES) {
  const shots: { name: string; t: number; html: string }[] = [];
  let ok = true;
  let err = '';
  for (const t of s.times) {
    try {
      shots.push({ name: s.name, t, html: render(s.Comp, t) });
    } catch (e) { ok = false; err = String(e); break; }
  }
  frames.set(s.id, shots);
  check(`${s.name} — ${s.times.length}개 국면`, ok, err);
}

const all = [...frames.values()].flat();
const htmlOf = (id: string) => (frames.get(id) ?? []).map((f) => f.html).join('\n');

console.log('\n[② 창이 캔버스를 넘지 않는다]');
{
  // AppWindow 루트만 `border-radius:14px` 를 쓴다 — 그 박스의 절대 좌표를 읽는다.
  let boxes = 0;
  const bad: string[] = [];
  for (const f of all) {
    for (const m of f.html.matchAll(
      /style="position:absolute;border-radius:14px;[^"]*?left:(-?[\d.]+)px;top:(-?[\d.]+)px;width:([\d.]+)px;height:([\d.]+)px/g,
    )) {
      boxes++;
      const [x, y, w, hh] = m.slice(1).map(Number);
      if (x < 0 || y < 0 || x + w > STAGE_W || y + hh > STAGE_H) {
        bad.push(`${f.name} t=${f.t}: ${x},${y} ${w}×${hh}`);
      }
    }
  }
  check(`창 박스를 ${boxes}개 찾았다`, boxes >= all.length, `${boxes}개`);
  check('모든 창이 960×540 캔버스 안에 있다', bad.length === 0, bad.slice(0, 3).join(' / '));
}

console.log('\n[③ 포인터가 무대 안에 있다]');
{
  const bad: string[] = [];
  let pts = 0;
  for (const f of all) {
    for (const m of f.html.matchAll(/left:(-?[\d.]+)%;top:(-?[\d.]+)%/g)) {
      pts++;
      const [x, y] = m.slice(1).map(Number);
      if (x < 0 || x > 100 || y < 0 || y > 100) bad.push(`${f.name} t=${f.t}: ${x}%,${y}%`);
    }
  }
  check(`% 좌표를 ${pts}개 찾았다`, pts > 0);
  check('전부 0~100% 안에 있다', bad.length === 0, bad.slice(0, 3).join(' / '));
}

console.log('\n[④ 목업 라벨이 앱의 단일 출처와 같다]');
{
  // 영역 그룹 — activityLabels 가 정본
  check('자율·진로 라벨', AREA.autonomy_career.label === getAreaGroupLabel('autonomy_career'),
    `${AREA.autonomy_career.label} vs ${getAreaGroupLabel('autonomy_career')}`);
  check('동아리 라벨', AREA.club.label === getAreaGroupLabel('club'));
  check('봉사 라벨', AREA.service.label === getAreaGroupLabel('service'));

  // 세그먼트 — ActivitiesHeader 의 `ScopeButton` 문구가 정본.
  // 두 번째 칸만 역할에 따라 갈리므로(교사=내 담당 / 학생=내 활동) 페이지에서 확인한다.
  const header = readFileSync(resolve(SRC, 'features/creative-activities/components/ActivitiesHeader.tsx'), 'utf-8');
  const page = readFileSync(resolve(SRC, 'features/creative-activities/CreativeActivitiesPage.tsx'), 'utf-8');
  for (const label of ['전체', '제안함', '탐구 탐색']) {
    check(`세그먼트 “${label}” 이 실제 헤더에 있다`,
      SCOPES.includes(label) && header.includes(label));
  }
  check('두 번째 칸은 역할에 따라 내 담당 / 내 활동', SCOPES[1] === '내 담당'
    && page.includes("access.isStudent ? '내 활동' : '내 담당'"));
  check('세그먼트가 4칸이다', SCOPES.length === 4, SCOPES.join('/'));

  // 분야 미지정 — categories 가 정본이고, 타일 색도 같은 함수에서 나와야 한다
  const findHtml = htmlOf('find');
  check(`“${UNCATEGORIZED_LABEL}” 타일이 그려진다`, findHtml.includes(UNCATEGORIZED_LABEL));
  check('분야 미지정 타일이 중립색(getCategoryTone)을 쓴다',
    findHtml.includes(getCategoryTone(UNCATEGORIZED).bg));
  check('분야 타일 색이 실제 함수와 같다(생명과학)',
    findHtml.includes(getCategoryTone('생명과학').bg));

  // 탐구 수준 — inquiryLabels 가 정본
  const graphHtml = htmlOf('graph') + htmlOf('seed');
  for (const lv of [1, 2, 4] as const) {
    check(`L${lv} ${LEVEL_LABEL[lv]} 배지 문구`, graphHtml.includes(`L${lv} ${LEVEL_LABEL[lv]}`));
  }

  // 깊이 판정 문구 — 짧은 기록에는 비율 대신 "알 수 없다"를 적는 것이 이 화면의 규약
  const shortText = depthLabel({ L3: 0, L4: 0 }, 10, 1.8).text;
  const deepText = depthLabel({ L3: 3, L4: 4 }, 20, 4.2).text;
  const themesHtml = htmlOf('themes') + htmlOf('graph');
  check(`짧은 기록 문구 “${shortText}”`, themesHtml.includes(shortText));
  check(`심화 비율 문구 형식(${deepText})`, /심화 \d+%/.test(themesHtml));
  check('심화 칩 옆에 활동당 문장 수를 함께 낸다', /기록 \d+\.\d문장/.test(themesHtml));
}

console.log('\n[⑤ 진입점 — 사용 방법은 액션 묶음의 맨 왼쪽]');
{
  const header = readFileSync(resolve(SRC, 'features/creative-activities/components/ActivitiesHeader.tsx'), 'utf-8');
  const iHelp = header.indexOf('HelpCircle className');
  const iCreate = header.indexOf('aria-label="활동 기록"');
  const iPropose = header.indexOf('aria-label="활동 제안하기"');
  check('사용 방법 버튼이 있다', iHelp > 0);
  check('활동 기록보다 앞에 온다', iHelp > 0 && iHelp < iCreate);
  check('제안하기보다 앞에 온다', iHelp > 0 && iHelp < iPropose);
  // 제안함·탐구 탐색에서도 사라지면 안 된다 — 액션 묶음 안이되 세그먼트 조건 **밖**이어야 한다
  const iCluster = header.indexOf('<div className="flex shrink-0 items-center gap-1.5">');
  const iGuard = header.indexOf("scope !== 'proposals'", iCluster);
  check('액션 묶음 안에 있다', iCluster > 0 && iCluster < iHelp, `cluster=${iCluster} help=${iHelp}`);
  check('세그먼트 조건 밖에 있다(제안함·탐구 탐색에서도 보인다)',
    iGuard > 0 && iHelp < iGuard, `help=${iHelp} guard=${iGuard}`);

  const pageSrc = readFileSync(resolve(SRC, 'features/creative-activities/CreativeActivitiesPage.tsx'), 'utf-8');
  check('페이지가 안내 모달을 단다', pageSrc.includes('<ActivitiesGuideDialog'));
  check('지금 보고 있는 세그먼트의 안내를 연다', /<ActivitiesGuideDialog tab={scope}/.test(pageSrc));
}

console.log('\n[⑥ 씬이 같은 세그먼트 줄을 이고 있다]');
{
  // 자기가 앱의 어느 자리에 있는지 잃지 않게 — 세 안내의 씬이 모두 같은 줄을 그린다.
  for (const id of ['find', 'record', 'propose', 'review', 'accept', 'themes']) {
    const html = htmlOf(id);
    check(`${id} 씬에 세그먼트 줄이 있다`, SCOPES.every((s) => html.includes(s)));
  }
}


console.log('\n[⑦ 씨앗 목업이 `themeToSeed` 가 실제로 쓰는 문구다]');
{
  // 이 검사가 있는 이유: 목업 문구는 **렌더가 성공하는 채로** 실제와 어긋난다.
  // 실제로 한 번 어긋나 있었다 — 씬은 "생기부 기록에서 확인된 주제입니다"였는데
  // `themeToSeed` 는 "생기부에서 이 주제로 이뤄진 탐구 N건을 묶은 것입니다" 를 낸다.
  // 헤더 주석에 근거를 적어 두는 것만으로는 막지 못했다(그 인용이 정책만 덮고 있었다).
  const theme: InquiryLeafTheme = {
    id: 't', name: '미생물 배양과 배지', size: 86, graded: 86,
    levelDist: {}, meanSentences: 4.2, parentId: null as unknown as string, report: null,
  };
  const act: InquiryActivity = {
    id: 'a', area: 'club', subject_name: null, grade: 2, academic_year: 2026,
    title: '배지 조성 비교 실험', concepts: [], n_sentences: 6, club_name: null, hours: null,
    level: 4, strength: null, breadth: null, research_question: null,
    method_types: ['실험', '관찰'], output_types: [], career_fields: [], extension_hint: null,
    is_mine: false,
  };
  const [head, methodLine] = themeToSeed(theme, [act]).content.split('\n');
  const html = htmlOf('seed');

  check('머리 문장이 실제 씨앗과 같다', html.includes(head), head);
  // 라벨만 보면 값이 지어낸 것이어도 통과한다 → 줄 전체를 대조한다.
  // (값만 `html.includes` 로 따로 보면 왼쪽 창의 「배지 조성 비교 실험」·「세균 관찰」에
  //  같은 글자가 있어 **깨진 목업에서도 초록이 된다** — 실제로 그랬다.)
  check('방법 줄이 실제 씨앗과 같다(라벨·값 모두)', html.includes(methodLine), methodLine);
  check('주제 건수가 왼쪽 창과 같다(86)', head.includes('86건') && html.includes('기록 86건'));
  check('지어낸 옛 문구가 남아 있지 않다',
    !html.includes('생기부 기록에서 확인된 주제') && !html.includes('대조군 설정'));
}

/* ── 미리보기 HTML(선택) ─────────────────────────────────────────────────── */
if (process.env.PREVIEW) {
  const TOKENS = [
    '--bg:#ffffff', '--fg:#0f172a', '--fg-muted:#64748b', '--fg-faint:#94a3b8',
    '--hair:#e2e8f0', '--hair-2:#f1f5f9', '--primary:#4f46e5', '--accent-ink:#ffffff',
    '--shadow:0 18px 40px -18px rgba(15,23,42,.35)', '--glow:0 0 0 4px rgba(79,70,229,.18)',
    '--font-mono:ui-monospace,Menlo,Consolas,monospace',
  ].join(';');
  const out = resolve(HERE, '.preview');
  mkdirSync(out, { recursive: true });
  const body = all
    .map((f) => `<figure><figcaption>${f.name} — t=${f.t}s</figcaption>
<div class="stage" style="${TOKENS}">${f.html}</div></figure>`)
    .join('\n');
  writeFileSync(resolve(out, 'scenes.html'),
    `<!doctype html><meta charset="utf-8"><title>창체 안내 씬</title><style>
 body{margin:0;background:#eef1f5;font-family:'Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif}
 figure{margin:0 0 16px}
 figcaption{font:600 13px/1.7 system-ui;padding:5px 10px;color:#334155}
 .stage{position:relative;width:${STAGE_W}px;height:${STAGE_H}px;background:#fff;overflow:hidden;
        box-shadow:0 1px 3px rgba(0,0,0,.16)}
 .stage>div{position:relative;width:100%;height:100%}
</style>${body}`, 'utf-8');
  console.log(`\n미리보기: ${resolve(out, 'scenes.html')} (${all.length} 프레임)`);
}

console.log(`\n${pass}건 통과${fail ? ` · ${fail}건 실패` : ''}`);
if (fail) process.exit(1);
