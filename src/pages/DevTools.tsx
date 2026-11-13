import React from 'react';
import { LogoUploader } from '@/components/dev/LogoUploader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Code, Database } from 'lucide-react';

export default function DevTools() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Code className="h-6 w-6" />
        <h1 className="text-2xl font-bold">개발자 도구</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 로고 업로드 */}
        <LogoUploader />

        {/* Storage 정보 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Storage 정보
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium">Bucket:</p>
              <p className="text-sm text-muted-foreground">kijunspace</p>
            </div>
            <div>
              <p className="text-sm font-medium">로고 경로:</p>
              <p className="text-sm text-muted-foreground">dev/logo.png</p>
            </div>
            <div>
              <p className="text-sm font-medium">Base URL:</p>
              <p className="text-xs text-muted-foreground break-all">
                {import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/kijunspace/
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 사용법 안내 */}
        <Card>
          <CardHeader>
            <CardTitle>사용법</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium">1. 로고 업로드</p>
              <p className="text-xs text-muted-foreground">
                왼쪽 카드에서 새 로고 이미지를 선택하여 업로드
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">2. 자동 적용</p>
              <p className="text-xs text-muted-foreground">
                업로드 완료 후 페이지가 자동으로 새로고침되어 새 로고가 적용됩니다
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">3. Fallback</p>
              <p className="text-xs text-muted-foreground">
                Storage 로딩 실패 시 로컬 파일로 자동 전환됩니다
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}