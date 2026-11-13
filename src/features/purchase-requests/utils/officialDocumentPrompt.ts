/**
 * 공문 본문 AI 프롬프트 (순수 모듈 — 브라우저 의존 없음)
 *
 * **호출부(`officialDocumentAi.ts`)와 갈라 둔 이유**: 그쪽은 `aiChat()` → supabase 브라우저
 * 클라이언트를 물고 있어 Node 회귀 테스트가 import 하는 순간 `localStorage is not defined`
 * 로 죽는다. 프롬프트 문구는 회귀로 고정하고 싶은 값이라 이쪽에 둔다.
 *
 * **AI 가 쓰는 것은 본문뿐이다.** 제목·학교명·수신·경유·기안자·기안일·결재란·예산 과목은
 * 문서관리시스템(에듀파인)의 양식 필드라, 사용자에게 입력받지도 않고 AI 에게 쓰라고
 * 시키지도 않는다. 품목 표도 본문이 아니라 붙임으로 나간다.
 */
import {
  OfficialDocumentForm,
  OfficialDocumentItem,
  buildItemsTsv,
  formatOfficialAmount,
  summarizeDocumentItemNames,
  sumDocumentAmount,
  sumDocumentQty,
} from './officialDocument';

/**
 * 형식 규칙은 「행정업무운영 편람」의 항목 구분·금액 표기·끝 표시를 따른다.
 *
 * 이 프롬프트가 지키게 하는 것 중 **값 불변**이 가장 중요하다 — 예산 문서라
 * 모델이 금액을 반올림하거나 물품 요약을 제 맘대로 다시 쓰는 순간 결재가 반려되고,
 * 화면 미리보기와도 어긋난다. 그래서 완성된 값(구매 물품 문구·소요 예산)을 그대로
 * 넘기고 "그대로 옮긴다"를 반복해 못박는다.
 */
export const OFFICIAL_DOCUMENT_SYSTEM_PROMPT = `당신은 대한민국 고등학교에서 물품 구매 공문을 기안하는 담당 교사입니다.
주어진 자료로 **학교 공문의 본문만** 작성합니다.

[출력 범위 — 본문만]
- 본문만 출력한다. 첫 줄이 곧 본문 첫 항목("1. …")이다.
- 다음은 문서관리시스템이 채우는 자리이므로 **절대 쓰지 않는다**: 제목, 학교명, 수신, 경유, 발신, 기안자, 기안일, 결재란, 문서번호.
- 설명·머리말·요약을 앞뒤에 붙이지 않는다. 완성된 본문 텍스트만 출력한다.

[항목 구성]
1. 관련 근거가 주어졌을 때만 "1. 관련: ○○○" 으로 시작한다. 없으면 이 항목을 **아예 쓰지 않고** 요지 문장이 1번이 된다.
2. 이어지는 항목에 요지를 한 문장으로 쓴다.
   예: "○○○에 필요한 물품을 아래와 같이 구매하고자 하오니 검토하여 주시기 바랍니다."
3. 그 아래 하위 항목은 **다음 셋뿐이다. 더 만들지 않는다.**
   가. 구매 목적
   나. 구매 물품
   다. 소요 예산

[값을 바꾸지 않는다 — 가장 중요]
- "구매 물품" 값은 주어진 문구를 **글자 그대로** 옮긴다. 물품명을 바꾸거나, 빠뜨리거나, 새로 만들거나, "외 N개"를 다시 세지 않는다.
- "소요 예산" 값도 주어진 문구를 그대로 옮긴다. 숫자를 반올림하거나 한글 표기를 다시 쓰지 않는다.
- 자료에 없는 납품 기한, 업체명, 계약 방법, 예산 과목, 근거 문서를 임의로 만들지 않는다.
- 구매 목적이 비어 있으면 품목 구성에서 조심스럽게 유추하되 단정하지 않는다.

[본문에 표를 넣지 않는다]
- 품목 표(연번·규격·단가·수량·금액)는 본문에 쓰지 않는다. 붙임 문서로 따로 나간다.
- 품목 TSV 는 맥락 파악용으로만 준다. 표를 옮겨 적거나 항목을 늘리는 데 쓰지 않는다.

[끝 표시]
- 붙임이 주어지면 마지막 줄을 "붙임  ○○○  끝." 으로 쓴다(붙임과 내용 사이 두 칸, 내용과 끝 사이 두 칸).
- 붙임이 없으면 붙임 줄을 쓰지 않고, **본문 마지막 글자에서 두 칸 띄고 "끝."** 을 붙인다.

[형식]
- 항목 번호는 1. → 가. → 1) → 가) 순서로 쓰고, 부호와 내용 사이는 한 칸 띄운다.
- 하위 항목(가./나./다.)은 두 칸 들여쓴다.
- 금액은 아라비아 숫자와 한글을 병기한다. 예: 금 452,300원(금사십오만이천삼백원)
- 날짜를 쓸 일이 있으면 "2026. 9. 2." 형식으로 쓴다(마침표 뒤 한 칸, 끝에도 마침표).

[문체]
- 개조식으로 간결하게 쓴다. 한 항목은 한 문장을 넘기지 않는다.
- 경어는 "…하여 주시기 바랍니다" 정도로만 쓴다.
- 인사말·맺음말("항상 노고가 많으십니다", "감사합니다" 등)을 넣지 않는다.

[출력 형식]
- 마크다운을 쓰지 않는다(**, #, 목록 기호 금지). 평문으로만 출력한다.`;

