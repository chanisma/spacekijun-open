/**
 * 나이스 안내 (`/neis-guide`, 2026-10-11) — 나이스 화면별 사용 방법(`neis-kb/guides`)을 한곳에서 찾고 읽는다.
 *
 * 고른 화면은 주소 `?key=` 에 남는다(링크로 공유·뒤로가기). 머리글에 기능 이름을 쓰지 않는다(UI 규약 §1) —
 * 사이드바가 이미 말한다. 본문은 `NeisGuideBrowser` 하나(개발용 미리보기와 공용).
 */
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { NeisGuideBrowser } from './NeisGuideBrowser';

export default function NeisGuidePage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('key');
  return (
    <Layout>
      <PageContainer>
        <NeisGuideBrowser
          selectedKey={selected}
          onSelect={(key) => {
            const next = new URLSearchParams(params);
            if (key) next.set('key', key);
            else next.delete('key');
            setParams(next);
            window.scrollTo({ top: 0 });
          }}
        />
      </PageContainer>
    </Layout>
  );
}
