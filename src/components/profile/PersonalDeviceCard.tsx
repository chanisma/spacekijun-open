import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';

export function PersonalDeviceCard() {
  const { isPersonalDevice, setPersonalDeviceEnabled } = useAuth();
  const [saving, setSaving] = useState(false);

  const changeRegistration = async (enabled: boolean) => {
    setSaving(true);
    try {
      await setPersonalDeviceEnabled(enabled);
      toast.success(enabled
        ? '개인기기로 등록했습니다. 다음 방문에도 로그인이 유지됩니다.'
        : '개인기기 등록을 해제했습니다. 다음 새벽 5시부터 자동 로그아웃이 적용됩니다.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '개인기기 설정을 변경하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>개인기기 및 자동 로그인</CardTitle>
        <CardDescription>본인만 사용하는 기기에서 로그인 상태를 유지하세요.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="personal-device">이 브라우저를 개인기기로 등록</Label>
          <Switch
            id="personal-device"
            checked={isPersonalDevice}
            disabled={saving}
            onCheckedChange={changeRegistration}
            aria-describedby="personal-device-description"
          />
        </div>
        <p id="personal-device-description" className="text-sm leading-6 text-muted-foreground">
          등록하면 매일 새벽 5시에도 로그아웃되지 않으며, 브라우저를 다시 열면 자동 로그인됩니다.
          이 계정과 현재 브라우저에만 적용됩니다. 공용 PC에서는 등록하지 마세요.
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          직접 로그아웃하면 등록도 해제됩니다. 브라우저 데이터 삭제 또는 인증 만료·해제 시에는 다시 로그인해야 합니다.
          Google Drive·Calendar 연결은 별도 재인증이 필요할 수 있습니다.
        </p>
      </CardContent>
    </Card>
  );
}
