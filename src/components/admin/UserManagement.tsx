import { useState, useEffect, useMemo } from 'react';
import { Users, Search, MoreHorizontal, UserPlus, UserCog, UserCheck, GraduationCap, Building2, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { useDropdownDialog } from '@/hooks/useDropdownDialog';
import { UserCreateDialog } from './UserCreateDialog';
import { UserEditDialog } from './UserEditDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { AppRole } from '@/lib/roles';
import { ROLE_META, ROLE_ORDER, resolveDisplayRole } from './userRoles';

interface StudentMeta {
  grade: number;
  classNum: number;
  number: number | null;
  studentCode: string; // 이메일 prefix (= student_basic_info.id)
}

interface UserProfile {
  id: string;
  email: string;
  name?: string;
  nickname?: string;
  role?: string;
  is_first_login?: boolean;
  last_login?: string;
  visit_count?: number;
  created_at: string;
  student_meta?: StudentMeta;
  initialTab?: string; // For dialog control
}

const isStudentRow = (u: Pick<UserProfile, 'role' | 'email'>) => resolveDisplayRole(u) === 'student';

export const UserManagement = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const { triggerDialog, dropdownContentProps } = useDropdownDialog();
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<'all' | AppRole>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // ── 정렬 상태 ──
  // 기본: 가입일 내림차순 (Supabase 쿼리 order와 동일하므로 첫 렌더 안정성 유지)
  type SortField = 'name' | 'role' | 'last_login' | 'visit_count' | 'created_at';
  type SortOrder = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      // 다른 컬럼 클릭 시 — 시간/숫자 컬럼은 desc(최신/큰값 우선),
      // 텍스트(name/role)는 asc(가나다순)로 첫 토글 방향을 직관적으로 맞춤
      setSortField(field);
      setSortOrder(field === 'name' || field === 'role' ? 'asc' : 'desc');
    }
    setCurrentPage(1);
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortOrder === 'asc'
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />;
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('사용자 조회 오류:', error);
        toast({
          title: '오류',
          description: '사용자 목록을 불러오는데 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }

      const rawUsers = (data || []) as UserProfile[];

      // 학생 prefix 수집 → student_basic_info에서 한 번에 학년/반/번호 가져오기
      const studentCodes = rawUsers
        .filter(isStudentRow)
        .map((u) => u.email.split('@')[0]);

      let studentMetaMap = new Map<string, StudentMeta>();
      if (studentCodes.length > 0) {
        const { data: basicData, error: basicError } = await supabase
          .from('student_basic_info')
          .select('id, grade, class_num, number')
          .in('id', studentCodes);

        if (basicError) {
          console.error('학생 기본정보 조회 오류:', basicError);
        } else if (basicData) {
          studentMetaMap = new Map(
            basicData.map((row: any) => [
              row.id as string,
              {
                studentCode: row.id as string,
                grade: row.grade as number,
                classNum: row.class_num as number,
                number: (row.number as number | null) ?? null,
              },
            ])
          );
        }
      }

      const enriched: UserProfile[] = rawUsers.map((u) => {
        if (!isStudentRow(u)) return u;
        const code = u.email.split('@')[0];
        const meta = studentMetaMap.get(code);
        return meta ? { ...u, student_meta: meta } : u;
      });

      setUsers(enriched);
    } catch (error) {
      console.error('사용자 조회 중 오류:', error);
      toast({
        title: '오류',
        description: '사용자 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // 검색·역할 필터 적용 — early return 전에 호출되어야 hook 순서 안정성 유지
  const filteredUsers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return users.filter((user) => {
      // 학년/반 검색을 위해 '1-3' 또는 '1학년 3반' 패턴도 지원
      const classLabel = user.student_meta
        ? `${user.student_meta.grade}학년 ${user.student_meta.classNum}반 ${user.student_meta.number ?? ''}번 ${user.student_meta.grade}-${user.student_meta.classNum}`
        : '';

      const matchesSearch =
        !q ||
        user.email.toLowerCase().includes(q) ||
        user.name?.toLowerCase().includes(q) ||
        user.nickname?.toLowerCase().includes(q) ||
        classLabel.toLowerCase().includes(q);

      if (selectedRole === 'all') return matchesSearch;
      return matchesSearch && resolveDisplayRole(user) === selectedRole;
    });
  }, [users, searchTerm, selectedRole]);

  // 정렬 적용 — 필터를 통과한 행에 대해 클라이언트 사이드 정렬
  const sortedUsers = useMemo(() => {
    const copy = [...filteredUsers];
    const dir = sortOrder === 'asc' ? 1 : -1;
    const cmpString = (a: string, b: string) => a.localeCompare(b, 'ko');
    const toTime = (v?: string | null) => (v ? new Date(v).getTime() : 0);
    const nameOf = (u: UserProfile) => u.name ?? u.nickname ?? '';
    const roleOf = (u: UserProfile) => ROLE_META[resolveDisplayRole(u)].label;

    // 이름 정렬일 때 학생끼리는 학년→반→번호로 먼저 정렬되게 보조 키 적용
    const studentKey = (u: UserProfile) => {
      const m = u.student_meta;
      if (!m) return Number.MAX_SAFE_INTEGER;
      return m.grade * 100000 + m.classNum * 1000 + (m.number ?? 999);
    };

    copy.sort((a, b) => {
      switch (sortField) {
        case 'name': {
          const aStudent = isStudentRow(a);
          const bStudent = isStudentRow(b);
          if (aStudent && bStudent) {
            const diff = studentKey(a) - studentKey(b);
            if (diff !== 0) return diff * dir;
          }
          return cmpString(nameOf(a), nameOf(b)) * dir;
        }
        case 'role':
          return cmpString(roleOf(a), roleOf(b)) * dir;
        case 'last_login':
          return (toTime(a.last_login) - toTime(b.last_login)) * dir;
        case 'visit_count':
          return ((a.visit_count ?? 0) - (b.visit_count ?? 0)) * dir;
        case 'created_at':
          return (toTime(a.created_at) - toTime(b.created_at)) * dir;
        default:
          return 0;
      }
    });
    return copy;
  }, [filteredUsers, sortField, sortOrder]);

  const getRoleBadge = (user: UserProfile) => {
    const meta = ROLE_META[resolveDisplayRole(user)];
    return <Badge className={`${meta.badgeClass} border-0`}>{meta.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/3" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[400px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Stats calculation
  const roleCounts = ROLE_ORDER.reduce(
    (acc, r) => ({ ...acc, [r]: 0 }),
    {} as Record<AppRole, number>,
  );
  users.forEach((u) => { roleCounts[resolveDisplayRole(u)] += 1; });
  const totalUsers = users.length;
  const ROLE_ICON: Record<AppRole, typeof Users> = {
    teacher: UserCheck,
    staff: Building2,
    student: GraduationCap,
    admin: UserCog,
  };

  // Pagination logic — filteredUsers/sortedUsers는 위쪽 useMemo에서 계산됨
  const totalPages = Math.ceil(sortedUsers.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const visibleUsers = sortedUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      // 한글 이름인 경우 (2~4글자)
      if (/^[가-힣]+$/.test(name)) {
        // 3글자 이상인 경우 뒤에서 2글자 반환 (홍길동 -> 길동)
        // 2글자인 경우 그대로 반환 (허준 -> 허준) - 1글자만 보여주면 시각적으로 비어보임
        return name.length >= 3 ? name.slice(-2) : name;
      }
      return name.slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return 'U';
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">프로필 관리</h2>
          <p className="text-muted-foreground">
            시스템에 등록된 교사·직원·학생 프로필을 관리합니다.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="shadow-sm">
          <UserPlus className="h-4 w-4 mr-2" />
          교사 추가
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
          </CardContent>
        </Card>
        {ROLE_ORDER.map((r) => {
          const Icon = ROLE_ICON[r];
          return (
            <Card key={r}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{ROLE_META[r].label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{roleCounts[r]}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>사용자 목록</CardTitle>
              <CardDescription className="mt-1">
                등록된 교사·직원·학생·관리자 계정의 상태와 마지막 로그인을 확인합니다.
              </CardDescription>
            </div>
            <Tabs value={selectedRole} onValueChange={(v) => {
              setSelectedRole(v as 'all' | AppRole);
              setCurrentPage(1);
            }} className="w-full md:w-auto">
              <TabsList className="grid w-full grid-cols-5 md:w-[480px]">
                <TabsTrigger value="all">전체</TabsTrigger>
                {ROLE_ORDER.map((r) => (
                  <TabsTrigger key={r} value={r}>{ROLE_META[r].label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="relative mt-4">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="이름, 이메일, 학번, 학년·반으로 검색..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead
                    className="w-[300px] cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <span className="inline-flex items-center gap-1">사용자 {sortIndicator('name')}</span>
                  </TableHead>
                  <TableHead
                    className="w-[100px] text-center cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('role')}
                  >
                    <span className="inline-flex items-center gap-1 justify-center">역할 {sortIndicator('role')}</span>
                  </TableHead>
                  <TableHead
                    className="hidden md:table-cell cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('last_login')}
                  >
                    <span className="inline-flex items-center gap-1">마지막 로그인 {sortIndicator('last_login')}</span>
                  </TableHead>
                  <TableHead
                    className="text-center hidden md:table-cell cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('visit_count')}
                  >
                    <span className="inline-flex items-center gap-1 justify-center">접속 {sortIndicator('visit_count')}</span>
                  </TableHead>
                  <TableHead
                    className="hidden lg:table-cell cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('created_at')}
                  >
                    <span className="inline-flex items-center gap-1">가입일 {sortIndicator('created_at')}</span>
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      {searchTerm ? '검색 결과가 없습니다.' : '등록된 사용자가 없습니다.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleUsers.map((user) => {
                    const meta = user.student_meta;
                    const classLabel = meta
                      ? `${meta.grade}학년 ${meta.classNum}반${meta.number != null ? ` ${meta.number}번` : ''}`
                      : null;
                    const avatarClass = ROLE_META[resolveDisplayRole(user)].avatarClass;

                    return (
                      <TableRow key={user.id} className="hover:bg-muted/5 group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className={avatarClass}>
                                {getInitials(user.name, user.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                                {user.name || user.nickname || '이름 미설정'}
                                {classLabel && (
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    {classLabel}
                                  </span>
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground font-light">
                                {user.email}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {getRoleBadge(user)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {user.last_login ? (
                            <div className="text-sm">
                              {format(new Date(user.last_login), 'yyyy.MM.dd HH:mm', { locale: ko })}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          <span className="text-sm font-mono text-muted-foreground">
                            {user.visit_count ? `${user.visit_count}` : '0'}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(user.created_at), 'yyyy.MM.dd', { locale: ko })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" {...dropdownContentProps}>
                              <DropdownMenuItem
                                onSelect={() => triggerDialog(() => {
                                  setSelectedUser({ ...user, initialTab: 'info' });
                                  setShowEditDialog(true);
                                })}
                              >
                                정보 수정
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => triggerDialog(() => {
                                  setSelectedUser({ ...user, initialTab: 'role' });
                                  setShowEditDialog(true);
                                })}
                              >
                                역할 변경
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => triggerDialog(() => {
                                  setSelectedUser({ ...user, initialTab: 'account' });
                                  setShowEditDialog(true);
                                })}
                              >
                                계정 관리
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-end space-x-2 py-4 px-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                {'<<'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                {'<'}
              </Button>
              <span className="text-sm text-muted-foreground min-w-[80px] text-center font-mono">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
              >
                {'>'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
              >
                {'>>'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <UserCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={fetchUsers}
      />

      <UserEditDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        user={selectedUser}
        initialTab={selectedUser?.initialTab || 'info'}
        onSuccess={fetchUsers}
      />
    </div>
  );
};
