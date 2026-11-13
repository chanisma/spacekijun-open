import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { saveResourceAccounts } from '@/services/resourceAccountsService';
import {
  ACCOUNT_KINDS,
  accountEntries,
  parseAccounts,
  mergeAccountsIntoMeta,
  type AccountKind,
  type TeacherAccount,
  type TeacherAccounts,
} from '@/utils/teacherAccounts';

export interface AccountResourceRow {
  id: string;
  name: string;
  /** `{ accounts }` 모양 — 계정의 정본은 resource_accounts 표다(`accountsAsMeta`). */
  meta: Record<string, any> | string | null;
}

interface AccountEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 편집 대상 리소스 (null 이면 열지 않음) */
  resource: AccountResourceRow | null;
  onSaved: () => void;
}

/**
 * 한 교사의 외부 서비스 계정(구글/웨일/AI/리로/MS)을 편집하는 모달.
 * 저장 = resource_accounts 표의 그 교사 행 전체 교체(비면 행 삭제).
 *
 * 한 종류에 계정이 여러 개일 수 있으므로(예: 인공지능용 = 교내 발급 + Claude + GPT)
 * 종류마다 계정을 추가·삭제할 수 있고, 계정마다 구분용 라벨을 둔다.
 *
 * 이 모달은 폼 전체를 보여주므로 **빈 필드 = 삭제 의도**다.
 * 따라서 부분 병합이 아니라 accounts 전체를 교체한다(`mergeAccountsIntoMeta`).
 */
export const AccountEditDialog = ({
  open,
  onOpenChange,
  resource,
  onSaved,
}: AccountEditDialogProps) => {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<TeacherAccounts>({});
  const [saving, setSaving] = useState(false);

  // 대상 리소스가 바뀔 때마다 폼을 다시 채운다.
  useEffect(() => {
    if (resource) {
      setAccounts(parseAccounts(resource.meta));
    } else {
      setAccounts({});
    }
  }, [resource]);

  const updateField = (
    kind: AccountKind,
    index: number,
    field: keyof TeacherAccount,
    value: string
  ) => {
    setAccounts((prev) => {
      const list = [...(prev[kind] ?? [])];
      list[index] = { ...list[index], [field]: value };
      return { ...prev, [kind]: list };
    });
  };

  const addAccount = (kind: AccountKind) => {
    setAccounts((prev) => ({ ...prev, [kind]: [...(prev[kind] ?? []), {}] }));
  };

  const removeAccount = (kind: AccountKind, index: number) => {
    setAccounts((prev) => {
      const list = [...(prev[kind] ?? [])];
      list.splice(index, 1);
      return { ...prev, [kind]: list };
    });
  };

  const handleSave = async () => {
    if (!resource) return;
    setSaving(true);
    try {
      const nextMeta = mergeAccountsIntoMeta(resource.meta, accounts);
      // 반영 확인(RLS 차단 = 0행)은 saveResourceAccounts 가 한다.
      await saveResourceAccounts(resource.id, nextMeta.accounts ?? null);

      toast({ title: '저장 완료', description: `${resource.name} 교사의 계정 정보가 저장되었습니다.` });
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error('계정 저장 오류:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '계정 저장에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>계정 정보 편집</DialogTitle>
          <DialogDescription>
            {resource ? `${resource.name} 교사` : ''}의 외부 서비스 계정을 등록/수정합니다.
            한 종류에 계정을 여러 개 둘 수 있고, 비워두면 해당 계정은 저장되지 않습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {ACCOUNT_KINDS.map(({ key, label }) => {
            const list = accountEntries(accounts, key);
            return (
              <div key={key} className="rounded-md border p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold min-w-0 truncate">{label}</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 shrink-0"
                    onClick={() => addAccount(key)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    계정 추가
                  </Button>
                </div>

                {list.length === 0 && (
                  <p className="text-xs text-muted-foreground">등록된 계정이 없습니다.</p>
                )}

                {list.map((acc, index) => (
                  <div
                    key={index}
                    className="rounded-md border bg-muted/20 p-2 space-y-2"
                  >
                    <div className="flex items-end gap-2">
                      <div className="grid gap-1 flex-1 min-w-0">
                        <Label
                          htmlFor={`${key}-${index}-label`}
                          className="text-xs text-muted-foreground"
                        >
                          구분 이름
                        </Label>
                        <Input
                          id={`${key}-${index}-label`}
                          value={acc.label || ''}
                          onChange={(e) => updateField(key, index, 'label', e.target.value)}
                          placeholder={key === 'ai' ? '예: Claude / GPT / Gemini' : '선택 (예: 업무용)'}
                          className="h-9 text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeAccount(key, index)}
                        title="이 계정 삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="grid gap-1 min-w-0">
                        <Label
                          htmlFor={`${key}-${index}-id`}
                          className="text-xs text-muted-foreground"
                        >
                          아이디
                        </Label>
                        <Input
                          id={`${key}-${index}-id`}
                          value={acc.id || ''}
                          onChange={(e) => updateField(key, index, 'id', e.target.value)}
                          placeholder="아이디 / 이메일"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="grid gap-1 min-w-0">
                        <Label
                          htmlFor={`${key}-${index}-pw`}
                          className="text-xs text-muted-foreground"
                        >
                          비밀번호
                        </Label>
                        <Input
                          id={`${key}-${index}-pw`}
                          value={acc.password || ''}
                          onChange={(e) => updateField(key, index, 'password', e.target.value)}
                          placeholder="비밀번호"
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid gap-1 min-w-0">
                      <Label
                        htmlFor={`${key}-${index}-note`}
                        className="text-xs text-muted-foreground"
                      >
                        비고
                      </Label>
                      <Input
                        id={`${key}-${index}-note`}
                        value={acc.note || ''}
                        onChange={(e) => updateField(key, index, 'note', e.target.value)}
                        placeholder="메모 (선택)"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={saving || !resource}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
