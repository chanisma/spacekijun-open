import { Layout } from '@/components/layout/Layout';
import ClassroomTypeBody from './ClassroomTypeBody';

/**
 * 교실 기기 비밀번호 보내기 화면 — 본문은 `ClassroomTypeBody`.
 * 휴대폰으로 QR 을 찍으면 가벼운 모바일 앱(src/mobile)이 같은 본문을 앱 틀 없이 띄운다(2026-10-29) — 큰 본 앱을 받지 않게
 * 본문 파일에는 `Layout` 을 들이지 않는다.
 */
export default function ClassroomTypePage() {
  return (
    <Layout>
      <ClassroomTypeBody />
    </Layout>
  );
}
