// @rhwp/core WASM을 호스트에서 직접 구동(읽기 전용 렌더·기하 계산 전용).
// Studio iframe(편집)과 독립 — 스펙 오버레이 뷰의 기반. 근거 실측: scripts/rhwp-spec-research/.
// 주의: public/rhwp-studio의 루트 rhwp.js는 번들 wasm과 빌드가 달라 사용 금지(연구 문서 §2.1).

import wasmUrl from '@rhwp/core/rhwp_bg.wasm?url';
import type { FieldLocation, PageLayouts } from '@/features/task-workflow/document/spec/overlayMap';

// 딥 임포트 타입 선언이 없어 최소 표면만 정의
export interface CoreModule {
  default: (opts: { module_or_path: string }) => Promise<unknown>;
  HwpDocument: new (bytes: Uint8Array) => CoreDocRaw;
}
export interface CoreDocRaw {
  pageCount(): number;
  renderPageSvg(page: number): string;
  getPageControlLayout(page: number): string;
  getPageTextLayout(page: number): string;
  getFieldList(): string;
  exportHwpx(): Uint8Array;
  /** 빈/미계산 lineseg 문단을 재계산(#177). 반환 = 재계산된 문단 수 */
  reflowLinesegs(): number;
  /**
   * 표 셀에 그림을 삽입한다(결재란 서명 날인용).
   * options: `{sectionIdx, paraIdx, charOffset, cellPath, width, height,
   *            naturalWidthPx, naturalHeightPx, extension, description}`
   * `cellPath` = `[{"controlIndex":0,"cellIndex":6,"cellParaIndex":0}]` 형태의 JSON 문자열.
   */
  insertPictureEx(optionsJson: string, imageData: Uint8Array): string;
  free(): void;
}

/** zip(HWPX) 시그니처 검사 — 아니면 .hwp(CFB) 등으로 간주 */
export async function isHwpxZip(source: Blob | ArrayBuffer | Uint8Array): Promise<boolean> {
  const head = source instanceof Blob
    ? new Uint8Array(await source.slice(0, 2).arrayBuffer())
    : new Uint8Array(source instanceof Uint8Array ? source.slice(0, 2) : source.slice(0, 2));
  return head[0] === 0x50 && head[1] === 0x4b; // 'PK'
}

/**
 * .hwp(바이너리) → HWPX 바이트 정규화. 스펙 파이프라인(detect·fill·저장)은 HWPX XML
 * 기반이므로 양식 작업은 항상 이 정규화를 거친다(렌더·레이아웃·locator 좌표 일관성 보장).
 */
export async function convertToHwpxBytes(source: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const mod = await coreModule();
  const bytes = source instanceof Blob
    ? new Uint8Array(await source.arrayBuffer())
    : source instanceof Uint8Array ? source : new Uint8Array(source);
  const doc = new mod.HwpDocument(bytes);
  try {
    return doc.exportHwpx();
  } finally {
    doc.free();
  }
}

/**
 * 채움 결과 HWPX의 줄 레이아웃 캐시(`<hp:linesegarray>`) 재계산.
 *
 * 스펙 엔진은 텍스트를 바꾼 문단의 캐시를 지운다(옛 줄 폭에 새 텍스트를 밀어넣으면
 * 글자가 칸을 넘어 이상하게 보이므로 — 실측 986px vs 정상 718px). 지운 캐시는 한컴이
 * 열 때 다시 계산하지만, rhwp Studio는 열자마자 "HWPX 비표준 감지"를 띄운다.
 * 여기서 core의 `reflowLinesegs()`(Studio [자동 보정]과 같은 경로)를 미리 돌려
 * 유효한 캐시가 든 문서를 넘긴다 — 실측: 경고 44건 → 0건.
 *
 * 실패는 무해하게 통과시킨다(정규화는 품질 개선이지 생성 조건이 아님).
 */
export async function normalizeHwpxLayout(source: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const bytes = source instanceof Blob
    ? new Uint8Array(await source.arrayBuffer())
    : source instanceof Uint8Array ? source : new Uint8Array(source);
  try {
    const mod = await coreModule();
    const doc = new mod.HwpDocument(bytes);
    try {
      // 고칠 것이 없으면 원본 그대로 — 불필요한 재직렬화를 피한다(최소 변경 원칙)
      if (doc.reflowLinesegs() <= 0) return bytes;
      const out = doc.exportHwpx();
      // 파국적 손실 방어. 정상 라운드트립은 크기가 거의 같거나 커진다(실측 66.5KB → 68.4KB)
      return out.length >= bytes.length * 0.5 ? out : bytes;
    } finally {
      doc.free();
    }
  } catch {
    return bytes;
  }
}

let modPromise: Promise<CoreModule> | null = null;

/**
 * WASM 모듈 싱글턴. 초기화(`default({module_or_path})`)는 한 번만 돌아야 하므로
 * core를 쓰는 모듈은 각자 import하지 말고 반드시 이 함수를 거친다.
 */
export async function loadCoreModule(): Promise<CoreModule> {
  return coreModule();
}

async function coreModule(): Promise<CoreModule> {
  if (!modPromise) {
    modPromise = (async () => {
      const mod = (await import(/* @vite-ignore */ '@rhwp/core/rhwp.js')) as unknown as CoreModule;
      await mod.default({ module_or_path: wasmUrl });
      return mod;
    })();
  }
  return modPromise;
}

export interface CoreDocument {
  pageCount: number;
  renderPageSvg: (page: number) => string;
  pageLayouts: (page: number) => PageLayouts;
  fieldList: () => FieldLocation[];
  dispose: () => void;
}

export async function loadCoreDocument(source: Blob | ArrayBuffer | Uint8Array): Promise<CoreDocument> {
  const mod = await coreModule();
  const bytes =
    source instanceof Blob
      ? new Uint8Array(await source.arrayBuffer())
      : source instanceof Uint8Array
        ? source
        : new Uint8Array(source);
  const doc = new mod.HwpDocument(bytes);
  let disposed = false;
  return {
    pageCount: doc.pageCount(),
    renderPageSvg: (p) => doc.renderPageSvg(p),
    pageLayouts: (p) => ({
      controls: (JSON.parse(doc.getPageControlLayout(p)) as { controls?: PageLayouts['controls'] }).controls ?? [],
      runs: (JSON.parse(doc.getPageTextLayout(p)) as { runs?: PageLayouts['runs'] }).runs ?? [],
    }),
    fieldList: () => {
      try {
        return JSON.parse(doc.getFieldList()) as FieldLocation[];
      } catch {
        return [];
      }
    },
    dispose: () => {
      if (!disposed) {
        disposed = true;
        doc.free();
      }
    },
  };
}
