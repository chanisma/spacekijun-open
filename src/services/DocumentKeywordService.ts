import { supabase } from '@/integrations/supabase/client';

export interface DocumentMeta {
  department?: string | null;
  source_type?: 'task' | 'event' | 'meeting';
  source_id?: string;
  uploaded_from?: string;
  event_name?: string;
  task_name?: string;
  meeting_name?: string;
  google_drive_id?: string;
  google_drive_edit_url?: string;
  is_google_drive_file?: boolean;
  is_pinned?: boolean;
  keywords?: string[];
  keywords_extracted_at?: string;
  keywords_model?: string;
}

/**
 * 문서 키워드 저장 (사람이 편집한 키워드).
 *
 * 2026-10-01: Gemini 로 파일을 읽어 키워드를 뽑던 자동 추출(`extractKeywords`·`extractKeywordsBatch`)은
 * 걷어냈다 — Gemini API 키가 만료돼 2026-04-09 이후 성공한 적이 없었고, 화면의 다른 Gemini 기능은
 * 이미 버튼이 내려가 있었다. 이미 저장된 키워드의 표시·편집·검색은 그대로다.
 * 다시 만든다면 공용 `aiChat()` 을 쓸 것(Solar 는 텍스트만 받으므로 파일 → 텍스트 단계가 필요하다).
 */
export class DocumentKeywordService {
  async updateKeywords(documentId: string, keywords: string[]): Promise<void> {
    try {
      // 기존 meta 데이터 조회
      const { data: document } = await supabase
        .from('documents')
        .select('meta')
        .eq('id', documentId)
        .single();

      const currentMeta = ((document as any)?.meta as DocumentMeta) || {};

      // meta에 키워드 정보 업데이트
      const updatedMeta: DocumentMeta = {
        ...currentMeta,
        keywords: keywords,
        keywords_extracted_at: currentMeta.keywords_extracted_at || new Date().toISOString(),
        keywords_model: currentMeta.keywords_model || 'manual',
      };

      // 업데이트
      const { error } = await (supabase as any)
        .from('documents')
        .update({ meta: updatedMeta })
        .eq('id', documentId);

      if (error) {
        throw new Error(`키워드 업데이트 실패: ${error.message}`);
      }
    } catch (error) {
      console.error('키워드 업데이트 실패:', error);
      throw error;
    }
  }
}

// 싱글톤 인스턴스 export
let documentKeywordServiceInstance: DocumentKeywordService | null = null;

export function getDocumentKeywordService(): DocumentKeywordService {
  if (!documentKeywordServiceInstance) {
    documentKeywordServiceInstance = new DocumentKeywordService();
  }
  return documentKeywordServiceInstance;
}
