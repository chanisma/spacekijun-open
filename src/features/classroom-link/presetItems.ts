/**
 * 교실 기기 QR 세팅 — 프리셋 항목의 규칙 (2026-10-13). 상세 docs/features/classroom-link.md
 *
 * 서버 CHECK(`classroom_preset_items_valid`)와 교실 프로그램(NEIS_helper `app/core/classroom_setup.py`)이
 * 같은 규칙을 따로 들고 있다. 한쪽만 바꾸면 저장은 되는데 교실에서 안 열리거나, 화면은 허락하는데
 * 저장이 거부된다. 바꿀 때 셋을 같이 바꿀 것.
 */

export type PresetItem =
  | { kind: 'drive'; id: string; name: string; mimeType?: string }
  /** app: 구글 앱이면 그 키(GOOGLE_APPS) — 교실 독이 구글 아이콘으로 그린다. 저장·검사는 웹사이트와 같다 */
  | { kind: 'url'; url: string; name: string; app?: string; site?: string }
  | { kind: 'program'; program: string; name: string }
  | { kind: 'space'; path: string; name: string };

export interface ClassroomPreset {
  id: string;
  title: string;
  section_name: string | null;
  items: PresetItem[];
  auto_end_minutes: number;
  sort_order: number;
  last_used_at: string | null;
  updated_at: string;
}

export type PresetDraft = Pick<ClassroomPreset, 'title' | 'section_name' | 'items' | 'auto_end_minutes'>;

export const MAX_ITEMS = 30;
export const AUTO_END_CHOICES = [45, 50, 60, 90, 120, 180];

/**
 * 교실 기기가 아는 프로그램. 서버에는 «이름»만 두고 실행 파일 경로는 기기가 찾는다 —
 * 교사 계정 하나가 털려도 교실 PC 에서 아무 프로그램이나 돌리지 못하게.
 * 목록 밖 이름은 그 기기의 관리자가 기기 설정에 등록한 프로그램이어야 열린다.
 */
export const CLASSROOM_PROGRAMS: { key: string; label: string }[] = [
  { key: 'powerpoint', label: 'PowerPoint' },
  { key: 'hwp', label: '한글' },
  { key: 'word', label: 'Word' },
  { key: 'excel', label: 'Excel' },
  { key: 'whiteboard', label: 'Microsoft Whiteboard' },
  { key: 'notepad', label: '메모장' },
  { key: 'paint', label: '그림판' },
  { key: 'calculator', label: '계산기' },
  { key: 'snipping', label: '캡처 도구' },
  { key: 'osk', label: '화상 키보드' },
];

/**
 * 구글 앱 — 교실 독에 따로 놓는 구글 기능(2026-10-14 요청). 교실 PC 의 수업용 Edge(구글 로그인 보관 A+)에서 열린다.
 * 항목은 웹사이트(kind 'url')로 저장하고 `app` 으로 표시만 바꾼다 — 서버 CHECK 를 늘리지 않는다.
 * 🚨 키는 교실 프로그램(NEIS_helper core/classroom_setup.py GOOGLE_APPS)과 같아야 한다.
 */
export const GOOGLE_APPS: { key: string; label: string; url: string }[] = [
  { key: 'classroom', label: '클래스룸', url: 'https://classroom.google.com/' },
  { key: 'drive', label: '드라이브(웹)', url: 'https://drive.google.com/' },
  { key: 'docs', label: '문서', url: 'https://docs.google.com/document/' },
  { key: 'sheets', label: '시트', url: 'https://docs.google.com/spreadsheets/' },
  { key: 'slides', label: '슬라이드', url: 'https://docs.google.com/presentation/' },
  { key: 'forms', label: '설문지', url: 'https://docs.google.com/forms/' },
  { key: 'calendar', label: '캘린더', url: 'https://calendar.google.com/' },
  { key: 'meet', label: 'Meet', url: 'https://meet.google.com/' },
  { key: 'gmail', label: 'Gmail', url: 'https://mail.google.com/' },
  { key: 'keep', label: 'Keep', url: 'https://keep.google.com/' },
  { key: 'sites', label: '사이트', url: 'https://sites.google.com/' },
  { key: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/' },
];

/**
 * 웹사이트 탭에 늘 보이는 수업용 사이트(2026-10-14 요청) — 누르면 바로 넣는다. 아이콘은 사이트에서 받아 둔 것
 * (public/classroom-icons/sites/<key>.png · 교실 프로그램 web/icons/sites 에도 같은 그림). 항목에 site 키가 붙는다.
 * 저장은 보통 웹사이트 항목과 같다(kind 'url'). 목록 밖 사이트는 주소를 넣는다.
 */
export const SUGGESTED_SITES: { key: string; url: string; name: string }[] = [
  { key: 'padlet', url: 'https://padlet.com/', name: '패들렛' },
  { key: 'chatgpt', url: 'https://chatgpt.com/', name: 'ChatGPT' },
  { key: 'gemini', url: 'https://gemini.google.com/', name: 'Gemini' },
  { key: 'claude', url: 'https://claude.ai/', name: 'Claude' },
  { key: 'canva', url: 'https://www.canva.com/', name: '캔바' },
  { key: 'miricanvas', url: 'https://www.miricanvas.com/', name: '미리캔버스' },
  { key: 'tkbell', url: 'https://www.tkbell.co.kr/', name: '띵커벨' },
  { key: 'kahoot', url: 'https://kahoot.it/', name: '카훗' },
  { key: 'classcard', url: 'https://www.classcard.net/', name: '클래스카드' },
  { key: 'mentimeter', url: 'https://www.menti.com/', name: '멘티미터' },
  { key: 'quizizz', url: 'https://quizizz.com/', name: '퀴즈즈' },
  { key: 'riroschool', url: 'https://kijun.riroschool.kr/', name: '리로스쿨' },
  { key: 'jinnote', url: 'https://jinheewhite.github.io/note/', name: '판서노트' },   // 전자칠판용 PDF 필기(2026-10-15 요청)
];

/** 교실 기기에서 «선생님 계정으로 로그인된 채» 여는 스페이스기전 화면 */
export const SPACE_PAGES: { path: string; label: string }[] = [
  { path: '/', label: '홈' },
  { path: '/timetable', label: '시간표' },
  { path: '/seat-arrangement', label: '자리 배치' },
  { path: '/homeroom-attendance', label: '담임 출결' },
  { path: '/collab', label: '협업보드' },
  { path: '/student-collab', label: '학생 협업보드' },
  { path: '/code-share', label: '코드 공유' },
  { path: '/schedule', label: '일정' },
  { path: '/videos', label: '영상' },
  { path: '/toolbox', label: '툴박스' },
];

const DRIVE_ID = /^[A-Za-z0-9_-]{10,128}$/;
const PROGRAM_KEY = /^[a-z0-9_-]{1,40}$/;
const SPACE_PATH = /^\/[A-Za-z0-9/_?=&.-]{0,200}$/;

export function normalizeUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const href = url.href;
    return /\s/.test(href) || href.length > 2000 ? null : href;
  } catch {
    return null;
  }
}

