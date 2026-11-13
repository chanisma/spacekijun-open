import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Users, Search, Link, Unlink, RefreshCw, MailWarning } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { checkLinkEmail, needsEmailReview, type LinkEmailCheck } from '@/lib/linkEmailCheck';

interface Profile {
  id: string;
  name: string;
  email: string;
}

interface Resource {
  id: string;
  name: string;
  type: string;
  meta?: { email?: unknown } | null;
}

interface TeacherResourceRow {
  resource: Resource;
  connectedUser: Profile | null;
  /** 명단 이메일 ↔ 연결 계정 로그인 이메일 비교 (이름만으로 연결되므로 관리자가 확인) */
  emailCheck: LinkEmailCheck;
}

export interface TeacherManagementRef {
  refreshData: () => Promise<void>;
}

export const TeacherManagement = forwardRef<TeacherManagementRef>((props, ref) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<TeacherResourceRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyEmailReview, setOnlyEmailReview] = useState(false);

  // Dialog States
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [selectedResourceType, setSelectedResourceType] = useState<Resource | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      // 1. Fetch Teacher Resources
      const { data: resources, error: resError } = await supabase
        .from('resource')
        .select('*')
        .eq('type', 'teacher')
        .order('name');

      if (resError) throw resError;

      // 2. Fetch User-Resource Connections
      const { data: connections, error: conError } = await supabase
        .from('user_resource')
        .select('user_id, resource_id');

      if (conError) throw conError;

      // 3. Fetch All Profiles (for selection and display)
      const { data: allProfiles, error: profError } = await supabase
        .from('profiles')
        .select('id, name, email')
        .not('name', 'is', null) // Filter invalid profiles if necessary
        .order('name');

      if (profError) throw profError;

      setProfiles(allProfiles || []);

      // 4. Build Rows
      const connectionMap = new Map<string, string>(); // resource_id -> user_id
      connections?.forEach(c => connectionMap.set(c.resource_id, c.user_id));

      const profileMap = new Map<string, Profile>();
      allProfiles?.forEach(p => profileMap.set(p.id, p));

      const newRows: TeacherResourceRow[] = (resources || []).map(r => {
        const userId = connectionMap.get(r.id);
        const user = userId ? profileMap.get(userId) || null : null;
        const resource = r as unknown as Resource;
        return {
          resource,
          connectedUser: user,
          emailCheck: checkLinkEmail(resource.meta?.email, user?.email),
        };
      });

      setRows(newRows);

      if (isRefresh) {
        toast({ title: '완료', description: '데이터를 새로고침했습니다.' });
      }
    } catch (error) {
      console.error('Data fetch error:', error);
      toast({ title: '오류', description: '데이터를 불러오지 못했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useImperativeHandle(ref, () => ({
    refreshData: () => fetchData(true),
  }));

  const handleConnect = async () => {
    if (!selectedResourceType || !selectedProfileId) return;

    try {
      const { error } = await supabase
        .from('user_resource')
        .insert({
          user_id: selectedProfileId,
          resource_id: selectedResourceType.id
        });

      if (error) throw error;

      setIsConnectDialogOpen(false);
      setSelectedProfileId(null);
      setSelectedResourceType(null);
      fetchData(); // Refresh list
    } catch (error) {
      console.error('Connection error:', error);
      toast({ title: '오류', description: '연결에 실패했습니다. 이미 연결된 리소스일 수 있습니다.', variant: 'destructive' });
    }
  };

  const handleDisconnect = async (resourceId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('user_resource')
        .delete()
        .eq('resource_id', resourceId)
        .eq('user_id', userId);

      if (error) throw error;

      fetchData();
    } catch (error) {
      console.error('Disconnection error:', error);
      toast({ title: '오류', description: '해제에 실패했습니다.', variant: 'destructive' });
    }
  };

  const openConnectDialog = (resource: Resource) => {
    setSelectedResourceType(resource);
    setSelectedProfileId(null);
    setIsConnectDialogOpen(true);
  };

  const emailReviewCount = rows.filter(row => needsEmailReview(row.emailCheck)).length;

  const filteredRows = rows.filter(row =>
    (!onlyEmailReview || needsEmailReview(row.emailCheck)) && (
      row.resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (row.connectedUser?.name && row.connectedUser.name.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  );

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>교사 리소스 연결 관리</span>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            새로고침
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="리소스명 또는 사용자명 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {/* 이름만으로 스스로 연결되므로, 명단 이메일과 로그인 이메일이 어긋난 연결을 모아 본다 */}
            <Button
              variant="outline"
              size="sm"
              aria-pressed={onlyEmailReview}
              onClick={() => setOnlyEmailReview(v => !v)}
              disabled={emailReviewCount === 0 && !onlyEmailReview}
              className={cn(
                'h-10 shrink-0',
                emailReviewCount > 0 && 'border-amber-300 text-amber-800 hover:bg-amber-50',
                onlyEmailReview && 'bg-amber-100 hover:bg-amber-100',
              )}
              title="명단(resource)에 등록된 이메일과 연결된 계정의 로그인 이메일이 다르거나, 명단 이메일이 비어 있는 연결"
            >
              <MailWarning className="mr-2 h-4 w-4" />
              이메일 확인 필요 {emailReviewCount}
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>리소스 이름 (ID)</TableHead>
                  <TableHead>연결된 사용자</TableHead>
                  <TableHead className="w-[100px]">상태</TableHead>
                  <TableHead className="w-[100px] text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                      {onlyEmailReview ? '이메일을 확인할 연결이 없습니다.' : '검색 결과가 없습니다.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.resource.id}>
                      <TableCell>
                        <div className="font-medium">{row.resource.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{row.resource.id}</div>
                      </TableCell>
                      <TableCell>
                        {row.connectedUser ? (
                          <>
                            <div className="font-medium">{row.connectedUser.name}</div>
                            <div className="break-all text-xs text-muted-foreground">{row.connectedUser.email}</div>
                            {needsEmailReview(row.emailCheck) && (
                              <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                                <div className="flex items-center gap-1 font-medium">
                                  <MailWarning className="h-3.5 w-3.5 shrink-0" />
                                  {row.emailCheck === 'mismatch' ? '이메일 불일치 — 본인인지 확인' : '명단에 이메일 없음 — 비교 불가'}
                                </div>
                                <div className="break-all">
                                  명단: {row.emailCheck === 'mismatch' ? String(row.resource.meta?.email ?? '') : '(없음)'}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground text-sm">- 미연결 -</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.connectedUser ? "default" : "secondary"}>
                          {row.connectedUser ? "연결됨" : "대기"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.connectedUser ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive">
                                <Unlink className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>연결 해제</AlertDialogTitle>
                                <AlertDialogDescription>
                                  선택한 리소스와 사용자의 연결을 해제하시겠습니까?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>취소</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDisconnect(row.resource.id, row.connectedUser!.id)}>
                                  해제
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openConnectDialog(row.resource)}
                          >
                            <Link className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* User Select Dialog */}
        <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>사용자 연결</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Command className="rounded-lg border shadow-md">
                <CommandInput placeholder="사용자 검색..." />
                <CommandList className="max-h-[300px]">
                  <CommandEmpty>사용자를 찾을 수 없습니다.</CommandEmpty>
                  <CommandGroup heading="사용자 목록">
                    {profiles.map((profile) => (
                      <CommandItem
                        key={profile.id}
                        value={`${profile.name} ${profile.email}`} // Search key
                        onSelect={() => setSelectedProfileId(profile.id === selectedProfileId ? null : profile.id)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedProfileId === profile.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex flex-col">
                          <span>{profile.name}</span>
                          <span className="text-xs text-muted-foreground">{profile.email}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsConnectDialogOpen(false)}>취소</Button>
              <Button onClick={handleConnect} disabled={!selectedProfileId}>연결</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </CardContent>
    </Card>
  );
});

TeacherManagement.displayName = 'TeacherManagement';