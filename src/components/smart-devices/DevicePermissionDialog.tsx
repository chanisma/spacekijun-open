import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, UserPlus, Trash2, Shield } from 'lucide-react';
import {
  useDevicePermissions,
  useGrantPermission,
  useRevokePermission,
} from '@/hooks/useSmartDevices';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DevicePermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DevicePermissionDialog({ open, onOpenChange }: DevicePermissionDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; email: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const { data: permissions, isLoading } = useDevicePermissions();
  const grantPermission = useGrantPermission();
  const revokePermission = useRevokePermission();
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);

    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, email')
        .or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .eq('role', 'teacher')
        .limit(10);

      // 이미 권한이 있는 사용자 제외
      const existingIds = new Set(permissions?.map(p => p.user_id) ?? []);
      setSearchResults(
        (data ?? []).filter(u => !existingIds.has(u.id))
      );
    } catch {
      toast({ title: '검색 실패', variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const handleGrant = async (userId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await grantPermission.mutateAsync({ userId, grantedBy: user.id });
    setSearchResults(prev => prev.filter(u => u.id !== userId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            스마트 기기 제어 권한 관리
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 현재 권한 목록 */}
          <div>
            <h4 className="text-sm font-medium mb-2">제어 권한 보유 교사</h4>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                불러오는 중...
              </div>
            ) : permissions && permissions.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {permissions.map((perm) => (
                  <div
                    key={perm.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                  >
                    <div>
                      <p className="text-sm font-medium">{perm.user_name || '알 수 없음'}</p>
                      <p className="text-xs text-muted-foreground">{perm.user_email}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => revokePermission.mutate(perm.user_id)}
                      disabled={revokePermission.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                관리자 외 제어 권한이 부여된 교사가 없습니다.
              </p>
            )}
          </div>

          {/* 교사 검색 + 권한 부여 */}
          <div>
            <h4 className="text-sm font-medium mb-2">교사 추가</h4>
            <div className="flex gap-2">
              <Input
                placeholder="이름 또는 이메일로 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button
                variant="outline"
                onClick={handleSearch}
                disabled={searching || !searchQuery.trim()}
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : '검색'}
              </Button>
            </div>

            {searchResults.length > 0 && (
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {searchResults.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-muted/50"
                  >
                    <div>
                      <p className="text-sm">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleGrant(user.id)}
                      disabled={grantPermission.isPending}
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      권한 부여
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
