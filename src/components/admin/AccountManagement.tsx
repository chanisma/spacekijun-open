import { useEffect, useState } from 'react';
import { KeyRound, Search, RefreshCw, Pencil, FileSpreadsheet, Check, Minus } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  ACCOUNT_KINDS,
  accountEntries,
  accountEntryLabel,
  countRegisteredAccounts,
  parseAccounts,
  type TeacherAccounts,
} from '@/utils/teacherAccounts';
import { accountsAsMeta, fetchResourceAccounts } from '@/services/resourceAccountsService';
import { AccountEditDialog, type AccountResourceRow } from './AccountEditDialog';
import { AccountExcelImport } from './AccountExcelImport';

interface TeacherRow {
  id: string;
  name: string;
  meta: Record<string, any> | string | null;
  accounts: TeacherAccounts;
}

/**
 * 관리자 계정 관리 탭.
 * type='teacher' 리소스 전체를 표로 나열하고, 계정 종류별 등록 여부를 배지로 표시.
 * 개별 편집은 모달, 다수 등록은 엑셀 일괄 업로드.
 */
export const AccountManagement = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [editing, setEditing] = useState<AccountResourceRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('resource')
        .select('id, name')
        .eq('type', 'teacher')
        .order('name');

      if (error) throw error;

      // 계정은 resource.meta 가 아니라 resource_accounts 표에 있다(2026-10-13 — 학생 노출 차단).
      // 아래 편집 모달은 { accounts } 모양의 meta 를 받아 그대로 병합한다.
      const accountsById = await fetchResourceAccounts();

      const mapped: TeacherRow[] = (data || []).map((r) => {
        const meta = accountsAsMeta(accountsById.get(r.id));
        return {
          id: r.id,
          name: r.name,
          meta,
          accounts: parseAccounts(meta),
        };
      });

      setRows(mapped);
      if (isRefresh) toast({ title: '완료', description: '데이터를 새로고침했습니다.' });
    } catch (error) {
      console.error('계정 데이터 조회 오류:', error);
      toast({ title: '오류', description: '데이터를 불러오지 못했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openEdit = (row: TeacherRow) => {
    setEditing({ id: row.id, name: row.name, meta: row.meta });
    setEditOpen(true);
  };

  const filteredRows = rows.filter((row) =>
    row.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center space-x-2">
            <KeyRound className="h-5 w-5" />
            <span>교사 계정 관리</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setExcelOpen(true)}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              엑셀 일괄 등록
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing}>
              <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
              새로고침
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground pt-1">
          교사별 구글·웨일스페이스·인공지능용·리로스쿨·마이크로소프트 계정을 등록/관리합니다.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="교사 이름 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[100px]">교사</TableHead>
                  {ACCOUNT_KINDS.map((k) => (
                    <TableHead key={k.key} className="text-center whitespace-nowrap">
                      {k.label.replace(/\s*계정$/, '')}
                    </TableHead>
                  ))}
                  <TableHead className="w-[80px] text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={ACCOUNT_KINDS.length + 2} className="text-center h-24 text-muted-foreground">
                      검색 결과가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      {ACCOUNT_KINDS.map((k) => {
                        const entries = accountEntries(row.accounts, k.key);
                        // 한 종류에 계정이 여러 개일 수 있으므로 개수까지 보여준다.
                        const count = countRegisteredAccounts(row.accounts, k.key);
                        const summary = entries
                          .map((acc, i) => accountEntryLabel(acc, i, entries.length) || acc.id || '')
                          .filter(Boolean)
                          .join(', ');
                        return (
                          <TableCell key={k.key} className="text-center">
                            {count > 0 ? (
                              <Badge
                                className="bg-green-500 hover:bg-green-500/90 gap-1"
                                title={summary}
                              >
                                <Check className="h-3 w-3" />
                                {count > 1 ? `등록 ${count}` : '등록'}
                              </Badge>
                            ) : (
                              <span className="inline-flex text-muted-foreground/50">
                                <Minus className="h-4 w-4" />
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <AccountEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          resource={editing}
          onSaved={() => fetchData()}
        />

        <AccountExcelImport
          open={excelOpen}
          onOpenChange={setExcelOpen}
          onImportComplete={() => fetchData()}
        />
      </CardContent>
    </Card>
  );
};
