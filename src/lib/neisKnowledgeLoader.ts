// ========================================
// NEIS 화면 지식 로더 — `neis-kb/` 의 파일을 필요할 때 하나씩 읽는다 (2026-10-05)
//
// 수집본은 화면당 한 파일이고 수백 개라 미리 다 읽지 않는다. Vite 의 지연 glob 은
// 파일마다 따로 청크를 만들어, 사람이 화면을 펼칠 때 그 화면 것만 내려받는다.
// 어떤 화면에 지식이 있는지는 작은 색인(`index.json`, check.mts 가 만든다)으로 먼저 안다.
//
// 경로 규칙은 `neisKbPath` 하나 — 수집기·검증기·여기가 모두 그것을 쓴다.
// ========================================

import {
  neisKbPath,
  parseNeisGuide,
  type NeisCapture,
  type NeisCaptureStatus,
  type NeisGuide,
} from './neisScreenModel';

const captureFiles = import.meta.glob('/neis-kb/captures/**/*.json', { import: 'default' });
const guideFiles = import.meta.glob('/neis-kb/guides/**/*.json', { import: 'default' });
const indexFiles = import.meta.glob('/neis-kb/index.json', { import: 'default' });

export interface NeisKnowledgeIndexEntry {
  /** 수집 상태 */
  s: NeisCaptureStatus;
  /** view 수 */
  v?: number;
  /** 구조 지문 */
  f?: string;
  /** 안내 출처 */
  g?: NeisGuide['source'];
  /** 수집일 */
  at?: string;
}
export type NeisKnowledgeIndex = Record<string, NeisKnowledgeIndexEntry>;

export async function loadNeisKnowledgeIndex(): Promise<NeisKnowledgeIndex> {
  const loader = indexFiles['/neis-kb/index.json'];
  return loader ? ((await loader()) as NeisKnowledgeIndex) : {};
}

export async function loadNeisCapture(key: string): Promise<NeisCapture | null> {
  const loader = captureFiles[`/neis-kb/captures/${neisKbPath(key)}.json`];
  return loader ? ((await loader()) as NeisCapture) : null;
}

export async function loadNeisGuide(key: string): Promise<NeisGuide | null> {
  const loader = guideFiles[`/neis-kb/guides/${neisKbPath(key)}.json`];
  return loader ? parseNeisGuide(await loader()) : null;
}
