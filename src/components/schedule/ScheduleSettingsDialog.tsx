import { useState, useEffect } from 'react';
import { Settings, Eye, EyeOff, Search } from 'lucide-react';
import { DialogFooter,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ScheduleEvent {
  id: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  meta: {
    title?: string;
    hidden?: boolean;
  };
}

interface ScheduleSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}

export const ScheduleSettingsDialog = ({
  open,
  onOpenChange,
  onRefresh
}: ScheduleSettingsDialogProps) => {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchEvents();
    }
  }, [open]);

  useEffect(() => {
    filterEvents();
  }, [events, searchTerm, showHidden]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('meeting')
        .select('id, kind, starts_at, ends_at, meta')
        .in('kind', ['schedule', 'event', 'duty', 'training'])
        .order('starts_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setEvents((data as any) || []);
    } catch (error) {
      console.error('일정 조회 중 오류:', error);
      toast({
        title: '오류',
        description: '일정을 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filterEvents = () => {
    let filtered = events;

    // 검색어 필터링
    if (searchTerm) {
      filtered = filtered.filter(event => {
        const title = event.meta?.title || event.kind;
        return title.toLowerCase().includes(searchTerm.toLowerCase());
      });
    }

    // 숨김 상태 필터링
    if (!showHidden) {
      filtered = filtered.filter(event => !event.meta?.hidden);
    }

    setFilteredEvents(filtered);
  };

  const toggleEventVisibility = async (eventId: string, currentHidden: boolean) => {
    try {
      const { error } = await supabase
        .from('meeting')
        .update({
          meta: { 
            ...events.find(e => e.id === eventId)?.meta,
            hidden: !currentHidden 
          }
        })
        .eq('id', eventId);

      if (error) throw error;

      // 로컬 상태 업데이트
      setEvents(prev => 
        prev.map(event => 
          event.id === eventId 
            ? { 
                ...event, 
                meta: { ...event.meta, hidden: !currentHidden }
              }
            : event
        )
      );

      toast({
        title: '설정 완료',
        description: `일정이 ${!currentHidden ? '숨겨졌습니다' : '표시됩니다'}.`,
      });

      onRefresh(); // 캘린더 새로고침
    } catch (error) {
      console.error('일정 설정 중 오류:', error);
      toast({
        title: '오류',
        description: '설정을 변경하는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const hideAllSaturdayHolidays = async () => {
    try {
      setLoading(true);
      
      // 데이터베이스에서 모든 토요휴업일 일정을 직접 조회하고 일괄 업데이트
      const { data: allSaturdayHolidays, error: queryError } = await supabase
        .from('meeting')
        .select('id, meta')
        .eq('kind', 'schedule')
        .eq('meta->>title', '토요휴업일');

      if (queryError) {
        throw queryError;
      }

      if (!allSaturdayHolidays || allSaturdayHolidays.length === 0) {
        toast({
          title: '알림',
          description: '토요휴업일 일정이 없습니다.',
        });
        return;
      }

      // 아직 숨겨지지 않은 토요휴업일만 필터링
      const visibleSaturdayHolidays = allSaturdayHolidays.filter(event => 
        !(event.meta as any)?.hidden || (event.meta as any).hidden !== true
      );

      if (visibleSaturdayHolidays.length === 0) {
        toast({
          title: '알림',
          description: '모든 토요휴업일이 이미 숨겨져 있습니다.',
        });
        return;
      }

      // 모든 토요휴업일 일정에 hidden: true 설정 (일괄 업데이트)
      const updates = allSaturdayHolidays.map(event => 
        supabase
          .from('meeting')
          .update({
            meta: { ...(event.meta as any), hidden: true }
          })
          .eq('id', event.id)
      );

      const results = await Promise.allSettled(updates);
      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');
      
      if (failed.length > 0) {
        console.error('일부 업데이트 실패:', failed);
        toast({
          title: '부분 성공',
          description: `${successful.length}개 성공, ${failed.length}개 실패`,
          variant: 'destructive',
        });
      }

      // 현재 표시된 이벤트 목록에서 토요휴업일 제거 (UI 업데이트)
      await fetchEvents();

      toast({
        title: '설정 완료',
        description: `${allSaturdayHolidays.length}개의 토요휴업일 일정이 숨겨졌습니다.`,
      });

      onRefresh(); // 캘린더 새로고침
    } catch (error) {
      console.error('토요휴업일 숨기기 중 오류:', error);
      toast({
        title: '오류',
        description: '토요휴업일을 숨기는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getKindBadge = (kind: string) => {
    const kindMap = {
      schedule: { label: '학사', color: 'bg-green-500' },
      event: { label: '출장', color: 'bg-purple-500' },
      duty: { label: '업무', color: 'bg-orange-500' },
      training: { label: '연수', color: 'bg-blue-500' },
    };
    
    const kindInfo = kindMap[kind as keyof typeof kindMap] || { label: kind, color: 'bg-gray-500' };
    
    return (
      <Badge variant="secondary" className="text-xs">
        <div className={`w-2 h-2 rounded-full mr-1 ${kindInfo.color}`}></div>
        {kindInfo.label}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            스케줄 설정
          </DialogTitle>
          <DialogDescription>
            일정 표시/숨김을 설정하고 토요휴업일 등을 일괄 관리할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden">
          {/* 빠른 액션 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">빠른 설정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                onClick={hideAllSaturdayHolidays}
                disabled={loading}
                variant="outline"
                size="sm"
                className="w-full"
              >
                토요휴업일 모두 숨기기
              </Button>
            </CardContent>
          </Card>

          {/* 필터 및 검색 */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="일정 제목 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="show-hidden"
                checked={showHidden}
                onCheckedChange={setShowHidden}
              />
              <label htmlFor="show-hidden" className="text-sm">
                숨겨진 일정도 표시
              </label>
            </div>
          </div>

          {/* 일정 목록 */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-6 w-12" />
                </div>
              ))
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>설정할 일정이 없습니다.</p>
              </div>
            ) : (
              filteredEvents.map((event) => {
                const isHidden = event.meta?.hidden || false;
                const title = event.meta?.title || event.kind;
                const startDate = new Date(event.starts_at).toLocaleDateString('ko-KR');

                return (
                  <div
                    key={event.id}
                    className={`flex items-center justify-between p-3 border rounded-lg transition-all ${
                      isHidden ? 'opacity-50 bg-gray-50' : 'bg-white'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getKindBadge(event.kind)}
                        <h4 className={`font-medium text-sm truncate ${
                          isHidden ? 'text-gray-500' : 'text-gray-900'
                        }`}>
                          {title}
                        </h4>
                      </div>
                      <p className="text-xs text-gray-500">{startDate}</p>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleEventVisibility(event.id, isHidden)}
                      className="ml-2"
                    >
                      {isHidden ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter className="flex justify-end pt-4 border-t">
          <Button onClick={() => onOpenChange(false)}>
            완료
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};