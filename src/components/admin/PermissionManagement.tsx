import { Shield, LayoutGrid } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TagPermissionMatrix } from './permissions/TagPermissionMatrix';
import { FeaturePermissionView } from './permissions/FeaturePermissionView';

/**
 * 권한 관리 (관리자)
 * ==================
 * 이 앱의 "진짜" 권한 시스템은 태그 기반(resource_tags)이다.
 * 교직원 태그가 위기노트·수시·생기부·연수·감독·학급관리 접근을 제어한다.
 *  - "태그 권한 매트릭스" 탭: 태그×기능 매트릭스 + 태그별 교직원 할당 편집
 *  - "기능별 권한" 탭: 기능→태그 역방향 뷰 + 현재 보유 교직원
 *
 * (스케줄 권한 시스템(schedule_permissions)은 백엔드 테이블이 이미 사라진 채
 *  redundant RLS 분기로만 남아 있어 2026-06 정리하며 제거했다.)
 */
export function PermissionManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6" />
          권한 관리
        </h2>
        <p className="text-muted-foreground">
          교직원 태그로 제어되는 기능 권한을 열람하고 할당을 편집합니다.
        </p>
      </div>

      <Tabs defaultValue="matrix" className="w-full">
        <TabsList>
          <TabsTrigger value="matrix" className="gap-1.5">
            <LayoutGrid className="h-4 w-4" />
            태그 권한 매트릭스
          </TabsTrigger>
          <TabsTrigger value="features" className="gap-1.5">
            <Shield className="h-4 w-4" />
            기능별 권한
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="mt-6">
          <TagPermissionMatrix />
        </TabsContent>

        <TabsContent value="features" className="mt-6">
          <FeaturePermissionView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
