import { useState, useEffect } from 'react';
import { Calendar, Search, MoreHorizontal, Plus, Download, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScheduleSettingsDialog } from '@/components/schedule/ScheduleSettingsDialog';
import { useSchedule } from '@/hooks/useSchedule';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface Meeting {
  id: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  status: string;
  section_id?: string;
  meta: any;
  created_at: string;
  updated_at: string;
}

export const MeetingManagement = () => {
  const { toast } = useToast();
  // NEIS 가져오기만 필요 — 일정 목록 조회는 끈다
  const { importNeisSchedule } = useSchedule({ loadEvents: false });
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);

  const fetchMeetings = async () => {
    try {
      const { data, error } = await supabase
        .from('meeting')
        .select('*')
        .order('starts_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('미팅 조회 오류:', error);
        toast({
          title: '오류',
          description: '미팅 목록을 불러오는데 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }

      setMeetings(data || []);
    } catch (error) {
      console.error('미팅 조회 중 오류:', error);
      toast({
        title: '오류',
        description: '미팅 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  const filteredMeetings = meetings.filter(meeting =>
    meeting.meta?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    meeting.kind.toLowerCase().includes(searchTerm.toLowerCase()) ||
    meeting.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getKindBadge = (kind: string) => {
    switch (kind) {
      case 'training':
        return <Badge className="bg-blue-100 text-blue-800">연수</Badge>;
      case 'schedule':
        return <Badge className="bg-green-100 text-green-800">학사일정</Badge>;
      case 'event':
        return <Badge className="bg-purple-100 text-purple-800">출장</Badge>;
      case 'duty':
        return <Badge className="bg-orange-100 text-orange-800">근무</Badge>;
      default:
        return <Badge variant="secondary">{kind}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge variant="outline">예정</Badge>;
      case 'in_progress':
        return <Badge className="bg-yellow-100 text-yellow-800">진행중</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">완료</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800">취소</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const deleteMeeting = async (meetingId: string) => {
    try {
      const { error } = await supabase
        .from('meeting')
        .delete()
        .eq('id', meetingId);

      if (error) {
        console.error('미팅 삭제 오류:', error);
        toast({
          title: '오류',
          description: '미팅 삭제에 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }


      fetchMeetings();
    } catch (error) {
      console.error('미팅 삭제 중 오류:', error);
      toast({
        title: '오류',
        description: '미팅 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleImportNeis = async () => {
    await importNeisSchedule();
    await fetchMeetings();
  };

  const handleSettings = () => {
    setShowSettingsDialog(true);
  };

  const handleSettingsClose = () => {
    setShowSettingsDialog(false);
    fetchMeetings();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>미팅 관리</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>미팅 관리</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleImportNeis}>
              <Download className="h-4 w-4 mr-2" />
              NEIS 불러오기
            </Button>
            <Button variant="outline" onClick={handleSettings}>
              <Settings className="h-4 w-4 mr-2" />
              설정
            </Button>
            <Button onClick={() => window.location.href = '/schedule'}>
              <Plus className="h-4 w-4 mr-2" />
              새 미팅 추가
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="제목, 종류, ID로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Meeting Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>종류</TableHead>
                  <TableHead>일시</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>생성일</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMeetings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? '검색 결과가 없습니다.' : '등록된 미팅이 없습니다.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMeetings.map((meeting) => (
                    <TableRow key={meeting.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {meeting.meta?.title || '제목 없음'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {meeting.id}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getKindBadge(meeting.kind)}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>
                            {format(new Date(meeting.starts_at), 'yyyy.MM.dd', { locale: ko })}
                          </div>
                          <div className="text-muted-foreground">
                            {format(new Date(meeting.starts_at), 'HH:mm', { locale: ko })} - 
                            {format(new Date(meeting.ends_at), 'HH:mm', { locale: ko })}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(meeting.status)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {format(new Date(meeting.created_at), 'yyyy.MM.dd', { locale: ko })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              onClick={() => window.location.href = `/schedule?edit=${meeting.id}`}
                            >
                              미팅 수정
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                if (window.confirm('정말로 이 미팅을 삭제하시겠습니까?')) {
                                  deleteMeeting(meeting.id);
                                }
                              }}
                              className="text-red-600"
                            >
                              미팅 삭제
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{meetings.length}</div>
                <p className="text-sm text-muted-foreground">전체 미팅</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">
                  {meetings.filter(m => m.status === 'scheduled').length}
                </div>
                <p className="text-sm text-muted-foreground">예정된 미팅</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">
                  {meetings.filter(m => m.status === 'in_progress').length}
                </div>
                <p className="text-sm text-muted-foreground">진행 중</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">
                  {meetings.filter(m => m.status === 'completed').length}
                </div>
                <p className="text-sm text-muted-foreground">완료된 미팅</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>

      <ScheduleSettingsDialog
        open={showSettingsDialog}
        onOpenChange={handleSettingsClose}
        onRefresh={fetchMeetings}
      />
    </Card>
  );
};