import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2, Download, Upload } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface SignatureCanvasProps {
  width?: number;
  height?: number;
  onSignatureChange: (signatureData: string | null) => void;
  initialSignature?: string | null;
}

export const SignatureCanvas: React.FC<SignatureCanvasProps> = ({
  width = 300,
  height = 200,
  onSignatureChange,
  initialSignature,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialSignature && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const loadImage = async () => {
          try {
            // For Supabase URLs or other external URLs, fetch as blob to avoid CORS issues
            if (initialSignature.startsWith('http')) {
              const response = await fetch(initialSignature);
              const blob = await response.blob();
              const blobUrl = URL.createObjectURL(blob);

              const img = new Image();
              img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                setHasSignature(true);
                // Clean up the blob URL
                URL.revokeObjectURL(blobUrl);
              };
              img.onerror = () => {
                console.warn('Failed to load signature image from blob');
                setHasSignature(false);
                URL.revokeObjectURL(blobUrl);
              };
              img.src = blobUrl;
            } else {
              // For data URLs, load directly
              const img = new Image();
              img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                setHasSignature(true);
              };
              img.onerror = () => {
                console.warn('Failed to load signature image');
                setHasSignature(false);
              };
              img.src = initialSignature;
            }
          } catch (error) {
            console.error('Error loading signature image:', error);
            setHasSignature(false);
          }
        };

        loadImage();
      }
    }
  }, [initialSignature]);

  const getEventPosition = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      // Touch event
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    } else {
      // Mouse event
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    // No preventDefault needed - using CSS touch-action: none instead
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (canvas) {
      const { x, y } = getEventPosition(e);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    // No preventDefault needed - using CSS touch-action: none instead
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (canvas) {
      const { x, y } = getEventPosition(e);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineTo(x, y);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
  };

  const stopDrawing = (e?: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    // No preventDefault needed - using CSS touch-action: none instead
    if (isDrawing) {
      setIsDrawing(false);
      setHasSignature(true);
      saveSignature();
    }
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const dataURL = canvas.toDataURL('image/png');
        onSignatureChange(dataURL);
      } catch (error) {
        console.error('Failed to export canvas to data URL (canvas may be tainted):', error);
        // If canvas is tainted, we can't export it, but we can still mark it as having a signature
        onSignatureChange('tainted_canvas');
      }
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasSignature(false);
        onSignatureChange(null);
      }
    }
  };

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

        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 이미지를 캔버스 중앙에 배치
            const x = (canvas.width - img.width) / 2;
            const y = (canvas.height - img.height) / 2;
            ctx.drawImage(img, x, y);

            setHasSignature(true);
            saveSignature();
          }
        }
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

  const downloadSignature = () => {
    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      const link = document.createElement('a');
      link.download = 'signature.png';
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          <Label className="text-sm font-medium">서명</Label>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-2">
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              className="border border-gray-200 rounded cursor-crosshair bg-white touch-none"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              onTouchCancel={stopDrawing}
              style={{ touchAction: 'none' }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearSignature}
              disabled={!hasSignature}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              지우기
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadSignature}
              disabled={!hasSignature}
            >
              <Download className="h-4 w-4 mr-1" />
              다운로드
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-1" />
              파일 업로드
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
            • 마우스나 터치로 직접 그리거나 이미지 파일을 업로드하세요
            • 업로드 파일은 300x300 픽셀 이하, 1MB 이하여야 합니다
          </p>
        </div>
      </CardContent>
    </Card>
  );
};