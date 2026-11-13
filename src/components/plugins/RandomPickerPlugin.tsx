import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dices, Users, Sparkles, Loader2, Plus, Trash2 } from 'lucide-react';
import { PluginComponentProps, RandomPickerData } from '@/types/plugin';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

export const RandomPickerPlugin: React.FC<PluginComponentProps> = ({
  instance,
  readonly = false,
  onUpdate,
  entityId,
  entityType,
}) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [pickerData, setPickerData] = useState<RandomPickerData>({
    participants: [],
    pickCount: 1,
    selectedMembers: null,
    selectedAt: null,
  });

  useEffect(() => {
    if (instance.data && typeof instance.data === 'object') {
      const data = instance.data as Partial<RandomPickerData>;
      setPickerData({
        participants: data.participants || [],
        pickCount: data.pickCount || 1,
        selectedMembers: data.selectedMembers || null,
        selectedAt: data.selectedAt || null,
      });
    }
  }, [instance.data]);

  const [newParticipantName, setNewParticipantName] = useState('');

  const handleAddParticipant = () => {
    if (!newParticipantName.trim()) return;

    const newParticipant = {
      id: Date.now().toString(),
      name: newParticipantName.trim(),
    };

    setPickerData(prev => ({
      ...prev,
      participants: [...prev.participants, newParticipant],
    }));

    setNewParticipantName('');
  };

  const handleRemoveParticipant = (id: string) => {
    setPickerData(prev => ({
      ...prev,
      participants: prev.participants.filter(p => p.id !== id),
    }));
  };

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(pickerData);
    }
    setIsEditMode(false);
  };

  const handleRandomPick = () => {
    const { participants, pickCount } = pickerData;

    if (participants.length === 0 || pickCount <= 0) return;

    // Fisher-Yates shuffle
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(pickCount, participants.length));

    const updatedData: RandomPickerData = {
      ...pickerData,
      selectedMembers: selected.map(p => p.id),
      selectedAt: new Date().toISOString(),
    };

    setPickerData(updatedData);

    if (onUpdate) {
      onUpdate(updatedData);
    }
  };

  const selectedParticipants = pickerData.selectedMembers
    ? pickerData.participants.filter(p => pickerData.selectedMembers?.includes(p.id))
    : [];

  // 편집 모드
  if (isEditMode && !readonly) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2 md:pb-3 px-3 md:px-6 pt-4 md:pt-6">
          <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-base">
            <Dices className="w-3.5 h-3.5 md:w-4 md:h-4" />
            랜덤 뽑기 설정
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 md:space-y-4 px-3 md:px-6 pb-4 md:pb-6">
          {/* Pick Count */}
          <div>
            <Label htmlFor="pickCount">뽑을 인원 수</Label>
            <Input
              id="pickCount"
              type="number"
              min={1}
              max={pickerData.participants.length || 1}
              value={pickerData.pickCount}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (value >= 1) {
                  setPickerData(prev => ({ ...prev, pickCount: value }));
                }
              }}
            />
          </div>

          {/* Participants */}
          <div className="space-y-2">
            <Label>참가자 목록 ({pickerData.participants.length}명)</Label>

            {/* Add Participant */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="참가자 이름 입력"
                value={newParticipantName}
                onChange={(e) => setNewParticipantName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddParticipant();
                  }
                }}
              />
              <Button
                type="button"
                onClick={handleAddParticipant}
                disabled={!newParticipantName.trim()}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Participant List */}
            {pickerData.participants.length > 0 && (
              <div className="border rounded-lg p-2 max-h-48 overflow-y-auto space-y-1">
                {pickerData.participants.map((participant) => (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{participant.name}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveParticipant(participant.id)}
                      className="h-7 w-7"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-4">
            <Button
              onClick={handleSave}
              disabled={pickerData.participants.length < 2}
            >
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

  // 뷰 모드
  if (pickerData.participants.length === 0) {
    if (!readonly) {
      return (
        <Card className="w-full">
          <CardContent className="py-6 md:py-8 px-3 md:px-6 text-center">
            <Dices className="w-10 h-10 md:w-12 md:h-12 mx-auto text-muted-foreground mb-3 md:mb-4" />
            <p className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">아직 설정된 랜덤 뽑기가 없습니다</p>
            <Button onClick={() => setIsEditMode(true)} size="sm" className="h-8 text-xs md:h-9 md:text-sm">
              랜덤 뽑기 만들기
            </Button>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 md:pb-3 px-3 md:px-6 pt-4 md:pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-base">
              <Dices className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
              <span className="truncate">랜덤 뽑기</span>
            </CardTitle>
            <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">
              {pickerData.participants.length}명 중 {pickerData.pickCount}명 선택
            </p>
          </div>
          {!readonly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditMode(true);
              }}
              className="text-[10px] md:text-xs h-6 md:h-7 px-1.5 md:px-2 flex-shrink-0"
            >
              편집
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4 px-3 md:px-6 pb-4 md:pb-6">
        {/* Participants List */}
        <div className="space-y-1.5 md:space-y-2">
          <div className="text-[10px] md:text-xs text-muted-foreground font-medium">참가자</div>
          <div className="flex flex-wrap gap-1 md:gap-1.5">
            {pickerData.participants.map((participant) => {
              const isSelected = pickerData.selectedMembers?.includes(participant.id);
              return (
                <Badge
                  key={participant.id}
                  variant={isSelected ? "default" : "secondary"}
                  className={cn(
                    "text-[10px] md:text-xs h-5 md:h-6 px-1.5 md:px-2",
                    isSelected && "bg-amber-500 hover:bg-amber-600"
                  )}
                >
                  {isSelected && <Sparkles className="h-2.5 w-2.5 md:h-3 md:w-3 mr-0.5 md:mr-1" />}
                  {participant.name}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Selected Result */}
        {pickerData.selectedMembers && pickerData.selectedMembers.length > 0 && (
          <div className="space-y-1.5 md:space-y-2 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2 md:p-3">
            <div className="flex items-center gap-1.5 md:gap-2">
              <Sparkles className="h-3.5 w-3.5 md:h-4 md:w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-xs md:text-sm font-semibold text-amber-900 dark:text-amber-100">
                선택 결과
              </span>
            </div>
            <div className="space-y-1 md:space-y-1.5">
              {selectedParticipants.map((participant, index) => (
                <div
                  key={participant.id}
                  className="flex items-center gap-1.5 md:gap-2 p-1.5 md:p-2 bg-white/50 dark:bg-black/20 rounded-lg"
                >
                  <div className="flex items-center justify-center w-5 h-5 md:w-6 md:h-6 rounded-full bg-amber-500 text-white text-[10px] md:text-xs font-bold flex-shrink-0">
                    {index + 1}
                  </div>
                  <span className="text-xs md:text-sm font-medium text-amber-900 dark:text-amber-100 truncate">
                    {participant.name}
                  </span>
                </div>
              ))}
            </div>
            {pickerData.selectedAt && (
              <div className="text-[10px] md:text-xs text-amber-700 dark:text-amber-300 pt-0.5 md:pt-1">
                {formatDistanceToNow(new Date(pickerData.selectedAt), {
                  addSuffix: true,
                  locale: ko,
                })}{' '}
                선택됨
              </div>
            )}
          </div>
        )}

        {/* Random Pick Button */}
        {!readonly && (
          <Button
            onClick={handleRandomPick}
            disabled={pickerData.participants.length === 0}
            className="w-full h-8 text-xs md:h-9 md:text-sm"
            size="sm"
            variant={pickerData.selectedMembers ? "outline" : "default"}
          >
            <Dices className="h-3 w-3 md:h-3.5 md:w-3.5 mr-1 md:mr-2" />
            {pickerData.selectedMembers ? '다시 뽑기' : '랜덤 뽑기'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