/** 한 항목이 서버 CHECK 를 통과하는 모양인가 */
export function isValidItem(item: PresetItem): boolean {
  if ((item.name ?? '').length > 120) return false;
  switch (item.kind) {
    case 'drive': return DRIVE_ID.test(item.id);
    case 'url': return /^https?:\/\/\S{1,2000}$/.test(item.url);
    case 'program': return PROGRAM_KEY.test(item.program);
    case 'space': return SPACE_PATH.test(item.path);
    default: return false;
  }
}

export function itemLabel(item: PresetItem): string {
  if (item.name) return item.name;
  switch (item.kind) {
    case 'drive': return '드라이브 파일';
    case 'url': return item.url;
    case 'program': return CLASSROOM_PROGRAMS.find((p) => p.key === item.program)?.label ?? item.program;
    case 'space': return SPACE_PAGES.find((p) => p.path === item.path)?.label ?? item.path;
  }
}

export const ITEM_KIND_LABEL: Record<PresetItem['kind'], string> = {
  drive: '드라이브',
  url: '웹사이트',
  program: '프로그램',
  space: '스페이스기전',
};

/** 목록에 보일 종류 이름 — 구글 앱은 «구글» */
export function kindLabel(item: PresetItem): string {
  return item.kind === 'url' && item.app ? '구글' : ITEM_KIND_LABEL[item.kind];
}

export function needsDrive(items: PresetItem[]): boolean {
  return items.some((item) => item.kind === 'drive');
}

/** 저장 전 검사 — 오류 문구(없으면 null) */
export function validateDraft(draft: PresetDraft): string | null {
  if (!draft.title.trim()) return '이름을 입력해 주세요.';
  if (draft.title.trim().length > 60) return '이름은 60자까지입니다.';
  // 항목이 없어도 된다 — 교실 독에는 «구글»·«내 드라이브»가 늘 놓인다(2026-10-14 요청)
  if (draft.items.length > MAX_ITEMS) return `항목은 ${MAX_ITEMS}개까지입니다.`;
  const bad = draft.items.find((item) => !isValidItem(item));
  if (bad) return `«${itemLabel(bad)}» 항목의 주소나 이름이 올바르지 않습니다.`;
  if (draft.auto_end_minutes < 10 || draft.auto_end_minutes > 240) return '자동 종료는 10~240분입니다.';
  return null;
}

/**
 * QR 을 찍었을 때 위에 올릴 프리셋 순서: 지금 수업(시간표)과 같은 반 → 최근에 쓴 것 → 정렬 순서.
 * 지금 수업과 맞는 것이 하나뿐이면 그것을 미리 골라 둔다(추측해 바로 펼치지는 않는다).
 */
export function orderPresets(presets: ClassroomPreset[], currentSection: string | null): ClassroomPreset[] {
  const used = (p: ClassroomPreset) => (p.last_used_at ? Date.parse(p.last_used_at) : 0);
  return [...presets].sort((a, b) => {
    const am = currentSection && a.section_name === currentSection ? 1 : 0;
    const bm = currentSection && b.section_name === currentSection ? 1 : 0;
    if (am !== bm) return bm - am;
    if (used(a) !== used(b)) return used(b) - used(a);
    return a.sort_order - b.sort_order;
  });
}

export function suggestedPresetId(presets: ClassroomPreset[], currentSection: string | null): string | null {
  if (presets.length === 1) return presets[0].id;
  if (!currentSection) return null;
  const matches = presets.filter((p) => p.section_name === currentSection);
  return matches.length === 1 ? matches[0].id : null;
}
