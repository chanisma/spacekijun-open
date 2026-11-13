import React, { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from '@/lib/toast';
import { getLogoUrl } from '@/lib/storage';

const Auth = () => {
  const { user, loading, signInWithGoogle } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already authenticated
  if (user && !loading) {
    return <Navigate to="/" replace />;
  }

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      setError(null);
      await signInWithGoogle();
      toast.success('로그인 중입니다...');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '로그인에 실패했습니다.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{background: 'linear-gradient(135deg, #a8e6cf 0%, #dcedc8 50%, #f8f8f8 100%)'}}>
        {/* Decorative leaves */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-20 w-8 h-8 bg-green-200/40 rounded-full rotate-45"></div>
          <div className="absolute top-40 right-32 w-6 h-6 bg-green-300/30 rounded-full"></div>
          <div className="absolute bottom-32 left-16 w-10 h-10 bg-emerald-200/40 rounded-full rotate-12"></div>
          <div className="absolute bottom-20 right-20 w-7 h-7 bg-green-200/30 rounded-full -rotate-12"></div>
        </div>

        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{borderColor: '#2e7d32'}}></div>
          <p className="text-sm" style={{color: '#2e7d32', fontFamily: '"Pretendard", "Noto Sans KR", -apple-system, BlinkMacSystemFont, system-ui, sans-serif'}}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-4" style={{background: 'linear-gradient(135deg, #a8e6cf 0%, #dcedc8 50%, #f8f8f8 100%)'}}>
      {/* Enhanced floating leaves with animations */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Large floating leaves */}
        <div className="absolute top-16 left-12 w-12 h-12 bg-gradient-to-br from-green-300/30 to-emerald-400/20 rounded-full rotate-45 opacity-60 animate-pulse"></div>
        <div className="absolute top-32 right-24 w-8 h-8 bg-gradient-to-br from-teal-300/40 to-green-300/30 rounded-full opacity-50 animate-bounce" style={{animationDuration: '3s'}}></div>
        <div className="absolute top-64 left-32 w-6 h-6 bg-gradient-to-br from-emerald-200/50 to-green-200/40 rounded-full rotate-12 animate-pulse" style={{animationDelay: '1s'}}></div>

        {/* Medium floating elements */}
        <div className="absolute bottom-40 left-16 w-14 h-14 bg-gradient-to-br from-emerald-200/40 to-teal-300/30 rounded-full rotate-12 opacity-60 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute bottom-24 right-16 w-10 h-10 bg-gradient-to-br from-green-200/30 to-emerald-300/20 rounded-full -rotate-12 opacity-50 animate-bounce" style={{animationDuration: '4s'}}></div>
        <div className="absolute top-40 left-3/4 w-7 h-7 bg-gradient-to-br from-green-300/40 to-teal-200/30 rounded-full rotate-45 opacity-40 animate-pulse" style={{animationDelay: '1.5s'}}></div>

        {/* Small organic shapes */}
        <div className="absolute bottom-60 right-1/3 w-9 h-9 bg-gradient-to-br from-emerald-300/30 to-green-400/20 rounded-full -rotate-12 opacity-50 animate-bounce" style={{animationDuration: '5s'}}></div>
        <div className="absolute top-1/4 left-1/4 w-5 h-5 bg-gradient-to-br from-teal-400/30 to-emerald-300/25 rounded-full rotate-45 animate-pulse" style={{animationDelay: '3s'}}></div>
        <div className="absolute bottom-1/3 left-1/2 w-4 h-4 bg-gradient-to-br from-green-400/35 to-teal-300/25 rounded-full -rotate-45 animate-pulse" style={{animationDelay: '2.5s'}}></div>

        {/* Organic leaf shapes */}
        <div className="absolute top-20 right-1/4 w-8 h-16 bg-gradient-to-b from-green-300/25 to-emerald-400/15 rounded-full rotate-12 opacity-40 animate-pulse" style={{animationDelay: '0.5s'}}></div>
        <div className="absolute bottom-32 right-12 w-6 h-12 bg-gradient-to-b from-teal-300/30 to-green-300/20 rounded-full -rotate-12 opacity-45 animate-bounce" style={{animationDuration: '6s'}}></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Enhanced card with organic design */}
        <Card className="bg-white/90 backdrop-blur-sm shadow-2xl border-0 p-8 relative overflow-hidden" style={{borderRadius: '2.5rem'}}>
          {/* Subtle organic pattern overlay */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-green-200 to-emerald-300" style={{clipPath: 'ellipse(100% 70% at 50% 30%)'}}></div>
          </div>

          <CardContent className="space-y-6 p-0 relative z-10">
            {/* Clean Logo and Header */}
            <div className="text-center space-y-4">
              <div className="mx-auto mb-4">
                <img
                  src={getLogoUrl()}
                  alt="SPACEKIJUN Logo"
                  className="w-48 h-48 mx-auto object-contain animate-pulse"
                  style={{animationDuration: '4s'}}
                  onError={(e) => {
                    // 로고 로딩 실패 시 fallback
                    console.warn('로고 이미지 로딩 실패, fallback으로 전환');
                    (e.target as HTMLImageElement).src = '/src/components/auth/logo.png';
                  }}
                />
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold" style={{color: '#2e7d32', fontFamily: '"Pretendard", "Noto Sans KR", -apple-system, BlinkMacSystemFont, system-ui, sans-serif'}}>SPACEKIJUN</h1>
                <p className="text-sm font-medium" style={{color: '#2e7d32', fontFamily: '"Pretendard", "Noto Sans KR", -apple-system, BlinkMacSystemFont, system-ui, sans-serif', letterSpacing: '0.05em'}}>샘플고 정보 관리 시스템</p>
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="rounded-xl">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Harmony Button Design */}
            <button
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className="w-full bg-transparent text-white border-none cursor-pointer font-inherit text-base font-semibold relative mb-8 overflow-hidden min-h-[54px] flex items-center justify-center transition-all duration-300 hover:scale-105"
              style={{
                borderRadius: '20px',
                padding: '0',
                background: isSigningIn
                  ? 'linear-gradient(135deg, #66bb6a 0%, #4caf50 50%, #388e3c 100%)'
                  : 'linear-gradient(135deg, #81c784 0%, #66bb6a 50%, #4caf50 100%)',
                boxShadow: '0 8px 32px rgba(76, 175, 80, 0.3)',
              }}
            >
              {/* Enhanced shimmer effect */}
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -skew-x-12"
                style={{
                  animation: 'shimmer 2s infinite ease-in-out',
                }}
              ></div>

              {/* Button content */}
              {isSigningIn ? (
                <div className="flex items-center gap-3 relative z-10">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  <span>Entering...</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 relative z-10">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span style={{fontFamily: '"Pretendard", "Noto Sans KR", -apple-system, BlinkMacSystemFont, system-ui, sans-serif'}}>구글로 로그인</span>
                </div>
              )}
            </button>

            <p className="text-center text-xs leading-5 text-slate-600">
              개인기기에서는 로그인 후 프로필에서 자동 로그인을 설정할 수 있습니다.
            </p>

            <p className="text-center text-xs leading-5 text-slate-600">
              로그인 후 최신 개인정보처리방침 확인 및 동의가 필요합니다.
              <br />
              <Link
                to="/privacy"
                className="font-semibold text-emerald-700 underline underline-offset-4"
              >
                개인정보처리방침 보기
              </Link>
            </p>

            {/* Add shimmer animation styles */}
            <style>{`
              @keyframes shimmer {
                0% { transform: translateX(-100%) skewX(-12deg); }
                100% { transform: translateX(200%) skewX(-12deg); }
              }
            `}</style>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