export interface OfficialDocumentAiInput {
  form: OfficialDocumentForm;
  items: OfficialDocumentItem[];
  /** 사용자가 화면에서 보고 있는 현재 초안 — AI 는 이걸 고쳐 쓴다 */
  draft: string;
  /** 자유 지시 (예: "구매 목적을 더 구체적으로") */
  instruction?: string;
}

/**
 * 사용자 프롬프트.
 *
 * "구매 물품"·"소요 예산"은 **이미 완성된 문구**로 넘긴다 — 모델이 물품 수를 다시 세거나
 * 금액을 한글로 다시 옮기게 두면 그 자리에서 틀린다(예산 문서라 치명적).
 */
export function buildOfficialDocumentUserPrompt(input: OfficialDocumentAiInput): string {
  const { form, items, draft, instruction } = input;
  const attachment = form.attachment.trim();
  return [
    '## 작성 조건',
    form.basis.trim()
      ? `- 관련 근거: ${form.basis.trim()}`
      : '- 관련 근거: 없음 ("관련" 항목을 쓰지 마세요)',
    `- 구매 목적: ${form.purpose.trim() || '(미입력 — 품목 구성에서 유추하세요)'}`,
    `- 구매 물품(이 문구 그대로 쓰세요): ${summarizeDocumentItemNames(items) || '없음'}`,
    `- 소요 예산(이 문구 그대로 쓰세요): ${formatOfficialAmount(sumDocumentAmount(items))}`,
    attachment
      ? `- 붙임: ${attachment}`
      : '- 붙임: 없음 (붙임 줄을 쓰지 말고 본문 마지막에 "  끝."을 붙이세요)',
    '',
    `## 품목 상세 (맥락 참고용 · 총 ${items.length}종 ${sumDocumentQty(items).toLocaleString('ko-KR')}점)`,
    '아래 표는 붙임 문서로 따로 나갑니다. **본문에 옮겨 적지 마세요.**',
    buildItemsTsv(items, form),
    '',
    '## 현재 초안 (형식 참고용)',
    draft,
    '',
    '## 요청',
    instruction?.trim() || '위 초안을 학교 공문 형식에 맞게 다듬어 완성본을 출력하세요.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * 모델이 가끔 결과를 코드펜스로 감싼다. 공문은 평문이라 감싸개를 그대로 두면 안 된다.
 * (프롬프트로 금지해도 완전히는 안 지켜지므로 코드가 마지막에 한 번 더 벗긴다)
 */
export function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
  return match ? match[1] : trimmed;
}
