import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sparkles,
  Send,
  Loader2,
  AlertCircle,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { aiSearchDocuments } from '@/features/documents/services/documentAiSearch';
import { useDocumentActions } from '@/features/documents/hooks/useDocumentsQuery';
import type { DocumentWithUploader } from '@/features/documents/types';

/**
 * AI 문서 검색 도우미 (2026-08 재구축).
 * 자연어 질의를 공용 aiChat(Solar) 어댑터로 검색 조건으로 변환한 뒤
 * 일반 DB 검색을 실행한다 — 구 Gemini/벡터 검색 의존 제거.
 */
interface AIDocumentAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchTurn {
  query: string;
  explanation?: string;
  documents?: DocumentWithUploader[];
  error?: string;
}

const EXAMPLE_QUERIES = [
  '작년에 올라온 회의록 찾아줘',
  '교무운영부 계획서',
  '진학 관련 최근 자료',
];

export const AIDocumentAssistantDialog: React.FC<AIDocumentAssistantDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const [query, setQuery] = useState('');
  const [turns, setTurns] = useState<SearchTurn[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { open: openDocument } = useDocumentActions();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, isProcessing]);

  const runSearch = async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed || isProcessing) return;

    setIsProcessing(true);
    setQuery('');
    try {
      const result = await aiSearchDocuments(trimmed);
      setTurns(prev => [
        ...prev,
        {
          query: trimmed,
          explanation: result.interpretation.explanation,
          documents: result.documents.slice(0, 20),
        },
      ]);
    } catch (error) {
      console.error('AI 문서 검색 오류:', error);
      setTurns(prev => [
        ...prev,
        {
          query: trimmed,
          error: error instanceof Error ? error.message : 'AI 검색에 실패했습니다.',
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI 문서 검색
          </DialogTitle>
          <DialogDescription>
            자연어로 문서를 찾아보세요. 기간·부서·키워드를 함께 해석합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-2">
          {turns.length === 0 && !isProcessing && (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-muted-foreground">예시:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLE_QUERIES.map(example => (
                  <Button
                    key={example}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => runSearch(example)}
                  >
                    {example}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn, index) => (
            <div key={index} className="space-y-2">
              <div className="flex justify-end">
                <span className="rounded-2xl bg-blue-600 px-3 py-1.5 text-sm text-white">
                  {turn.query}
                </span>
              </div>

              {turn.error ? (
                <Alert className="bg-red-50 border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">{turn.error}</AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                  {turn.explanation && (
                    <p className="text-xs text-muted-foreground">{turn.explanation}</p>
                  )}
                  {turn.documents && turn.documents.length > 0 ? (
                    <div className="space-y-1">
                      {turn.documents.map(doc => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => openDocument(doc)}
                          className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-background transition-colors"
                          title="새 창에서 열기"
                        >
                          <FileText className="h-4 w-4 flex-shrink-0 text-blue-600" />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {doc.title || doc.file_name}
                          </span>
                          {doc.meta?.department && (
                            <Badge variant="outline" className="text-[10px] pointer-events-none">
                              {doc.meta.department}
                            </Badge>
                          )}
                          <span className="flex-shrink-0 text-[11px] text-muted-foreground">
                            {format(new Date(doc.created_at), 'yy.MM.dd', { locale: ko })}
                          </span>
                          <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">조건에 맞는 문서가 없습니다.</p>
                  )}
                </div>
              )}
            </div>
          ))}

          {isProcessing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              검색 조건을 해석하는 중...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="flex items-center gap-2 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(query);
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 작년 교무부 회의록 찾아줘"
            disabled={isProcessing}
          />
          <Button type="submit" size="icon" disabled={isProcessing || !query.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
