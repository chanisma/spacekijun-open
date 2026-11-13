import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2, Upload } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface StampUploadProps {
  onStampChange: (stampFile: File | null) => void;
  initialStamp?: string | null;
}

export const StampUpload: React.FC<StampUploadProps> = ({
  onStampChange,
  initialStamp,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialStamp || null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  useEffect(() => {
    if (initialStamp) {
      setPreviewUrl(initialStamp);
    }
  }, [initialStamp]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 크기 제한 (300x300 픽셀 이하 권장, 1MB 이하)
    if (file.size > 1024 * 1024) {
      alert('파일 크기가 1MB를 초과합니다.');
      return;
    }

    // 이미지 파일 형식 확인
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // 이미지 크기 확인
        if (img.width > 300 || img.height > 300) {
          alert('이미지 크기는 300x300 픽셀 이하여야 합니다.');
          return;
        }

        // 미리보기 URL 설정
        setPreviewUrl(event.target?.result as string);
        setCurrentFile(file);
        onStampChange(file);
      };
      img.onerror = () => {
        console.error('Failed to load uploaded image');
        alert('이미지 로드에 실패했습니다.');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);

    // input 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearStamp = () => {
    setPreviewUrl(null);
    setCurrentFile(null);
    onStampChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          <Label className="text-sm font-medium">인장</Label>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
            {previewUrl ? (
              <div className="flex items-center justify-center">
                <img
                  src={previewUrl}
                  alt="인장 미리보기"
                  className="max-w-[300px] max-h-[200px] object-contain"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-gray-400">
                <div className="text-center">
                  <Upload className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">인장 이미지를 업로드하세요</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-1" />
              {previewUrl ? '다른 파일 선택' : '파일 업로드'}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearStamp}
              disabled={!previewUrl}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              삭제
            </Button>
          </div>

          <Input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          <p className="text-xs text-gray-500">
            • 이미지 파일을 업로드하세요
            • 업로드 파일은 300x300 픽셀 이하, 1MB 이하여야 합니다
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
