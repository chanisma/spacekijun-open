import { createContext, useContext } from 'react';
import bookCss from './book.module.css';
import dormCss from './dormitory.module.css';

/**
 * 플래너 테마 — «기능 한 벌, 그림 두 벌» (2026-10-03 사용자 요청 «spacekijun 의 플래너를 academy 기능에 맞춰»).
 *
 * 이번 주·하루·월별 일정·목표 쪽(Book*)과 그 부품(InkLine·DayTimeline·usePlanDrag)은 아카데미 «별빛 플래너» 와
 * 일반 플래너(`/planner`)가 **같은 컴포넌트**를 쓴다. 갈리는 것은 그림(CSS 모듈)과 몇 마디 말투뿐이라
 * 둘을 이 컨텍스트로 넘긴다 — 컴포넌트를 두 벌로 만들면 한쪽에만 고친 기능이 생겨 두 플래너가 다른 답을 낸다.
 *
 * 기본값은 아카데미(가죽 책 · 깃펜). 일반 플래너는 `src/features/planner/PlannerPage.tsx` 가 앱 테마를 넘긴다.
 * ⚠️ 새 클래스를 컴포넌트에 쓰면 **두 CSS 모듈 모두에** 적을 것 — 한쪽에 없으면 오류 없이 모양만 빠진다
 *    (회귀 `scripts/planner-test/theme-classes.test.ts` 가 두 모듈의 클래스 이름을 대조한다).
 */
export type PlannerCss = Readonly<Record<string, string>>;

/** 화면에 보이는 말 중 아카데미 세계관이 묻은 것만 — 기능을 말하는 문구(aria 이름 등)는 두 플래너가 같다. */
export interface PlannerWords {
  /** 쪽 머리의 작은 표지 글씨. */
  brand: string;
  /** 빈 줄에 바로 적는 칸의 안내. */
  write: string;
  /** «아래 ○○에 하나 적어 보세요» 의 ○○. */
  line: string;
  /** «목표 카드의 ○○ 여기로 와요» 의 ○○. */
  stamp: string;
  /** 목표 보관 단추의 이름. */
  archive: string;
  /** 목표 거르기의 «전부» 칩. */
  all: string;
}

export const ACADEMY_PLANNER_WORDS: PlannerWords = {
  brand: 'STARLIGHT PLANNER',
  write: '깃펜으로 적기…',
  line: '깃펜 줄',
  stamp: '인장을 찍으면',
  archive: '미완의 성도로 보관',
  all: '모든 별',
};

export interface PlannerFormCss { form: string; timeFields: string; pickTime: string; horizonPick: string; actions: string }

export interface PlannerTheme {
  css: PlannerCss;
  /** 자세히 적기 양식(`PlannerSheetForms`)의 클래스 — 아카데미는 기숙사 화면의 양식 모양을 그대로 쓴다. */
  formCss: PlannerFormCss;
  words: PlannerWords;
}

const PlannerThemeContext = createContext<PlannerTheme>({ css: bookCss, formCss: dormCss as unknown as PlannerFormCss, words: ACADEMY_PLANNER_WORDS });

export const PlannerThemeProvider = PlannerThemeContext.Provider;
export function usePlannerTheme() { return useContext(PlannerThemeContext); }
