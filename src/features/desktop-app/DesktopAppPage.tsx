/**
 * PC 앱 내려받기 (`/desktop-app`, 2026-10-20) — 교직원 = 스페이스기전 데스크, 학생 = 스페이스기전 학생.
 * 휴대폰 앱(안드로이드 APK, 2026-11-10)도 여기서 — `AndroidAppDownloads`.
 *
 * 진입점 = 사이드바 [도구] «스페이스기전 데스크톱»(교사 [도구] 끝 · 학생은 이 메뉴로 [도구] 범례 신설, 2026-10-20).
 * 이 파일은 껍데기(누가 보는가)만, 본문은 `DesktopAppDownloads`(세션 없이 그려지게 — 하네스가 같은 몸을 띄운다).
 */
import { Layout } from '@/components/layout/Layout';
import { PageContainer } from '@/components/layout/PageContainer';
import { useAuth } from '@/components/auth/AuthProvider';
import { desktopAppsForViewer, isWindowsDesktop } from '@/lib/desktopApps';
import { androidAppsForViewer, isAndroidDevice } from '@/lib/androidApps';
import { AndroidAppDownloads } from './AndroidAppDownloads';
import { DesktopAppDownloads } from './DesktopAppDownloads';
import { GameModelCard } from './GameModelCard';

export default function DesktopAppPage() {
  const { isStudentView, isRealAdmin, user } = useAuth();
  const channels = desktopAppsForViewer({ isStudentView, isRealAdmin });
  return (
    <Layout>
      <PageContainer width="narrow">
        <DesktopAppDownloads channels={channels} windows={isWindowsDesktop()}
          // 학생판을 보는 사람(학생 · 실제 관리자)에게만 — «이세계에서는 사회인» 3D 모델(2026-10-21)
          extra={channels.includes('student') ? <GameModelCard canEdit={isRealAdmin} userId={user?.id ?? null} /> : null}
          // 휴대폰 앱 APK(2026-11-10) — 스페이스기전 앱은 모두, 교실(전자칠판)판은 교직원
          mobile={<AndroidAppDownloads channels={androidAppsForViewer({ isStudentView })} android={isAndroidDevice()} />} />
      </PageContainer>
    </Layout>
  );
}
