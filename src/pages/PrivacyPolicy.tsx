import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PrivacyPolicyContent } from '@/components/privacy/PrivacyPolicyContent';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/auth');
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            돌아가기
          </Button>
          <a
            href="https://school.jbedu.kr/kijun/M01010202"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 sm:text-sm"
          >
            학교 공식 방침
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </header>

      <main className="px-4 py-10 sm:px-6 sm:py-14">
        <PrivacyPolicyContent />
      </main>
    </div>
  );
};

export default PrivacyPolicy;
