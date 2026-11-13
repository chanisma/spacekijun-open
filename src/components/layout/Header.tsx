import { Bell, User, Settings, AlertTriangle, Phone, Eye, EyeOff, GraduationCap, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNotifications } from '@/hooks/useNotifications';
import { Link, useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useState, useEffect, useCallback } from 'react';
import { useDropdownDialog } from '@/hooks/useDropdownDialog';
import { useAuth } from '@/components/auth/AuthProvider';
import { useProfile } from '@/hooks/useProfile';
import { ProfileEditDialog } from '@/components/profile/ProfileEditDialog';
import { MealPopup } from '@/components/meal/MealPopup';
import ActionSearchBar from '@/components/ui/action-search-bar';
import { supabase } from '@/integrations/supabase/client';
import { TeacherTagPreviewControl } from '@/features/teacher-dashboard/components/TeacherTagPreviewControl';
import { StaffPreviewControl } from '@/components/layout/StaffPreviewControl';
import { PersonalDeviceToggle } from '@/components/profile/PersonalDeviceToggle';

interface HeaderProps {
  isBlocked?: boolean;
}

export const Header = ({ isBlocked = false }: HeaderProps) => {
  const { data: notifications = [] } = useNotifications();
  const unreadCount = notifications.filter(notification => !notification.is_read).length;
  // 미리보기 컨트롤은 미리보기 중에도 살아 있어야 하므로 isAdmin이 아니라 isRealAdmin을 쓴다.
  const { user, profile, signOut, hasNameRegistered, isAdmin, isRealAdmin, isStudentView, setViewAsStudent, viewAsStudentId, setViewAsStudentId } = useAuth();
  // tri-state: profile이 없으면 null (역할 미결정).
  // 교사 분기 `isStudent === false`로 명시 비교해야 FOUC 없음.
  const isStudent: boolean | null = profile ? isStudentView : null;
  const { profile: userProfile, updateProfile, loading: profileLoading } = useProfile();
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const { triggerDialog, dropdownContentProps } = useDropdownDialog();
  const navigate = useNavigate();

  // Student selector for admin preview mode
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState<Array<{ id: string; name: string; grade: number; class_num: number }>>([]);
  const [studentSelectorOpen, setStudentSelectorOpen] = useState(false);
  const [selectedStudentName, setSelectedStudentName] = useState<string>('');

  const searchStudents = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setStudentResults([]);
      return;
    }
    const { data } = await supabase
      .from('student_basic_info')
      .select('id, name, grade, class_num')
      .or(`name.ilike.%${query}%,id.ilike.%${query}%`)
      .order('grade')
      .order('class_num')
      .limit(20);
    setStudentResults((data ?? []).flatMap((student) => (
      student.name
        ? [{
            id: student.id,
            name: student.name,
            grade: student.grade ?? 0,
            class_num: student.class_num ?? 0,
          }]
        : []
    )));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchStudents(studentSearch), 300);
    return () => clearTimeout(timer);
  }, [studentSearch, searchStudents]);

  const handleSelectStudent = (student: { id: string; name: string }) => {
    setViewAsStudentId(student.id);
    setViewAsStudent(true);
    setSelectedStudentName(student.name);
    setStudentSelectorOpen(false);
    setStudentSearch('');
  };

  const handleExitStudentView = () => {
    setViewAsStudent(false);
    setViewAsStudentId(null);
    setSelectedStudentName('');
  };

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4">
        <div className={`flex items-center gap-2 ${isBlocked ? 'blur-sm pointer-events-none' : ''}`}>
          <h1 className="text-xl font-semibold cursor-pointer" onClick={() => navigate('/')}>
            {isStudent === true ? 'SPACEKIJUN FOR STUDENT' : 'SPACEKIJUN'}
          </h1>
          {isRealAdmin && isStudent === false &&(
            <Popover open={studentSelectorOpen} onOpenChange={setStudentSelectorOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full text-muted-foreground hover:bg-blue-50 hover:text-blue-600"
                  title="학생 화면 미리보기"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="start">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">학번 또는 이름으로 검색</p>
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="예: 00-00472 또는 홍길동"
                    className="w-full px-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  {studentResults.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {studentResults.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleSelectStudent(s)}
                          className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-blue-50 flex items-center justify-between"
                        >
                          <span className="font-medium">{s.name}</span>
                          <span className="text-xs text-muted-foreground">{s.grade}-{s.class_num} · {s.id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {studentSearch && studentResults.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">검색 결과 없음</p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {isRealAdmin && isStudent === false &&<TeacherTagPreviewControl />}
          {isRealAdmin && isStudent === false &&<StaffPreviewControl />}
          {isRealAdmin && isStudent === true && (
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1">
              <GraduationCap className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-xs font-medium text-blue-700">{selectedStudentName || viewAsStudentId}</span>
              <button
                onClick={handleExitStudentView}
                className="h-4 w-4 rounded-full hover:bg-blue-200 flex items-center justify-center ml-0.5"
                title="교사 화면으로 돌아가기"
              >
                <X className="h-3 w-3 text-blue-600" />
              </button>
            </div>
          )}
        </div>

        {/* 중앙에 검색바 추가 */}
        {isStudent === false && (
          <div className={`flex-1 max-w-md mx-auto ${isBlocked ? 'blur-sm pointer-events-none' : ''}`}>
            <ActionSearchBar
              compact
              onScheduleCreate={() => navigate('/schedule?create=true')}
              onWorkCreate={() => navigate('/tasks/mine?create=true')}
              onDocumentUpload={() => navigate('/documents?upload=true')}
            />
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {/* 개인기기(자동 로그인) ON/OFF — 누르면 확인창이 먼저 뜬다 */}
          <div className={isBlocked ? 'blur-sm pointer-events-none' : ''}>
            <PersonalDeviceToggle />
          </div>

          {/* 급식 정보 */}
          <div className={isBlocked ? 'blur-sm pointer-events-none' : ''}>
            <MealPopup />
          </div>

          {/* 전화번호부 (교사 전용) */}
          {isStudent === false && (
            <div className={isBlocked ? 'blur-sm pointer-events-none' : ''}>
              <Button variant="ghost" size="icon" onClick={() => navigate('/calls')}>
                <Phone className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* 알림 (교사 전용) */}
          {isStudent === false && (
            <div className={isBlocked ? 'blur-sm pointer-events-none' : ''}>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => navigate('/notifications')}
                aria-label={unreadCount > 0 ? `알림, 읽지 않은 알림 ${unreadCount}개` : '알림'}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full p-0 text-xs"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Badge>
                )}
              </Button>
            </div>
          )}

          {/* 사용자 프로필 드롭다운 - 블러 처리 제외 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <User className="h-4 w-4" />
                {hasNameRegistered === false && (
                  <AlertTriangle className="absolute -top-1 -right-1 h-3 w-3 text-orange-500" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56" {...dropdownContentProps}>
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {user?.email?.split('@')[0] || '사용자'}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {profile && profile.role !== 'student' && (
                <>
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      프로필
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => triggerDialog(() => setShowProfileEdit(true))} className="relative">
                    <Settings className="h-4 w-4 mr-2" />
                    설정
                    {hasNameRegistered === false && (
                      <AlertTriangle className="h-3 w-3 text-orange-500 ml-auto" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => signOut()}>
                로그아웃
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {userProfile && (
        <ProfileEditDialog
          open={showProfileEdit}
          onOpenChange={setShowProfileEdit}
          profile={userProfile}
          onSave={updateProfile}
          updating={profileLoading}
        />
      )}
    </header>
  );
};
