import React from 'react';
import { Lock } from 'lucide-react';

interface BlurredContentProps {
  message?: string;
  className?: string;
}

/**
 * 권한 없음 플레이스홀더 - 실제 콘텐츠를 렌더링하지 않음
 * CSS 블러 대신 콘텐츠 자체를 표시하지 않아 DevTools로도 열람 불가
 */
const BlurredContent: React.FC<BlurredContentProps> = ({
  message = '열람 권한이 없습니다',
  className,
}) => {
  return (
    <div className={`flex flex-col items-center justify-center bg-slate-50/80 border border-slate-100 rounded-xl py-6 ${className || ''}`}>
      <div className="flex flex-col items-center gap-2">
        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
          <Lock className="w-5 h-5 text-slate-400" />
        </div>
        <p className="text-xs font-medium text-slate-400 text-center max-w-xs">
          {message}
        </p>
      </div>
    </div>
  );
};

export default BlurredContent;
