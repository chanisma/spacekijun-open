// 탐구 데이터 → 활동 기록 씨앗.
//
// ── 왜 대량 적재가 아닌가 ──────────────────────────────────────────────────
// `activity` 는 **교사가 쓰는 운영 기록**이다 — 목적·내용·성과·장소·시수·예산·기간이 있어야
// 기록으로서 뜻이 있다. 파이프라인이 가진 것은 제목과 학생 수뿐이라, 289개를 그대로 밀어 넣으면
// **반쯤 빈 행 289개가 진짜 기록 사이에 섞인다.** 그러면 "활동 기록"이라는 표의 뜻이 흐려진다.
//
// 그래서 **폼을 미리 채워 여는 것**까지만 한다. 이미 있는 씨앗 경로(`ActivityFormDialog seed`)를
// 그대로 쓰므로 새 저장 경로도 만들지 않는다 — 교사가 보고 고친 뒤 저장하는 것이 이 표의 규약이다.
//
// ── 무엇을 채우고 무엇을 비우는가 ──────────────────────────────────────────
// 채운다: 이름 · 영역 · 진로 분야 · 키워드(개념) · 내용 초안.
// **비운다: 기간 · 장소 · 시수 · 예산** — 파이프라인은 모른다. 그럴듯한 값을 넣으면
// 교사가 확인하지 않고 지나칠 위험이 있고, 빈 칸은 "채워야 한다"고 스스로 말한다.
import type { ActivityDraftSeed } from '../components/ActivityDraftWidget';
import type { ActivityAreaGroup } from './activityLabels';
import type { InquiryActivity, InquiryLeafTheme } from '../types';

/** 창체 영역 → 활동 기록의 영역 묶음. 자율·진로는 한 묶음이다(`activityLabels`). */
function toAreaGroup(area: string | undefined): ActivityAreaGroup {
  if (area === 'club') return 'club';
  return 'autonomy_career';
}

export interface RecurringProgram {
  programId: string;
  years: number[];
  area: string;
  grade: number | null;
  token: string | null;
  title: string;
  students: number;
}

/**
 * 해마다 반복된 프로그램 → 씨앗.
 *
 * 이 15개가 `activity` 와 모양이 가장 가깝다 — **학교가 연 활동이고 참여자가 여럿**이다
 * (그래서 활동 유형으로 잡혔다). 개인 탐구는 이 표에 넣을 것이 아니다.
 */
export function programToSeed(p: RecurringProgram): ActivityDraftSeed {
  const years = p.years.join('·');
  return {
    name: p.title,
    areaGroup: toAreaGroup(p.area),
    keywords: p.token ? [p.token] : [],
    content:
      `생기부 기록에서 확인된 반복 운영 프로그램입니다.\n` +
      `· 운영 연도: ${years} (입학연도 기준)\n` +
      `· 참여 학생: ${p.students}명\n` +
      (p.grade != null ? `· 대상 학년: ${p.grade}학년\n` : '') +
      `\n※ 위는 지난 기록을 요약한 것입니다. 올해 운영 계획으로 고쳐 주세요.`,
  };
}

/**
 * 주제군 → 씨앗. "이 주제로 활동을 하나 열겠다" 는 자리다.
 *
 * 진로 분야·키워드는 **판정된 활동에서 실제로 나온 것**만 쓴다(보고서의 서술이 아니라).
 * 보고서 문장을 그대로 넣으면 교사가 쓰지 않은 말이 기록에 남는다.
 */
export function themeToSeed(theme: InquiryLeafTheme, activities: InquiryActivity[]): ActivityDraftSeed {
  const inq = activities.filter((a) => a.level != null && a.level > 0);
  const tally = (xs: string[][]) => {
    const m = new Map<string, number>();
    for (const arr of xs) for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  const fields = tally(inq.map((a) => a.career_fields)).slice(0, 3);
  const methods = tally(inq.map((a) => a.method_types)).slice(0, 4);
  const concepts = tally(activities.map((a) => a.concepts)).slice(0, 8);
  const areas = tally([activities.map((a) => a.area)]);

  const exemplars = [...inq]
    .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))
    .slice(0, 3)
    .map((a) => `· ${a.title}${a.research_question ? ` — ${a.research_question}` : ''}`);

  return {
    name: theme.name,
    areaGroup: toAreaGroup(areas[0]),
    careerFields: fields,
    keywords: concepts,
    content:
      `생기부에서 이 주제로 이뤄진 탐구 ${theme.size}건을 묶은 것입니다.\n` +
      (methods.length ? `· 주로 쓰인 방법: ${methods.join(', ')}\n` : '') +
      (exemplars.length ? `\n[깊이 있게 진행된 사례]\n${exemplars.join('\n')}\n` : '') +
      `\n※ 위는 지난 기록을 요약한 것입니다. 올해 운영 계획으로 고쳐 주세요.`,
  };
}

/**
 * 활동 하나 → 씨앗. "이 학생이 한 탐구를 학교 활동으로 열겠다" 는 자리다.
 *
 * **학생을 특정하는 것은 담지 않는다** — 씨앗은 뷰(`inquiry_activity_public`)에서 오므로
 * 애초에 `student_code` 가 없고, 제목·내용도 사람이 아니라 활동을 가리킨다.
 */
export function activityToSeed(a: InquiryActivity): ActivityDraftSeed {
  return {
    name: a.title,
    areaGroup: toAreaGroup(a.area),
    careerFields: a.career_fields.slice(0, 3),
    // 동아리명은 주최 후보다. 폼에서 기존 동아리와 대조하며 외부 업체명으로 쓰지 않는다.
    hostClubName: a.area === 'club' ? a.club_name?.trim() || undefined : undefined,
    keywords: a.concepts.slice(0, 8),
    // 생기부 서술(`did`)은 담지 않는다 — 원문에 가까워 화면에서 빼기로 한 값이라,
    // 활동 기록으로 우회해 내보내면 막은 뜻이 없어진다. 뷰도 그 값을 주지 않는다.
    content:
      (a.research_question ? `· 연구 질문: ${a.research_question}\n` : '') +
      (a.method_types.length ? `· 방법: ${a.method_types.join(', ')}\n` : '') +
      (a.output_types.length ? `· 산출물: ${a.output_types.join(', ')}\n` : '') +
      (a.concepts.length ? `· 다룬 개념: ${a.concepts.slice(0, 8).join(', ')}\n` : '') +
      (a.extension_hint ? `· 확장 가능성: ${a.extension_hint}\n` : '') +
      `\n※ 위는 지난 생기부 기록을 요약한 것입니다. 올해 운영 계획으로 고쳐 주세요.`,
  };
}
