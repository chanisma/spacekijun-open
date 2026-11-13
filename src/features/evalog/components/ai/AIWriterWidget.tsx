import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sparkles,
  Send,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  User,
  X,
  Wand2,
  BookmarkPlus,
} from 'lucide-react';
import { Student } from '../../types';
import {
  generateText,
  extractStudentContext,
  validateApiKey,
  type WriterRequest,
  type StudentContext,
} from '../../services/openaiWriterService';
import { useEvaluationStore } from '../../hooks/useEvaluationStore';
import { toast } from '@/lib/toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

interface AIWriterWidgetProps {
  selectedStudent: Student | null;
}

interface GeneratedResult {
  prompt: string;
  content: string;
  usedStudentData: boolean;
}

export const AIWriterWidget: React.FC<AIWriterWidgetProps> = ({
  selectedStudent,
}) => {
  const { profile, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [useStudentData, setUseStudentData] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedResult[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  const resultsEndRef = useRef<HTMLDivElement>(null);

  // 현재 평가 데이터 가져오기
  const { getEvaluation } = useEvaluationStore();

  // API 키 확인
  useEffect(() => {
    validateApiKey().then(v => setHasApiKey(v));
  }, []);

  // 결과 자동 스크롤
  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [results]);

  // 다이얼로그 닫을 때 상태 유지 (결과는 보존)
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };

  // 문장 생성
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('프롬프트를 입력해주세요.');
      return;
    }

    setIsGenerating(true);

    try {
      // 학생 컨텍스트 생성
      // - 현재 작성 중인 평가 내용은 항상 참고
      // - 학생 기본 데이터(출결, 이전 세특 등)는 useStudentData에 따라 선택적으로 포함
      let studentContext: StudentContext | undefined;
      if (selectedStudent) {
        const currentEval = getEvaluation(selectedStudent.id);

        // 현재 작성 중인 평가 내용은 항상 포함
        const currentEvaluation = {
          homeroom: currentEval.homeroom,
          subject: { content: currentEval.subject.content },
          club: { content: currentEval.club.content },
        };

        if (useStudentData) {
          // 학생 데이터 활용 시: 기본 정보 + 현재 평가
          const baseContext = extractStudentContext(selectedStudent);
          studentContext = {
            ...baseContext,
            currentEvaluation,
          };
        } else {
          // 학생 데이터 미활용 시: 현재 평가만 포함(이름 등 식별정보는 담지 않는다)
          studentContext = { currentEvaluation };
        }
      }

      const request: WriterRequest = {
        prompt: prompt.trim(),
        useStudentData: useStudentData && !!selectedStudent,
        studentContext,
      };

      const response = await generateText(request);

      if (response.success && response.content) {
        setResults((prev) => [
          ...prev,
          {
            prompt: prompt.trim(),
            content: response.content,
            usedStudentData: useStudentData && !!selectedStudent,
          },
        ]);
        setPrompt('');
        toast.success('문장이 생성되었습니다.');
      } else {
        toast.error(response.error || '문장 생성에 실패했습니다.');
      }
    } catch (error: any) {
      console.error('Generate error:', error);
      toast.error(error.message || '문장 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  // 복사
  const handleCopy = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      toast.success('클립보드에 복사되었습니다.');
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      toast.error('복사에 실패했습니다.');
    }
  };

  // 결과 삭제
  const handleRemoveResult = (index: number) => {
    setResults((prev) => prev.filter((_, i) => i !== index));
  };

  // 결과 전체 삭제
  const handleClearResults = () => {
    setResults([]);
  };

  // 관찰노트에 저장
  const handleSaveToObservation = async (content: string, index: number) => {
    if (!selectedStudent) {
      toast.error('학생을 선택해주세요.');
      return;
    }

    if (!user) {
      toast.error('로그인이 필요합니다.');
      return;
    }

    const observerName = profile?.name;
    if (!observerName) {
      toast.error('프로필 이름이 설정되지 않았습니다. 마이페이지에서 이름을 설정해주세요.');
      return;
    }

    setSavingIndex(index);
    try {
      const { error } = await supabase
        .from('teacher_observations')
        .insert({
          student_id: selectedStudent.id,
          student_name: selectedStudent.name,
          observer_name: observerName,
          content: content.trim(),
          created_by: user.id,
        });

      if (error) throw error;

      toast.success('관찰노트에 저장되었습니다.');
    } catch (error) {
      console.error('Error saving to observation:', error);
      toast.error('관찰노트 저장에 실패했습니다.');
    } finally {
      setSavingIndex(null);
    }
  };

  // 예시 프롬프트
  const examplePrompts = [
    '현재 작성 중인 내용과 연관된 교과 세특 혹은 창의적 체험활동',
    '학생의 전반적인 강점 분석',
    '학생을 한 마디로 평가한다면 어떤 학생인지',
    '학생의 진로가 어떤 방향인지',
    '작성 중인 평가 내용에 있는 활동을 고려했을 때 학생의 강점이 무엇이라고 생각할 수 있는지'
  ];

  return (
    <>
      {/* 플로팅 버튼 */}
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white flex items-center justify-center"
        title="AI 도우미"
      >
        <Wand2 className="h-6 w-6" />
      </Button>

      {/* 다이얼로그 */}
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-600" />
              AI 도우미
            </DialogTitle>
            <DialogDescription>
              프롬프트를 입력하면 학생부와 관련된 질문에 답변을 생성합니다.
            </DialogDescription>
          </DialogHeader>

          {/* API 키 없음 경고 */}
          {hasApiKey === false && (
            <Alert variant="destructive" className="mx-6 mt-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                AI 서비스를 사용할 수 없습니다. 관리자에게 문의하세요.
              </AlertDescription>
            </Alert>
          )}

          {/* 학생 데이터 활용 옵션 */}
          <div className="px-6 py-3 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch
                  id="use-student-data"
                  checked={useStudentData}
                  onCheckedChange={setUseStudentData}
                  disabled={!selectedStudent}
                />
                <Label
                  htmlFor="use-student-data"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <User className="w-4 h-4" />
                  학생 데이터 활용
                </Label>
              </div>
              {selectedStudent ? (
                <span className="text-sm text-muted-foreground">
                  현재 학생: <strong>{selectedStudent.name}</strong> (
                  {selectedStudent.studentNo})
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  학생을 선택하면 해당 학생 데이터를 활용합니다
                </span>
              )}
            </div>
            {useStudentData && selectedStudent && (
              <p className="text-xs text-muted-foreground mt-2">
                선택된 학생의 출결, 교과세특, 창의적 체험활동, 행동특성 및{' '}
                <strong>현재 작성 중인 평가 내용</strong>을 참고하여 답변을 생성합니다.
              </p>
            )}
          </div>

          {/* 결과 영역 */}
          <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3">
            {results.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Wand2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>프롬프트를 입력하고 문장을 생성해보세요</p>
                <div className="mt-4 space-y-2">
                  <p className="text-xs">예시 프롬프트:</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {examplePrompts.map((example, idx) => (
                      <Button
                        key={idx}
                        size="sm"
                        variant="outline"
                        onClick={() => setPrompt(example)}
                        className="text-xs h-7"
                      >
                        {example}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleClearResults}
                    className="text-xs text-muted-foreground"
                  >
                    전체 삭제
                  </Button>
                </div>
                {results.map((result, index) => (
                  <Card key={index} className="relative group">
                    <CardContent className="p-4">
                      {/* 프롬프트 */}
                      <div className="text-xs text-muted-foreground mb-2 pr-20">
                        <span className="font-medium">프롬프트:</span> {result.prompt}
                      </div>

                      {/* 생성된 내용 */}
                      <div className="text-sm whitespace-pre-wrap leading-relaxed">
                        {result.content}
                      </div>

                      {/* 메타 정보 */}
                      {result.usedStudentData && (
                        <div className="mt-3 pt-2 border-t border-slate-100">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px]">
                            <User className="w-3 h-3" />
                            학생 데이터 활용
                          </span>
                        </div>
                      )}

                      {/* 액션 버튼 */}
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleCopy(result.content, index)}
                          title="복사"
                        >
                          {copiedIndex === index ? (
                            <Check className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                          onClick={() => handleSaveToObservation(result.content, index)}
                          disabled={!selectedStudent || savingIndex === index}
                          title="관찰노트에 저장"
                        >
                          {savingIndex === index ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <BookmarkPlus className="w-3.5 h-3.5" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleRemoveResult(index)}
                          title="삭제"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <div ref={resultsEndRef} />
              </>
            )}
          </div>

          {/* 입력 영역 */}
          <div className="border-t p-4 space-y-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="예: 수업 시간에 적극적으로 참여하고 질문하는 학생의 교과세특 문장을 작성해주세요."
              disabled={isGenerating || hasApiKey === false}
              className="min-h-[80px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Ctrl+Enter로 생성
              </span>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim() || hasApiKey === false}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    생성 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    문장 생성
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AIWriterWidget;
