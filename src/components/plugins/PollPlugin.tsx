import React, { useState, useEffect } from 'react';
import { PretextInline } from '@/components/ui/PretextContent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Vote, Users, Check, BarChart3 } from 'lucide-react';
import { PluginComponentProps, PollData, PollOption } from '@/types/plugin';
import { useVote, usePollVotes } from '@/hooks/usePlugins';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

export const PollPlugin: React.FC<PluginComponentProps> = ({
  instance,
  readonly = false,
  onUpdate,
}) => {
  const { user } = useAuth();
  const { data: votes = [] } = usePollVotes(instance.id);
  const voteMutation = useVote();

  const [isEditMode, setIsEditMode] = useState(false);
  const [isResultsDialogOpen, setIsResultsDialogOpen] = useState(false);
  const [voteDetails, setVoteDetails] = useState<Array<{optionId: string; voter: string}>>([]);
  const [pollData, setPollData] = useState<PollData>({
    question: '',
    options: [],
    settings: {
      allowMultiple: false,
      showResults: true,
      allowChangeVote: true,
    },
  });

  useEffect(() => {
    if (instance.data && typeof instance.data === 'object') {
      const data = instance.data as Partial<PollData>;
      setPollData({
        question: data.question || '',
        options: data.options || [],
        settings: data.settings || {
          allowMultiple: false,
          showResults: true,
          allowChangeVote: true,
        },
      });
    }
  }, [instance.data]);

  // 현재 사용자의 투표 찾기
  const userVote = votes.find(v => v.user_id === user?.id);

  // 각 옵션별 투표 수 계산
  const voteCounts = (pollData.options || []).map(option => ({
    ...option,
    votes: votes.filter(v => v.option_id === option.id).length,
  }));

  const totalVotes = votes.length;

  const handleAddOption = () => {
    setPollData(prev => ({
      ...prev,
      options: [
        ...(prev.options || []),
        { id: Date.now().toString(), text: '' },
      ],
    }));
  };

  const handleRemoveOption = (optionId: string) => {
    setPollData(prev => ({
      ...prev,
      options: (prev.options || []).filter(opt => opt.id !== optionId),
    }));
  };

  const handleOptionChange = (optionId: string, text: string) => {
    setPollData(prev => ({
      ...prev,
      options: (prev.options || []).map(opt =>
        opt.id === optionId ? { ...opt, text } : opt
      ),
    }));
  };

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(pollData);
    }
    setIsEditMode(false);
  };

  const handleVote = (optionId: string) => {
    if (!pollData.settings?.allowChangeVote && userVote) {
      return;
    }
    voteMutation.mutate({ instanceId: instance.id, optionId });
  };

  // 투표 결과 상세 조회 (생성자만)
  const handleViewResults = async () => {
    if (instance.created_by !== user?.id) return;

    try {
      const { data: votesData, error } = await supabase
        .from('poll_votes')
        .select('option_id, user_id')
        .eq('instance_id', instance.id);

      if (error) throw error;

      // 투표자 ID 목록 추출
      const userIds = votesData?.map(v => v.user_id) || [];

      // profiles 테이블에서 이름 조회
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);

      // 투표 데이터와 프로필 데이터 결합
      const details = votesData?.map((vote: any) => {
        const profile = profilesData?.find(p => p.id === vote.user_id);
        return {
          optionId: vote.option_id,
          voter: profile?.name || '알 수 없음'
        };
      }) || [];

      setVoteDetails(details);
      setIsResultsDialogOpen(true);
    } catch (error) {
      console.error('투표 결과 조회 오류:', error);
    }
  };

  // 안전하게 options 배열 접근
  const options = pollData.options || [];
  const hasOptions = options.length > 0;

  // 편집 모드
  if (isEditMode && !readonly) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2 md:pb-3 px-3 md:px-6 pt-4 md:pt-6">
          <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-base">
            <Vote className="w-3.5 h-3.5 md:w-4 md:h-4" />
            투표 설정
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 md:space-y-4 px-3 md:px-6 pb-4 md:pb-6">
          <div>
            <Label htmlFor="question">질문</Label>
            <Input
              id="question"
              value={pollData.question}
              onChange={(e) => setPollData(prev => ({ ...prev, question: e.target.value }))}
              placeholder="투표 질문을 입력하세요"
            />
          </div>

          <div className="space-y-2">
            <Label>투표 옵션</Label>
            {options.map((option, index) => (
              <div key={option.id} className="flex items-center gap-2">
                <Input
                  value={option.text}
                  onChange={(e) => handleOptionChange(option.id, e.target.value)}
                  placeholder={`옵션 ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveOption(option.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={handleAddOption}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              옵션 추가
            </Button>
          </div>

          <div className="flex items-center gap-2 pt-4">
            <Button onClick={handleSave} disabled={!pollData.question || options.length < 2}>
              저장
            </Button>
            <Button variant="outline" onClick={() => setIsEditMode(false)}>
              취소
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 투표 뷰
  if (!pollData.question || !hasOptions) {
    if (!readonly) {
      return (
        <Card className="w-full">
          <CardContent className="py-6 md:py-8 px-3 md:px-6 text-center">
            <Vote className="w-10 h-10 md:w-12 md:h-12 mx-auto text-muted-foreground mb-3 md:mb-4" />
            <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">아직 설정된 투표가 없습니다</p>
            <Button onClick={() => setIsEditMode(true)} size="sm" className="h-8 text-xs md:h-9 md:text-sm">
              투표 만들기
            </Button>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  return (
    <>
      <Card className="w-full">
        <CardHeader className="pb-2 md:pb-3 px-3 md:px-6 pt-4 md:pt-6">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-base">
                <Vote className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                <PretextInline content={pollData.question} className="truncate" />
              </CardTitle>
              <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">
                <Users className="w-2.5 h-2.5 md:w-3 md:h-3 inline mr-1" />
                {totalVotes}명 참여
              </p>
            </div>
            <div className="flex gap-0.5 md:gap-1 flex-shrink-0">
              {/* 생성자만 결과 보기 가능 */}
              {instance.created_by === user?.id && totalVotes > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewResults();
                  }}
                  className="text-xs h-6 md:h-7 px-1.5 md:px-2"
                  title="투표한 사용자 보기"
                >
                  <BarChart3 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                </Button>
              )}
              {!readonly && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditMode(true);
                  }}
                  className="text-[10px] md:text-xs h-6 md:h-7 px-1.5 md:px-2"
                >
                  편집
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 md:px-6 pb-4 md:pb-6">
          {pollData.settings?.showResults || userVote ? (
            // 결과 표시
            <div className="space-y-2 md:space-y-3">
              {voteCounts.map((option) => {
                const percentage = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
                const isUserVote = userVote?.option_id === option.id;

                return (
                  <div
                    key={option.id}
                    className={cn(
                      "relative p-2 md:p-2.5 rounded-lg border transition-colors cursor-pointer",
                      isUserVote ? "border-primary bg-primary/5" : "hover:bg-accent"
                    )}
                    onClick={() => handleVote(option.id)}
                  >
                    <div className="flex items-center justify-between mb-1 md:mb-1.5 gap-2">
                      <span className="text-xs md:text-sm font-medium flex items-center gap-1 md:gap-2 flex-1 min-w-0">
                        <PretextInline content={option.text} className="truncate" />
                        {isUserVote && (
                          <Check className="w-3 h-3 md:w-3.5 md:h-3.5 text-primary flex-shrink-0" />
                        )}
                      </span>
                      <span className="text-[10px] md:text-xs text-muted-foreground whitespace-nowrap">
                        {option.votes}표 ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <Progress value={percentage} className="h-1 md:h-1.5" />
                  </div>
                );
              })}
            </div>
          ) : (
            // 투표 폼
            <RadioGroup value={userVote?.option_id} onValueChange={handleVote}>
              <div className="space-y-1.5 md:space-y-2">
                {options.map((option) => (
                  <div key={option.id} className="flex items-center space-x-2 p-1.5 md:p-2 rounded-lg hover:bg-accent transition-colors">
                    <RadioGroupItem value={option.id} id={option.id} className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    <Label htmlFor={option.id} className="flex-1 cursor-pointer text-xs md:text-sm">
                      <PretextInline content={option.text} />
                    </Label>
                  </div>
                ))}
              </div>
            </RadioGroup>
          )}

          {pollData.settings?.deadline && (
            <p className="text-xs text-muted-foreground mt-4">
              마감: {new Date(pollData.settings.deadline).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Results Dialog */}
      <Dialog open={isResultsDialogOpen} onOpenChange={setIsResultsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              투표 결과 상세
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {(pollData.options || []).map((option) => {
              const voters = voteDetails.filter(v => v.optionId === option.id);
              return (
                <div key={option.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm"><PretextInline content={option.text} /></h4>
                    <Badge variant="secondary">{voters.length}표</Badge>
                  </div>
                  {voters.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {voters.map((vote, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {vote.voter}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">투표자 없음</p>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};