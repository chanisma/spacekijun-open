import { useState, useEffect } from "react";
import { PageContainer } from '@/components/layout/PageContainer';
import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search as SearchIcon, FileText, Calendar, ListTodo, Briefcase, ExternalLink, Video, Newspaper, StickyNote } from "lucide-react";
import { useUniversalSearch, SearchResult } from "@/hooks/useUniversalSearch";
import { ScheduleDetailDialog } from "@/components/schedule/ScheduleDetailDialog";
import { WorkDetailDialog } from "@/components/tasks/WorkDetailDialog";
import { TaskDetailDialog } from "@/components/tasks/TaskDetailDialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentResourceId } from "@/hooks/useCurrentResourceId";
import { useToast } from "@/hooks/use-toast";

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [selectedWork, setSelectedWork] = useState<any>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showWorkDialog, setShowWorkDialog] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState('');

  const { data: searchResults = [], isLoading, error } = useUniversalSearch({
    query,
    enabled: !!query.trim(),
    limit: 100
  });

  const { data: resourceId } = useCurrentResourceId();
  const { toast } = useToast();

  // URL 파라미터가 변경되면 query 상태 업데이트
  useEffect(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery && urlQuery !== query) {
      setQuery(urlQuery);
    }
  }, [searchParams]);

  // 검색어 변경 시 URL 파라미터 업데이트
  const handleSearchChange = (value: string) => {
    setQuery(value);
    if (value.trim()) {
      setSearchParams({ q: value });
    } else {
      setSearchParams({});
    }
  };

  // 결과 카드 클릭 핸들러
  const handleResultClick = async (result: SearchResult) => {
    try {
      switch (result.type) {
        case 'meeting':
          // Meeting 상세 정보 조회
          const { data: meetingData } = await supabase
            .from('meeting')
            .select('*')
            .eq('id', result.id)
            .single();

          if (meetingData) {
            setSelectedMeeting(meetingData);
            setShowScheduleDialog(true);
          }
          break;

        case 'event':
          // Event 상세 정보 조회
          const { data: eventData } = await (supabase as any)
            .rpc('get_work_detail', { p_event_id: result.id });

          if (eventData) {
            setSelectedWork(eventData[0]);
            setShowWorkDialog(true);
          }
          break;

        case 'task':
          // Task 상세 정보 조회
          const { data: taskData } = await (supabase as any)
            .from('task')
            .select('*')
            .eq('id', result.id)
            .single();

          if (taskData) {
            setSelectedTask(taskData);
            setShowTaskDialog(true);
          }
          break;

        case 'document':
          // 문서 미리보기
          const { data: docData } = await supabase
            .from('documents')
            .select('*')
            .eq('id', result.id)
            .single();

          if (docData) {
            // Google Drive 파일인지 확인
            const isGoogleDrive = (docData as any).meta?.is_google_drive_file === true ||
                                 (typeof (docData as any).storage_path === 'string' && (docData as any).storage_path.includes('docs.google.com'));

            if (isGoogleDrive) {
              // Google Drive 파일은 새 창에서 열기
              window.open(docData.storage_path, '_blank', 'noopener,noreferrer');
            } else {
              // 일반 파일은 미리보기 다이얼로그 표시
              setSelectedDocument(docData);

              if (docData.storage_path.startsWith('http')) {
                setDocumentPreviewUrl(docData.storage_path);
              } else {
                const { data: { publicUrl } } = supabase.storage
                  .from('kijunspace')
                  .getPublicUrl(docData.storage_path);
                setDocumentPreviewUrl(publicUrl);
              }

              setShowDocumentDialog(true);
            }
          }
          break;

        case 'video':
          // 비디오는 새 창에서 YouTube URL 열기
          if (result.video?.url) {
            window.open(result.video.url, '_blank', 'noopener,noreferrer');
          }
          break;

        case 'news':
          // 입시 뉴스는 새 창에서 원문 URL 열기
          if (result.news?.url) {
            window.open(result.news.url, '_blank', 'noopener,noreferrer');
          }
          break;

        case 'collab_note':
          // 협업 노트는 해당 보드 페이지로 이동 (권한 확인 후)
          if (result.collab_note?.board_id && resourceId) {
            const boardId = result.collab_note.board_id;

            // 보드 권한 확인: 생성자이거나 멤버인지 확인
            const { data: board } = await supabase
              .from('collab_boards')
              .select('created_by, visibility')
              .eq('id', boardId)
              .single();

            if (!board) {
              toast({
                title: "보드를 찾을 수 없습니다",
                variant: "destructive",
              });
              break;
            }

            // public·read_only 보드는 모두 접근 가능
            // (서버 can_view_collab_board 와 같은 기준)
            if (board.visibility === 'public' || board.visibility === 'read_only') {
              window.location.href = `/collab/${boardId}`;
              break;
            }

            // Private 보드: 생성자 확인
            const isOwner = board.created_by === resourceId;

            // Private 보드: 멤버 확인
            const { data: membership } = await supabase
              .from('collab_board_members')
              .select('id')
              .eq('board_id', boardId)
              .eq('user_id', resourceId)
              .single();

            if (isOwner || membership) {
              // 권한 있음 - 보드로 이동
              window.location.href = `/collab/${boardId}`;
            } else {
              // 권한 없음 - 알림 표시
              toast({
                title: "접근 권한이 없습니다",
                description: "이 보드에 접근할 권한이 없습니다.",
                variant: "destructive",
              });
            }
          }
          break;
      }
    } catch (error) {
      console.error('Error handling result click:', error);
    }
  };

  // 결과 타입별 아이콘
  const getResultIcon = (type: string) => {
    switch (type) {
      case 'meeting':
        return <Calendar className="h-4 w-4 text-blue-500" />;
      case 'document':
        return <FileText className="h-4 w-4 text-purple-500" />;
      case 'event':
        return <Briefcase className="h-4 w-4 text-green-500" />;
      case 'task':
        return <ListTodo className="h-4 w-4 text-orange-500" />;
      case 'video':
        return <Video className="h-4 w-4 text-red-500" />;
      case 'news':
        return <Newspaper className="h-4 w-4 text-red-500" />;
      case 'collab_note':
        return <StickyNote className="h-4 w-4 text-yellow-500" />;
      default:
        return <SearchIcon className="h-4 w-4 text-gray-500" />;
    }
  };

  // 결과 타입별 라벨
  const getResultTypeLabel = (type: string) => {
    switch (type) {
      case 'meeting':
        return '스케줄';
      case 'document':
        return '문서';
      case 'event':
        return '업무 이벤트';
      case 'task':
        return '업무';
      case 'video':
        return '교육 비디오';
      case 'news':
        return '입시 뉴스';
      case 'collab_note':
        return '협업 노트';
      default:
        return '알 수 없음';
    }
  };

  // 날짜 포맷팅
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // 타입별로 그룹화된 결과
  const groupedResults = searchResults.reduce((acc, result) => {
    if (!acc[result.type]) {
      acc[result.type] = [];
    }
    acc[result.type].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  return (
    <Layout>
      <PageContainer width="narrow">
        <div className="space-y-6">
          {/* 검색 입력 */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="검색어를 입력하세요..."
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 text-lg py-3"
              autoFocus
            />
          </div>

          {/* 검색 결과 */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>검색 중...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-red-500">검색 중 오류가 발생했습니다.</p>
            </div>
          )}

          {!isLoading && !error && query.trim() && searchResults.length === 0 && (
            <div className="text-center py-12">
              <SearchIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500">검색 결과가 없습니다.</p>
            </div>
          )}

          {!isLoading && !error && searchResults.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  총 {searchResults.length}개의 결과를 찾았습니다.
                </p>
              </div>

              {/* 타입별 결과 표시 */}
              {Object.entries(groupedResults).map(([type, results]) => (
                <div key={type} className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    {getResultIcon(type)}
                    {getResultTypeLabel(type)} ({results.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {results.map((result) => (
                      <Card
                        key={`${result.type}-${result.id}`}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => handleResultClick(result)}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-base line-clamp-2">
                              {result.title}
                            </CardTitle>
                            <Badge variant="secondary" className="shrink-0 ml-2">
                              {getResultTypeLabel(result.type)}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          {result.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                              {result.description}
                            </p>
                          )}
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>
                              {result.type === 'meeting' && result.meeting
                                ? formatDate(result.meeting.starts_at)
                                : formatDate(result.created_at)
                              }
                            </span>
                            {result.type === 'document' && result.document && (
                              <span>{result.document.file_type.toUpperCase()}</span>
                            )}
                            {result.type === 'meeting' && result.meeting && (
                              <span>{result.meeting.kind}</span>
                            )}
                            {result.type === 'event' && result.event && (
                              <span>{result.event.status}</span>
                            )}
                            {result.type === 'collab_note' && result.collab_note && (
                              <span className="truncate max-w-[120px]">{result.collab_note.board_title}</span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 검색 안내 */}
          {!query.trim() && (
            <div className="text-center py-12 space-y-4">
              <SearchIcon className="mx-auto h-16 w-16 text-gray-300" />
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  통합 검색
                </h3>
                <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                  스케줄, 문서, 업무 이벤트, 업무, 교육 비디오, 협업 노트 등 모든 데이터에서 검색할 수 있습니다.
                  검색어를 입력해 보세요.
                </p>
              </div>
            </div>
          )}
        </div>
      </PageContainer>

      {/* 상세 다이얼로그들 */}
      {selectedMeeting && (
        <ScheduleDetailDialog
          event={selectedMeeting}
          open={showScheduleDialog}
          onOpenChange={setShowScheduleDialog}
        />
      )}

      {selectedWork && (
        <WorkDetailDialog
          work={selectedWork}
          open={showWorkDialog}
          onOpenChange={setShowWorkDialog}
        />
      )}

      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          open={showTaskDialog}
          onOpenChange={setShowTaskDialog}
        />
      )}

      {/* 문서 미리보기 다이얼로그 */}
      {selectedDocument && (
        <Dialog open={showDocumentDialog} onOpenChange={setShowDocumentDialog}>
          <DialogContent className="w-[90vw] max-w-6xl h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>{selectedDocument.file_name}</span>
                {selectedDocument.meta?.is_google_drive_file && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(documentPreviewUrl, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Google에서 열기
                  </Button>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto min-h-0">
              {selectedDocument.meta?.is_google_drive_file ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <FileText className="h-16 w-16 text-gray-400" />
                  <p className="text-gray-500">Google Drive 파일은 미리보기를 지원하지 않습니다.</p>
                  <p className="text-sm text-gray-400">Google에서 열기 버튼을 클릭하여 파일을 확인하세요.</p>
                  <Button
                    onClick={() => window.open(documentPreviewUrl, '_blank')}
                    variant="default"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Google에서 열기
                  </Button>
                </div>
              ) : selectedDocument.file_type?.startsWith('image/') ? (
                <img
                  src={documentPreviewUrl}
                  alt={selectedDocument.file_name}
                  className="max-w-full h-auto mx-auto"
                />
              ) : selectedDocument.file_type === 'application/pdf' ? (
                <iframe
                  src={documentPreviewUrl}
                  className="w-full h-full border-0"
                  title={selectedDocument.file_name}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <FileText className="h-16 w-16 text-gray-400" />
                  <p className="text-gray-500">이 파일 형식은 미리보기를 지원하지 않습니다.</p>
                  <Button
                    onClick={() => window.open(documentPreviewUrl, '_blank')}
                    variant="outline"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    새 창에서 열기
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Layout>
  );
};

export default Search;