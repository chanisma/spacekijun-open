import { useState, useEffect, useRef } from 'react';
import { DialogFooter,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pen, Trash2, Upload } from 'lucide-react';
import { Profile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { uploadSignatureToStorage, deleteSignatureFromStorage, uploadStampToStorage, deleteStampFromStorage } from '@/lib/signatureStorage';
import { NotificationService } from '@/services/notificationService';
import { unifiedAuth } from '@/services/unifiedAuth';
import { findLinkableResourceByName } from '@/lib/resourceLink';
import type { Json } from '@/integrations/supabase/types';

interface ProfileEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  onSave: (updates: Partial<Profile>) => Promise<boolean>;
  updating: boolean;
  onTeacherManagementRefresh?: () => void;
}

export const ProfileEditDialog = ({
  open,
  onOpenChange,
  profile,
  onSave,
  updating,
  onTeacherManagementRefresh,
}: ProfileEditDialogProps) => {
  const { refreshNameStatus, refreshProfile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: profile.name || '',
    email: profile.email || '',
  });
  const [signatureData, setSignatureData] = useState<string | null>(profile.signature || null);
  const [isUpdatingSignature, setIsUpdatingSignature] = useState(false);
  const [stampFile, setStampFile] = useState<File | null>(null);
  const [stampPreviewUrl, setStampPreviewUrl] = useState<string | null>(profile.stamp || null);
  const [isUpdatingStamp, setIsUpdatingStamp] = useState(false);
  const stampInputRef = useRef<HTMLInputElement>(null);

  // 팝업에서 서명 데이터 수신
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'signature-save' && event.data.data) {
        setSignatureData(event.data.data);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkUserResourceConnection = async (name: string): Promise<boolean> => {
    try {
      // Find resource by name (teacher/staff)
      const { resource, error: resourceError } = await findLinkableResourceByName(name);

      if (resourceError) {
        console.error('리소스 조회 오류:', resourceError);
        return false;
      }

      if (!resource) {
        return false;
      }

      // Check if user_resource connection exists
      const { data: userResource, error: userResourceError } = await supabase
        .from('user_resource')
        .select('user_id, resource_id')
        .eq('user_id', profile.id)
        .eq('resource_id', resource.id)
        .maybeSingle();

      if (userResourceError) {
        console.error('user_resource 조회 오류:', userResourceError);
        return false;
      }

      return !!userResource;
    } catch (error) {
      console.error('user_resource 연결 확인 오류:', error);
      return false;
    }
  };

  const checkResourceAlreadyConnected = async (resourceId: string): Promise<{ isConnected: boolean; connectedUserId?: string }> => {
    try {
      console.log('[중복체크] Resource ID:', resourceId, '현재 사용자:', profile.id);

      // RLS를 우회하기 위해 RPC 함수 사용
      const { data, error } = await supabase
        .rpc('check_resource_duplicate_connection' as any, {
          p_resource_id: resourceId,
          p_current_user_id: profile.id
        });

      console.log('[중복체크] RPC 결과:', data, 'Error:', error);

      if (error) {
        console.error('중복 연결 확인 오류:', error);
        return { isConnected: false };
      }

      // RPC는 배열을 반환하므로 첫 번째 항목 사용
      const result = data && (data as any).length > 0 ? data[0] : { is_connected: false, connected_user_id: null };

      const finalResult = {
        isConnected: result.is_connected || false,
        connectedUserId: result.connected_user_id || undefined
      };

      console.log('[중복체크] 최종 결과:', finalResult);
      return finalResult;
    } catch (error) {
      console.error('중복 연결 확인 중 오류:', error);
      return { isConnected: false };
    }
  };

  /**
   * 연결된 resource 종류에 맞춰 profiles.role을 맞춘다 (teacher ↔ staff).
   *
   * 서버 트리거 `protect_profile_role()`이 "연결된 resource.type과 일치하는 role"만
   * 허용하므로, 여기서 임의의 값을 보내면 거부된다(= 클라이언트가 권한을 못 올린다).
   * 반드시 user_resource 링크를 만든 **뒤에** 호출할 것.
   */
  const syncProfileRole = async (resourceType: string) => {
    if (profile.role === 'admin') return;

    const nextRole = resourceType === 'staff' ? 'staff' : 'teacher';
    if (profile.role === nextRole) return;

    const { error } = await supabase
      .from('profiles')
      .update({ role: nextRole })
      .eq('id', profile.id);

    if (error) {
      console.error('역할 업데이트 오류:', error);
    } else {
      console.log(`사용자 역할이 ${nextRole}로 업데이트되었습니다.`);
    }
  };

  const openSignaturePopup = () => {
    const params = signatureData && signatureData.startsWith('http')
      ? `?signature=${encodeURIComponent(signatureData)}`
      : '';
    window.open(
      `/signature-popup${params}`,
      'signature-popup',
      'width=580,height=520,scrollbars=yes,resizable=yes'
    );
  };

  const handleClearSignature = async () => {
    // 즉시 저장된 서명 삭제
    if (profile.signature) {
      try {
        await deleteSignatureFromStorage(profile.signature);
        // DB에서도 서명 제거
        await supabase
          .from('profiles')
          .update({ signature: null })
          .eq('id', profile.id);
        toast({ title: '삭제 완료', description: '서명이 삭제되었습니다.' });
      } catch (error) {
        console.error('서명 삭제 오류:', error);
        toast({ title: '오류', description: '서명 삭제에 실패했습니다.', variant: 'destructive' });
        return;
      }
    }
    setSignatureData(null);
  };

  const handleStampFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { toast({ title: '오류', description: '파일 크기가 1MB를 초과합니다.', variant: 'destructive' }); return; }
    if (!file.type.startsWith('image/')) { toast({ title: '오류', description: '이미지 파일만 업로드 가능합니다.', variant: 'destructive' }); return; }

    const reader = new FileReader();
    reader.onload = (event) => {
      setStampPreviewUrl(event.target?.result as string);
      setStampFile(file);
    };
    reader.readAsDataURL(file);
    if (stampInputRef.current) stampInputRef.current.value = '';
  };

  const handleClearStamp = async () => {
    if (profile.stamp) {
      try {
        await deleteStampFromStorage(profile.stamp);
        await supabase
          .from('profiles')
          .update({ stamp: null })
          .eq('id', profile.id);
        toast({ title: '삭제 완료', description: '인장이 삭제되었습니다.' });
      } catch (error) {
        console.error('인장 삭제 오류:', error);
        toast({ title: '오류', description: '인장 삭제에 실패했습니다.', variant: 'destructive' });
        return;
      }
    }
    setStampPreviewUrl(null);
    setStampFile(null);
  };

  const handleSave = async () => {
    // 이름이 입력되지 않은 경우
    if (!formData.name || formData.name.trim().length === 0) {
      toast({
        title: '오류',
        description: '이름을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const trimmedName = formData.name.trim();

    console.log('[저장] 이름:', trimmedName);

    // user_resource 연결 상태 확인 (처음 연결 여부 판별용)
    const wasConnectedBefore = await checkUserResourceConnection(trimmedName);
    console.log('[저장] 기존 연결 여부:', wasConnectedBefore);

    // 연결되지 않은 경우, 자동으로 연결을 시도해볼 수 있도록 개선
    if (!wasConnectedBefore) {
      console.log('[저장] 연결 안됨, 자동 연결 시도');
      // 자동 연결 시도
      const connectionAttempted = await attemptAutoConnection(trimmedName);

      console.log('[저장] 자동 연결 결과:', connectionAttempted);

      if (!connectionAttempted) {
        console.log('[저장] 자동 연결 실패 → 저장 중단');
        toast({
          title: '연결 확인 필요',
          description: '이름을 확인하거나 관리자에게 문의하세요.',
          variant: 'destructive',
        });
        return;
      }
    } else {
      console.log('[저장] 이미 연결됨, 자동 연결 건너뜀');
    }

    // 서명 처리
    let signatureUrl = profile.signature;

    if (signatureData && signatureData !== profile.signature) {
      setIsUpdatingSignature(true);

      try {
        // 기존 서명이 있으면 삭제
        if (profile.signature) {
          await deleteSignatureFromStorage(profile.signature);
        }

        // 새 서명 업로드
        if (signatureData === 'tainted_canvas') {
          // Tainted canvas case - keep existing signature or set to null
          console.warn('Canvas is tainted, cannot export signature. Keeping existing signature.');
          signatureUrl = profile.signature;
        } else if (signatureData.startsWith('data:')) {
          // Base64 데이터인 경우 업로드
          signatureUrl = await uploadSignatureToStorage(profile.id, signatureData);
          if (!signatureUrl) {
            toast({
              title: '오류',
              description: '서명 업로드에 실패했습니다.',
              variant: 'destructive',
            });
            return;
          }
        } else {
          // 이미 URL인 경우 그대로 사용
          signatureUrl = signatureData;
        }
      } catch (error) {
        console.error('서명 처리 오류:', error);
        toast({
          title: '오류',
          description: '서명 처리 중 오류가 발생했습니다.',
          variant: 'destructive',
        });
        return;
      } finally {
        setIsUpdatingSignature(false);
      }
    } else if (!signatureData && profile.signature) {
      // 서명이 삭제된 경우
      try {
        await deleteSignatureFromStorage(profile.signature);
        signatureUrl = null;
      } catch (error) {
        console.error('서명 삭제 오류:', error);
      }
    }

    // 인장 처리
    let stampUrl = profile.stamp;

    if (stampFile) {
      setIsUpdatingStamp(true);

      try {
        // 기존 인장이 있으면 삭제
        if (profile.stamp) {
          await deleteStampFromStorage(profile.stamp);
        }

        // 새 인장 업로드
        stampUrl = await uploadStampToStorage(profile.id, stampFile);
        if (!stampUrl) {
          toast({
            title: '오류',
            description: '인장 업로드에 실패했습니다.',
            variant: 'destructive',
          });
          return;
        }
      } catch (error) {
        console.error('인장 처리 오류:', error);
        toast({
          title: '오류',
          description: '인장 처리 중 오류가 발생했습니다.',
          variant: 'destructive',
        });
        return;
      } finally {
        setIsUpdatingStamp(false);
      }
    } else if (!stampPreviewUrl && profile.stamp) {
      // 인장이 이미 삭제된 경우 (handleClearStamp에서 처리됨)
      stampUrl = null;
    }

    // Update the linked teacher resource without collecting personal phone data.
    if (formData.name) {
      console.log('[저장] 메타 업데이트 시작');
      const resourceUpdateSuccess = await updateResourceMeta(formData.name, formData.email);
      console.log('[저장] 메타 업데이트 결과:', resourceUpdateSuccess);

      if (!resourceUpdateSuccess) {
        // 리소스 연결 실패 시 저장 중단
        console.error('[저장] 메타 업데이트 실패 → 저장 중단');
        return;
      }
    }

    const updates: Partial<Profile> = {
      name: formData.name || undefined,
      email: formData.email || undefined,
      signature: signatureUrl || undefined,
      stamp: stampUrl || undefined,
    };

    console.log('[저장] profiles 업데이트 데이터:', updates);

    // 연결이 성공한 경우 profiles.role을 리소스 종류(teacher/staff)에 맞춘다 (admin은 제외)
    if (wasConnectedBefore || (await checkUserResourceConnection(trimmedName))) {
      const { resource: linkedResource } = await findLinkableResourceByName(trimmedName);
      if (linkedResource) {
        await syncProfileRole(linkedResource.type);
      }
    }

    const success = await onSave(updates);
    if (success) {
      // 처음 연결된 경우 환영 알림 생성
      const isNowConnected = await checkUserResourceConnection(trimmedName);
      if (!wasConnectedBefore && isNowConnected) {
        // Find the connected resource_id to send notification
        const { resource } = await findLinkableResourceByName(trimmedName);

        if (resource) {
          await NotificationService.notifyUserConnectionCompleted(resource.id, trimmedName);
        }
      }

      // React Query 캐시 완전 초기화 (프로필-리소스 연결 변경 시 기존 캐시 제거)
      console.log('[저장] React Query 캐시 초기화 - 프로필 변경으로 인한 리소스 연결 변경');
      queryClient.clear();

      // unifiedAuth 캐시도 초기화 (수업 교체 관리 등에서 사용)
      console.log('[저장] unifiedAuth 캐시 초기화 - 새로운 resource_id 로드 준비');
      unifiedAuth.clearCache();

      // 인증 성공 알림
      toast({
        title: '인증 완료',
        description: '사용자 정보가 인증되었습니다.',
      });

      // Refresh name status if name was updated
      if (formData.name && formData.name.trim().length > 0) {
        await refreshNameStatus();
      }

      // TeacherManagement 새로고침 호출
      if (onTeacherManagementRefresh) {
        await onTeacherManagementRefresh();
      }

      await refreshProfile();
      await queryClient.invalidateQueries({ queryKey: ['unifiedAuth'] });
      onOpenChange(false);
    }
  };

  const attemptAutoConnection = async (name: string): Promise<boolean> => {
    try {
      console.log('[자동연결] 시작. 이름:', name);

      // Find resource by name (teacher/staff)
      const { resource, error: resourceError } = await findLinkableResourceByName(name);

      console.log('[자동연결] Resource 조회:', resource, 'Error:', resourceError);

      if (resourceError || !resource) {
        console.log('[자동연결] Resource 없음 → 실패');
        return false;
      }

      // Check if resource is already connected to another user
      const duplicateCheck = await checkResourceAlreadyConnected(resource.id);
      if (duplicateCheck.isConnected) {
        console.error('[자동연결] 중복 발견! 차단. 연결된 사용자:', duplicateCheck.connectedUserId);
        toast({
          title: '연결 실패',
          description: '이 이름은 이미 다른 사용자가 사용 중입니다. 관리자에게 문의하세요.',
          variant: 'destructive',
        });
        return false;
      }

      console.log('[자동연결] 중복 없음, 연결 시도');

      // 기존 연결 삭제 (이름 변경 시 이전 resource 연결 제거)
      console.log('[자동연결] 기존 user_resource 연결 삭제 중...');
      const { error: deleteError } = await supabase
        .from('user_resource')
        .delete()
        .eq('user_id', profile.id);

      if (deleteError) {
        console.error('기존 연결 삭제 실패:', deleteError);
        // 삭제 실패해도 계속 진행 (기존 연결이 없을 수 있음)
      } else {
        console.log('[자동연결] 기존 연결 삭제 완료');
      }

      // 새로운 연결 생성
      const { error: linkError } = await supabase
        .from('user_resource')
        .insert({
          user_id: profile.id,
          resource_id: resource.id
        });

      if (linkError) {
        console.error('자동 연결 실패:', linkError);
        return false;
      }

      // 자동 연결 성공 시 profiles.role을 리소스 종류(teacher/staff)에 맞춘다
      await syncProfileRole(resource.type);

      return true;
    } catch (error) {
      console.error('자동 연결 시도 중 오류:', error);
      return false;
    }
  };

  const updateResourceMeta = async (name: string, email: string): Promise<boolean> => {
    try {
      console.log('[메타업데이트] 시작. 이름:', name);

      // Find resource by name (teacher/staff)
      const { resource, error: resourceError } = await findLinkableResourceByName(name);

      console.log('[메타업데이트] Resource 조회:', resource, 'Error:', resourceError);

      if (resourceError) {
        console.error('리소스 조회 오류:', resourceError);
        return false;
      }

      if (resource) {
        console.log('[메타업데이트] Resource 존재, 중복 체크');

        // Check if resource is already connected to another user
        const duplicateCheck = await checkResourceAlreadyConnected(resource.id);
        if (duplicateCheck.isConnected) {
          console.error('[메타업데이트] 중복 발견! 차단. 연결된 사용자:', duplicateCheck.connectedUserId);
          toast({
            title: '연결 실패',
            description: '이 이름은 이미 다른 사용자가 사용 중입니다. 관리자에게 문의하세요.',
            variant: 'destructive',
          });
          return false;
        }

        console.log('[메타업데이트] 중복 없음, 메타 업데이트 진행');

        // 지금의 meta 를 다시 읽어 병합한다 — 이름 조회(findLinkableResourceByName)는 meta 를
        // 주지 않는다. 못 읽었는데 {email} 만 쓰면 section·accounts 가 통째로 지워지므로
        // 읽기에 실패하면 쓰지 않는다. (이 시점엔 이미 연결돼 있어 표를 읽을 수 있다.)
        const { data: current, error: metaError } = await supabase
          .from('resource')
          .select('meta')
          .eq('id', resource.id)
          .single();

        if (metaError || !current) {
          console.error('리소스 메타 조회 오류:', metaError);
          return false;
        }

        // Update existing resource meta
        const updatedMeta: Record<string, unknown> = {
          ...((current.meta as Record<string, unknown> | null) ?? {}),
          email: email || undefined,
        };
        delete updatedMeta.phone;
        delete updatedMeta.hp;

        const { error: updateError } = await supabase
          .from('resource')
          .update({ meta: updatedMeta as Json })
          .eq('id', resource.id);

        if (updateError) {
          console.error('리소스 메타 업데이트 오류:', updateError);
          return false;
        }

        // 기존 연결 삭제 (이름 변경 시 이전 resource 연결 제거)
        console.log('[메타업데이트] 기존 user_resource 연결 삭제 중...');
        const { error: deleteError } = await supabase
          .from('user_resource')
          .delete()
          .eq('user_id', profile.id);

        if (deleteError) {
          console.error('기존 연결 삭제 실패:', deleteError);
          // 삭제 실패해도 계속 진행
        } else {
          console.log('[메타업데이트] 기존 연결 삭제 완료');
        }

        // 새로운 연결 생성
        const { error: linkError } = await supabase
          .from('user_resource')
          .insert({
            user_id: profile.id,
            resource_id: resource.id
          });

        if (linkError) {
          console.error('user_resource 연결 오류:', linkError);
          return false;
        }
      } else {
        // Create new resource with meta and link
        const { data: newResource, error: insertError } = await supabase
          .from('resource')
          .insert({
            name: name,
            type: 'teacher',
            meta: {
              email: email || undefined,
            }
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('새 리소스 생성 오류:', insertError);
          return false;
        }

        if (newResource) {
          // 기존 연결 삭제 (이름 변경 시 이전 resource 연결 제거)
          console.log('[메타업데이트] 새 리소스 생성 후 기존 연결 삭제 중...');
          const { error: deleteError } = await supabase
            .from('user_resource')
            .delete()
            .eq('user_id', profile.id);

          if (deleteError) {
            console.error('기존 연결 삭제 실패:', deleteError);
            // 삭제 실패해도 계속 진행
          } else {
            console.log('[메타업데이트] 기존 연결 삭제 완료');
          }

          // 새로운 연결 생성
          const { error: linkError } = await supabase
            .from('user_resource')
            .insert({
              user_id: profile.id,
              resource_id: newResource.id
            });

          if (linkError) {
            console.error('user_resource 연결 오류:', linkError);
            return false;
          } else {
            // 새 리소스는 type='teacher'로 만들어지므로 role도 teacher.
            // (이 분기는 resource INSERT가 admin 전용이라 일반 사용자에겐 도달하지 않는다)
            await syncProfileRole('teacher');
          }
        }
      }
      return true;
    } catch (error) {
      console.error('리소스 메타 업데이트 오류:', error);
      return false;
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full max-w-[425px] max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pb-3">
          <DialogTitle className="text-lg sm:text-xl">프로필 편집</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:gap-4 py-2 sm:py-4">
          <div className="grid gap-1.5 sm:gap-2">
            <Label htmlFor="name" className="text-sm">성명</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="성명을 입력하세요"
              className="h-9 sm:h-10 text-sm sm:text-base"
            />
          </div>

          <div className="grid gap-1.5 sm:gap-2">
            <Label htmlFor="email" className="text-sm">이메일</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              readOnly
              placeholder="이메일을 입력하세요"
              className="bg-gray-100 text-gray-600 border-gray-200 h-9 sm:h-10 text-sm sm:text-base"
            />
          </div>

          <div className="mt-2 sm:mt-4">
            <Label className="text-sm font-medium">서명</Label>
            <div className="flex items-center gap-3 mt-1.5">
              <div className="w-20 h-14 border border-gray-200 rounded bg-white flex items-center justify-center overflow-hidden shrink-0">
                {signatureData ? (
                  <img src={signatureData} alt="서명" className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-xs text-gray-400">없음</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={openSignaturePopup}>
                  <Pen className="h-3.5 w-3.5 mr-1" />
                  서명하기
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleClearSignature} disabled={!signatureData}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  지우기
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-2 sm:mt-4">
            <Label className="text-sm font-medium">인장</Label>
            <div className="flex items-center gap-3 mt-1.5">
              <div className="w-14 h-14 border border-gray-200 rounded bg-white flex items-center justify-center overflow-hidden shrink-0">
                {stampPreviewUrl ? (
                  <img src={stampPreviewUrl} alt="인장" className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-xs text-gray-400">없음</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => stampInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  {stampPreviewUrl ? '변경' : '등록'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleClearStamp} disabled={!stampPreviewUrl}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  삭제
                </Button>
              </div>
              <Input ref={stampInputRef} type="file" accept="image/*" onChange={handleStampFileSelect} className="hidden" />
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 sm:pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto h-9 sm:h-10 text-sm sm:text-base"
          >
            취소
          </Button>
          <Button
            onClick={handleSave}
            disabled={updating || isUpdatingSignature || isUpdatingStamp}
            className="w-full sm:w-auto h-9 sm:h-10 text-sm sm:text-base"
          >
            {updating || isUpdatingSignature || isUpdatingStamp ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
