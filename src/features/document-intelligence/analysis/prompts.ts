import type { DocumentChunk, ParsedSchoolDocument } from '../types';

// 0.3.0 (2026-09-23): evidence.blockId 표기 규칙을 명시. 모델이 `[block:p1 p.1]` 을
// 통째로 옮겨 적어 근거 연결이 전부 깨지던 것을 막는다(읽는 쪽 정규화는
// `validateAnalysis.resolveBlockId` 가 별도로 맡는다 — 프롬프트만으로는 보장이 안 된다).
export const DOCUMENT_ANALYSIS_PROMPT_VERSION = 'school-document-analysis/0.3.0';

export function buildDocumentAnalysisSystemPrompt(): string {
  return `당신은 한국 학교 행정 문서를 실행 가능한 정보로 구조화하는 분석가다.

문서를 단순 요약하지 말고 행사(work), 업무(task), 제출 요구(submission), 승인·심의(approval), 제약·금지(constraint), 참고 정보(information)를 찾아라.

규칙:
1. 한 문서에서 후보를 여러 개 추출할 수 있다.
2. 모든 후보에는 입력에 표시된 block ID를 사용하는 evidence가 하나 이상 있어야 한다. evidence.blockId에는 대괄호 표시에서 "block:" 바로 뒤의 식별자만 적어라 (예: [block:txt-00012 p.3] -> txt-00012). 대괄호, "block:" 접두사, 쪽 표시를 함께 적지 마라.
3. 원문에 없는 담당자, 날짜, 장소, 산출물을 만들지 마라.
4. 예시와 실제 의무를 구분하라. 필수/의무는 required, 권장은 recommended, 선택은 optional, 금지는 prohibited, 단순 안내는 informational, 불명확하면 unknown이다.
5. '3월 중', '7월 말', '학기당 1회', '추후 안내'를 임의의 날짜로 확정하지 마라. raw를 보존하고 정밀도를 표시하라.
6. 일정표의 한 행에 여러 활동이 있으면 의미상 독립된 후보로 분리하라.
7. 같은 내용이 반복되면 후보를 중복 생성하지 말고 evidence만 여러 개 연결하라.
8. 문서 작성 지시와 실제 운영 의무를 구분하라.
9. 응답은 JSON 객체 하나만 출력하고 코드펜스를 사용하지 마라.

출력 스키마:
{
  "schemaVersion": "1.0",
  "documentTitle": string,
  "documentType": string,
  "issuingOrganization": string|null,
  "summary": string,
  "candidates": [{
    "localId": string,
    "type": "event"|"task"|"submission"|"approval"|"constraint"|"information",
    "title": string,
    "description": string,
    "actors": string[],
    "audiences": string[],
    "deliverables": string[],
    "location": string|null,
    "dates": [{
      "raw": string,
      "start": string|null,
      "end": string|null,
      "precision": "exact"|"day"|"month"|"month_end"|"range"|"recurring"|"unknown",
      "isConfirmed": boolean,
      "recurrence": string|null,
      "inferredYear": boolean
    }],
    "obligation": "required"|"recommended"|"optional"|"prohibited"|"informational"|"unknown",
    "conditions": string[],
    "confidence": number,
    "evidence": [{"blockId": string,"quote": string,"page": number|null,"path": string|null}]
  }],
  "unresolvedQuestions": string[],
  "warnings": string[]
}`;
}

export function buildDocumentAnalysisUserPrompt(
  document: ParsedSchoolDocument,
  chunks: DocumentChunk[]
): string {
  return [
    `파일명: ${document.fileName}`,
    `형식: ${document.format}`,
    `파서: ${document.parserVersion}`,
    document.title ? `파서 추정 제목: ${document.title}` : null,
    document.warnings.length ? `파싱 경고:\n- ${document.warnings.join('\n- ')}` : null,
    '',
    '다음은 구조 경계를 보존해 나눈 문서 내용이다. block ID는 근거 연결에 사용하라.',
    ...chunks.map((chunk) => [
      `\n## ${chunk.id}${chunk.titlePath.length ? ` / ${chunk.titlePath.join(' > ')}` : ''}`,
      chunk.text,
    ].join('\n')),
  ].filter((value): value is string => value !== null).join('\n');
}

export function buildDocumentChunkAnalysisUserPrompt(
  document: ParsedSchoolDocument,
  chunk: DocumentChunk,
  chunkIndex: number,
  totalChunks: number
): string {
  return [
    `파일명: ${document.fileName}`,
    `형식: ${document.format}`,
    `파서: ${document.parserVersion}`,
    document.title ? `파서 추정 제목: ${document.title}` : null,
    `전체 문서 중 청크: ${chunkIndex + 1}/${totalChunks}`,
    chunk.titlePath.length ? `현재 절 경로: ${chunk.titlePath.join(' > ')}` : null,
    '',
    '이 입력은 긴 문서의 일부다. 현재 청크에 직접 근거가 있는 후보만 추출하고, 다른 청크의 내용을 추측하지 마라.',
    'documentTitle·documentType·issuingOrganization·summary는 현재 청크에서 판단 가능한 범위로 작성하라.',
    `후보 localId는 ${chunk.id}-1, ${chunk.id}-2처럼 현재 청크 ID를 접두사로 사용하라.`,
    '',
    `## ${chunk.id}`,
    chunk.text,
  ].filter((value): value is string => value !== null).join('\n');
}
