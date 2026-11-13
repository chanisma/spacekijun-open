import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Check, AlertCircle } from 'lucide-react';
import { uploadToStorage, getLogoUrl } from '@/lib/storage';
import { toast } from '@/lib/toast';

export function LogoUploader() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 파일 타입 검증
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드 가능합니다.');
      return;
    }

    // 파일 크기 검증 (5MB 제한)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('파일 크기는 5MB 이하여야 합니다.');
      return;
    }

    try {
      setIsUploading(true);
      setUploadStatus('idle');

      console.log('업로드 시작:', file.name, file.size, 'bytes');

      await uploadToStorage('kijunspace', 'dev/logo.png', file, {
        contentType: file.type,
        upsert: true
      });

      setUploadStatus('success');
      toast.success('로고가 성공적으로 업로드되었습니다!');

      // 페이지 새로고침으로 새 로고 적용
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (error) {
      console.error('업로드 오류:', error);
      setUploadStatus('error');
      toast.error('업로드에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsUploading(false);
    }
  };

  const logoUrl = getLogoUrl();

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          로고 업로드
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 현재 로고 미리보기 */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-2">현재 로고:</p>
          <img
            src={logoUrl}
            alt="Current Logo"
            className="w-32 h-32 mx-auto object-contain border rounded-lg"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/src/components/auth/logo.png';
            }}
          />
          <p className="text-xs text-muted-foreground mt-1 break-all">{logoUrl}</p>
        </div>

        {/* 파일 업로드 */}
        <div className="space-y-2">
          <label htmlFor="logo-upload" className="block text-sm font-medium">
            새 로고 업로드:
          </label>
          <input
            id="logo-upload"
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        {/* 상태 표시 */}
        {isUploading && (
          <div className="flex items-center gap-2 text-blue-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span className="text-sm">업로드 중...</span>
          </div>
        )}

        {uploadStatus === 'success' && (
          <div className="flex items-center gap-2 text-green-600">
            <Check className="h-4 w-4" />
            <span className="text-sm">업로드 완료!</span>
          </div>
        )}

        {uploadStatus === 'error' && (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">업로드 실패</span>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p>• 이미지 파일만 업로드 가능</p>
          <p>• 최대 파일 크기: 5MB</p>
          <p>• 권장 크기: 512x512px</p>
        </div>
      </CardContent>
    </Card>
  );
}