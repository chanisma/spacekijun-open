import { useState, useEffect } from 'react';
import { DialogFooter,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { AlertCircle, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import type { AppRole } from '@/lib/roles';
import { ROLE_META, ROLE_ORDER, resolveDisplayRole } from './userRoles';

/** 역할을 바꿀 때 알아 둘 것 — 바꾼 뒤 그 사람이 실제로 무엇을 겪는지 */
const ROLE_CHANGE_NOTE: Partial<Record<AppRole, string>> = {
  teacher: '교직원 명단(resource)에 연결된 계정만 기능을 쓸 수 있습니다. 연결된 명단 종류가 «직원»이면 그 사람이 이름 등록을 다시 할 때 직원으로 맞춰질 수 있습니다.',
  staff: '직원은 학생 정보·교무 화면(생기부·모의고사·시간표 등)을 쓸 수 없습니다. 연결된 명단 종류가 «교사»면 그 사람이 이름 등록을 다시 할 때 교사로 맞춰질 수 있습니다.',
  student: '학생은 이메일 학번(NN-NNNNN)이 재학생 명단과 맞아야 기능을 쓸 수 있습니다.',
  admin: '관리자는 시스템의 모든 데이터에 접근하고 설정을 변경할 수 있습니다.',
};

interface User {
  id: string;
  name?: string;
  email: string;
  role?: string;
  visit_count?: number;
}

interface UserEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  initialTab?: string;
  onSuccess: () => void;
}

export const UserEditDialog = ({
  open,
  onOpenChange,
  user,
  initialTab = 'info',
  onSuccess,
}: UserEditDialogProps) => {
  // Rules of Hooks: 모든 훅은 조기 return보다 위에서, 매 렌더 동일한 순서로 호출돼야 한다.
  // user는 null일 수 있으므로(다이얼로그가 항상 마운트된 채 user=null로 시작) 옵셔널 접근으로 안전화하고,
  // 조기 return은 훅들 아래로 둔다.
  const [activeTab, setActiveTab] = useState(initialTab);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user: authUser } = useAuth();
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    role: user ? resolveDisplayRole(user) : 'teacher',
  });

  // Sync active tab when dialog opens
  useEffect(() => {
    if (open && user) {
      setActiveTab(initialTab);
      // Reset delete state
      setDeleteConfirmation('');
      setIsDeleting(false);
      // Reset form data to current user state
      setFormData({
        name: user.name || '',
        email: user.email || '',
        role: resolveDisplayRole(user),
      });
    }
  }, [open, initialTab, user]);

  if (!user) return null;

  const originalRole = resolveDisplayRole(user);
  const roleChanged = formData.role !== originalRole;
  // 자기 관리자 권한을 내려놓으면 이 화면(=되돌릴 유일한 곳)에서 바로 쫓겨난다.
  const demotingSelf = authUser?.id === user.id && originalRole === 'admin' && formData.role !== 'admin';

  const handleSave = async () => {
    if (demotingSelf) {
      toast.error('내 관리자 권한은 여기서 내릴 수 없습니다. 다른 관리자에게 요청하세요.');
      return;
    }
    try {
      setSaving(true);
      const { data, error } = await supabase
        .from('profiles')
        .update({ name: formData.name, role: formData.role })
        .eq('id', user.id)
        .select('id');

      if (error) throw error;
      // RLS 차단은 오류가 아니라 0행으로 온다 — 실제로 반영됐는지 확인
      if (!data || data.length === 0) throw new Error('변경이 반영되지 않았습니다(권한 없음).');

      if (roleChanged) {
        toast.success(`${user.name || user.email}: ${ROLE_META[originalRole].label} → ${ROLE_META[formData.role as AppRole].label}`);
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('사용자 정보 수정 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (deleteConfirmation !== '삭제') {
      toast.error("'삭제'를 정확히 입력해주세요.");
      return;
    }

    try {
      setIsDeleting(true);
      // Delete profile from 'profiles' table.
      // Note: This does not delete from auth.users (requires admin API), but removes access to the app.
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);

      if (error) throw error;

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('사용자 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>사용자 관리 - {user.name || user.email}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info">기본 정보</TabsTrigger>
            <TabsTrigger value="role">역할 설정</TabsTrigger>
            <TabsTrigger value="account" className="text-red-500 data-[state=active]:text-red-600">계정 관리</TabsTrigger>
          </TabsList>

          {/* --- Tab 1: Info --- */}
          <TabsContent value="info" className="space-y-4 py-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  value={formData.email}
                  disabled
                  className="bg-slate-100"
                />
              </div>

              <div className="grid gap-2">
                <Label>접속 횟수</Label>
                <Input
                  value={user.visit_count ? `${user.visit_count}회` : '0회'}
                  disabled
                  className="bg-slate-100"
                />
              </div>

            </div>
            <DialogFooter className="flex justify-end pt-4">
              <Button onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장'}</Button>
            </DialogFooter>
          </TabsContent>

          {/* --- Tab 2: Role --- */}
          <TabsContent value="role" className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="role">사용자 역할</Label>
              <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_ORDER.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_META[r].label}
                      <span className="ml-2 text-xs text-muted-foreground">{ROLE_META[r].description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                현재 역할: <span className="font-medium text-foreground">{ROLE_META[originalRole].label}</span>
              </p>
            </div>

            {roleChanged && (
              <Alert variant={demotingSelf ? 'destructive' : 'default'}>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>
                  {demotingSelf ? '내 관리자 권한은 내릴 수 없습니다' : `${ROLE_META[originalRole].label} → ${ROLE_META[formData.role as AppRole].label}`}
                </AlertTitle>
                <AlertDescription>
                  {demotingSelf
                    ? '저장하면 이 관리 화면에서 바로 나가게 되어 되돌릴 수 없습니다. 다른 관리자에게 요청하세요.'
                    : ROLE_CHANGE_NOTE[formData.role as AppRole]}
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter className="flex justify-end pt-4">
              <Button onClick={handleSave} disabled={saving || demotingSelf}>
                {saving ? '저장 중...' : '저장'}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* --- Tab 3: Account --- */}
          <TabsContent value="account" className="space-y-4 py-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <h3 className="text-sm font-semibold text-red-800 flex items-center gap-2 mb-2">
                <Trash2 className="h-4 w-4" />
                위험 구역
              </h3>
              <p className="text-sm text-red-600 mb-4">
                사용자를 삭제하면 프로필 정보가 영구적으로 제거되며, 더 이상 서비스를 이용할 수 없습니다.
                (확인을 위해 아래 입력창에 <strong>삭제</strong>라고 입력해주세요.)
              </p>

              <div className="flex gap-2">
                <Input
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="'삭제' 입력"
                  className="bg-white"
                />
                <Button
                  variant="destructive"
                  onClick={handleDeleteUser}
                  disabled={deleteConfirmation !== '삭제' || isDeleting}
                >
                  {isDeleting ? '삭제 중...' : '사용자 삭제'}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
