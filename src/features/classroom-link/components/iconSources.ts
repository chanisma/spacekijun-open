/** 세팅 항목의 실제 아이콘 출처와 글자 타일 색 — ItemIcon · PresetEditor 가 같이 쓴다(교실 독과 같은 값) */
const GOOGLE: Record<string, [string, string]> = {
  classroom: ['C', '#188038'], drive: ['D', '#1a73e8'], docs: ['문', '#4285f4'], sheets: ['시', '#0f9d58'],
  slides: ['슬', '#f4b400'], forms: ['설', '#7248b9'], calendar: ['31', '#1967d2'], meet: ['M', '#00897b'],
  gmail: ['M', '#ea4335'], keep: ['K', '#f6bf26'], sites: ['S', '#3f51b5'], youtube: ['▶', '#ff0000'],
};
const PROGRAM: Record<string, [string, string]> = {
  powerpoint: ['P', '#ea580c'], word: ['W', '#1d4ed8'], excel: ['X', '#15803d'], hwp: ['한', '#0284c7'],
  whiteboard: ['WB', '#0f766e'], notepad: ['메', '#475569'], paint: ['그', '#db2777'], calculator: ['계', '#1f2937'],
  snipping: ['캡', '#7e22ce'], osk: ['키', '#6b7280'],
};
/** public/classroom-icons/programs 에 그림이 있는 프로그램(이 저장소를 만든 PC 에 설치돼 있던 것) */
const PROGRAM_IMAGES = new Set(['powerpoint', 'word', 'excel', 'notepad', 'calculator', 'osk']);

export function googleLook(key: string): [string, string] {
  return GOOGLE[key] ?? ['G', '#5f6368'];
}
export function programLook(key: string): [string, string] {
  return PROGRAM[key] ?? ['앱', '#64748b'];
}
export const googleIconUrl = (key: string) => `/classroom-icons/google/${key}.png`;
/** 추천 사이트(SUGGESTED_SITES)에서 받아 둔 아이콘 */
export const siteIconUrl = (key: string) => `/classroom-icons/sites/${key}.png`;
export const programIconUrl = (key: string) => (PROGRAM_IMAGES.has(key) ? `/classroom-icons/programs/${key}.png` : null);
export const faviconUrl = (url: string) => {
  try {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=64`;
  } catch {
    return null;
  }
};
export const driveTypeIconUrl = (mime: string | undefined) =>
  `https://drive-thirdparty.googleusercontent.com/64/type/${mime || 'application/octet-stream'}`;
