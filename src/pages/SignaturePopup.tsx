import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Upload, Save, X } from 'lucide-react';

/**
 * 서명 팝업 페이지
 * window.open()으로 열리며, postMessage로 부모 창에 서명 데이터를 전달
 */
export default function SignaturePopup() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // URL params에서 초기 서명 로드
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialSignature = params.get('signature');
    if (initialSignature && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        loadImage(ctx, canvas, initialSignature);
      }
    }
  }, []);

  // 캔버스 크기를 창 크기에 맞춤
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const width = Math.min(window.innerWidth - 32, 500);
      const height = Math.round(width * 0.6);
      canvas.width = width;
      canvas.height = height;
    }
  }, []);

  const loadImage = async (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, src: string) => {
    try {
      let imgSrc = src;
      if (src.startsWith('http')) {
        const response = await fetch(src);
        const blob = await response.blob();
        imgSrc = URL.createObjectURL(blob);
      }
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setHasSignature(true);
        if (imgSrc !== src) URL.revokeObjectURL(imgSrc);
      };
      img.src = imgSrc;
    } catch (error) {
      console.error('서명 이미지 로드 실패:', error);
    }
  };

  const getEventPosition = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
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

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
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

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      setHasSignature(true);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasSignature(false);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { alert('파일 크기가 1MB를 초과합니다.'); return; }
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드 가능합니다.'); return; }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // 비율 유지하며 캔버스에 맞춤
            const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            const x = (canvas.width - w) / 2;
            const y = (canvas.height - h) / 2;
            ctx.drawImage(img, x, y, w, h);
            setHasSignature(true);
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      try {
        const dataURL = canvas.toDataURL('image/png');
        if (window.opener) {
          window.opener.postMessage({ type: 'signature-save', data: dataURL }, window.location.origin);
        }
        window.close();
      } catch (error) {
        console.error('서명 내보내기 실패:', error);
        alert('서명 저장에 실패했습니다.');
      }
    }
  };

  const handleCancel = () => {
    window.close();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-[540px]">
        <h1 className="text-lg font-semibold mb-4">서명하기</h1>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-2 mb-4">
          <canvas
            ref={canvasRef}
            className="border border-gray-200 rounded cursor-crosshair bg-white touch-none w-full"
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

        <p className="text-xs text-gray-500 mb-4">
          마우스나 터치로 직접 그리거나 이미지 파일을 업로드하세요.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={clearCanvas} disabled={!hasSignature}>
            <Trash2 className="h-4 w-4 mr-1" />
            지우기
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" />
            파일 업로드
          </Button>
        </div>

        <Input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            <X className="h-4 w-4 mr-1" />
            취소
          </Button>
          <Button onClick={handleSave} disabled={!hasSignature}>
            <Save className="h-4 w-4 mr-1" />
            저장
          </Button>
        </div>
      </div>
    </div>
  );
}
