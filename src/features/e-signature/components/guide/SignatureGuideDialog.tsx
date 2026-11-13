/**
 * 전자서명 사용 방법 — 안내 모달.
 *
 * 왼쪽 시연(`scenes.tsx`)과 오른쪽 설명이 **한 단계에서 짝**을 이룬다.
 * 설명은 화면에 보이는 것을 되풀이하지 않는다 — 시연이 "어디를 누르는지" 를 이미
 * 말하므로, 글은 **왜 그렇게 하는지와 모르면 손해 보는 것**을 맡는다.
 * (예: 같은 번호 = 동시 서명 / 7일 뒤 파일 삭제 / QR 링크는 본인 전용)
 */
import React from 'react';
import { WalkthroughDialog, type WalkthroughStep } from '@/components/walkthrough/WalkthroughDialog';
import {
  SceneCreateRequest, SceneExport, SceneFieldPlacement, SceneSign,
} from './scenes';

const B: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <strong className="font-semibold text-slate-800">{children}</strong>
);

const STEPS: WalkthroughStep[] = [
  {
    id: 'create',
    label: '요청 만들기',
    title: '문서를 붙이고 서명자를 고릅니다',
    scene: <SceneCreateRequest />,
    body: (
      <>
        전자서명은 <B>한글(hwpx)·PDF·이미지</B> 어떤 문서에나 붙습니다.
        문서를 붙이면 모달이 넓어지면서 오른쪽에 문서가 나타납니다 — 서명자를 더하는 동안
        문서를 계속 보면서 작업하라는 뜻입니다.
      </>
    ),
    points: [
      <>서명자는 <B>이름으로 검색</B>해서 고릅니다. 교직원 명부에 있는 사람이면 됩니다.</>,
      <>제목은 목록과 알림에 그대로 보이므로, 받는 사람이 무슨 문서인지 알 수 있게 씁니다.</>,
      <>문서를 바꾸면 이전 문서 위에 그려 둔 서명칸은 <B>모두 지워집니다</B> — 다른 문서의 좌표라 의미가 없기 때문입니다.</>,
    ],
  },
  {
    id: 'fields',
    label: '위치 지정',
    title: '문서 위에 각자의 서명칸을 그립니다',
    scene: <SceneFieldPlacement />,
    body: (
      <>
        왼쪽에서 서명자 <B>행을 누르면</B> 그 사람이 선택되고, 그 상태로 문서 위를 드래그하면
        그 사람의 서명칸이 됩니다. 사람마다 색이 달라 누구 칸인지 한눈에 보입니다.
        서명은 칸 크기에 맞춰 <B>비율을 유지한 채</B> 들어갑니다.
      </>
    ),
    points: [
      <><B>같은 번호</B>를 가진 사람들은 동시에 서명합니다 — 순서를 기다리지 않습니다.</>,
      <><B>다음 번호</B>는 앞 번호가 <B>전원</B> 끝나야 차례가 옵니다. 결재처럼 위계를 만들 때 씁니다.</>,
      <>한 사람이 여러 칸을 가질 수 있습니다(예: 쪽마다 서명).</>,
      <>한 명이라도 <B>거절하면 요청 전체가 종료</B>됩니다.</>,
    ],
  },
  {
    id: 'sign',
    label: '서명하기',
    title: '문서를 보면서 서명합니다',
    scene: <SceneSign />,
    body: (
      <>
        내 차례가 되면 <B>알림</B>이 가고, 목록에서 <B>맨 위</B>에 올라옵니다.
        서명 화면은 왼쪽이 문서, 오른쪽이 서명 패널입니다 — 무엇에 서명하는지 보면서 하라는
        구성이라, 긴 문서라도 서명 칸이 화면 밖으로 밀리지 않습니다.
      </>
    ),
    points: [
      <>문서에서 <B>내 칸만 강조</B>됩니다. 칸이 여러 개면 어디에 찍히는지 미리 보입니다.</>,
      <>마우스 서명이 각지면 <B>QR을 찍어 휴대폰</B>에서 손으로 씁니다. 로그인 없이 서명할 수 있는 링크가 나갑니다.</>,
      <>그 QR·링크는 <B>본인 전용</B>입니다 — 가진 사람이 그 사람 이름으로 서명하게 되므로 남에게 보내지 마세요. 한 번 쓰면 링크는 죽습니다.</>,
      <>서명하기 전에도 <B>원본을 내려받을 수</B> 있습니다.</>,
    ],
  },
  {
    id: 'export',
    label: '보관·정리',
    title: '끝나면 옮기세요 — 7일 뒤 지워집니다',
    scene: <SceneExport />,
    body: (
      <>
        모두 서명하면 완성본이 만들어집니다. 이때 <B>[내보내기]</B>에서 Google Drive로 옮기는 것이
        먼저이고, 내려받기·출력은 그다음입니다. 서버는 서명을 <B>주고받는 곳</B>이지
        보관하는 곳이 아니기 때문입니다.
      </>
    ),
    points: [
      <>Drive로 옮기면 서버의 파일은 <B>즉시</B> 지워집니다(원본은 증거로 남습니다).</>,
      <><B>7일이 지나면 원본과 서명본이 모두 지워집니다.</B> 서명이 끝나지 않았어도 요청한 지 7일이면 같습니다.</>,
      <>화면에 <B>남은 날짜와 정확한 시각</B>이 늘 보이고, 3일 전에 알림이 갑니다.</>,
      <>파일이 지워져도 <B>요청 기록과 이미 받은 서명은 남습니다</B> — 누가 무엇을 요청했는지는 기록입니다.</>,
    ],
  },
];

export const SignatureGuideDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => (
  <WalkthroughDialog
    open={open}
    onOpenChange={onOpenChange}
    title="전자서명 사용 방법"
    description="문서에 여러 사람의 서명을 받고, 끝나면 보관하기까지 4단계"
    steps={STEPS}
  />
);

export default SignatureGuideDialog;
