import { useParams, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/components/auth/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { ExternalLink, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface IframeMenuData {
  id: string;
  name: string;
  type: string;
  meta: {
    url: string;
    show: boolean;
    /** 학생 네비 노출 여부. 사이드바·명령 검색과 **같은 기준**으로 여기서도 재검사한다. */
    showStudent?: boolean;
  } | null;
}

export default function IframePage() {
  const { id } = useParams<{ id: string }>();
  const { isStudentView } = useAuth();

  const { data: iframeMenu, isLoading, error } = useQuery({
    queryKey: ['iframe-menu', id],
    queryFn: async (): Promise<IframeMenuData | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('resource')
        .select('id, name, type, meta')
        .eq('id', id)
        .eq('type', 'iframe')
        .single();

      if (error) {
        console.error('Error fetching iframe menu:', error);
        throw error;
      }

      return data as any;
    },
    enabled: !!id,
  });

  if (!id) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">로딩 중...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !iframeMenu) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Alert className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              페이지를 찾을 수 없습니다. 메뉴가 삭제되었거나 접근 권한이 없을 수 있습니다.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  // 학생 재검사 — 메뉴·검색에서 감춰도 주소를 직접 치면 열리면 감춘 의미가 없다.
  // 판정 기준은 useNavSections·명령 검색과 동일하게 `showStudent === true`.
  if (isStudentView && iframeMenu.meta?.showStudent !== true) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Alert className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              이 메뉴는 학생에게 제공되지 않습니다.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  if (!iframeMenu.meta?.show) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Alert className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              이 메뉴는 현재 비활성화되어 있습니다.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  if (!iframeMenu.meta?.url) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Alert className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              URL이 설정되지 않았습니다.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  // URL 유효성 및 보안 검증
  let validUrl: URL;
  try {
    validUrl = new URL(iframeMenu.meta.url);

    // 안전하지 않은 프로토콜 차단
    if (!['http:', 'https:'].includes(validUrl.protocol)) {
      throw new Error('지원하지 않는 프로토콜입니다.');
    }
  } catch (urlError) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Alert className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              유효하지 않은 URL입니다. 관리자에게 문의하세요.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center space-x-2 px-4 sm:px-0 mb-4">
          <ExternalLink className="h-6 w-6" />
          <h1 className="text-xl sm:text-2xl font-bold">{iframeMenu.name}</h1>
          <a
            href={validUrl.toString()}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-sm text-muted-foreground hover:text-primary"
          >
            새 탭에서 열기 <ExternalLink className="h-3 w-3 inline ml-1" />
          </a>
        </div>

        {/* Iframe Container */}
        <Card className="flex-1 border-0 shadow-none">
          <CardContent className="p-0 h-full">
            <iframe
              src={validUrl.toString()}
              className="w-full h-full border-0 rounded-lg"
              title={iframeMenu.name}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-top-navigation-by-user-activation"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="fullscreen"
              onError={(e) => {
                console.error('Iframe loading error:', e);
              }}
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}