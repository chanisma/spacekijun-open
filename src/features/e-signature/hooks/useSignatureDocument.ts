/**
 * 원본·완성본 문서 조달과 내려받기·출력.
 *
 * 완성본은 **필요할 때 굽는다**. 미리 구워 저장해 두면 서명이 하나 추가될 때마다 낡은
 * 파일이 남는데, 그 파일이 최신인지 아닌지 화면에서 구분할 방법이 없다. 대신 한 번 구우면
 * Storage 에 올려 두고(`signed_path`) 다음부터는 그걸 내려받는다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { popupReauth } from '@/services/googlePopupReauth';
import {
  downloadSignatureFile, uploadSignedFile,
} from '../services/signatureService';
import { archiveToDrive, readDriveArchive } from '../services/signatureDrive';
import { collectStampItems, signedFileName, stampDocument } from '../lib/stampDocument';
import type { SignatureRequest } from '../types';

/** Drive 이관 단계 — 모달 안에 그대로 그려진다 */
export type ArchivePhase =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'needs-auth' }
  | { kind: 'done' }
  | { kind: 'failed'; message: string };

export function useSignatureDocument(request: SignatureRequest | null, enabled: boolean) {
  const [source, setSource] = useState<Blob | null>(null);
  const [signed, setSigned] = useState<Blob | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [isBuilding, setBuilding] = useState(false);
  /**
   * Drive 이관 단계. 화면이 이걸 그대로 그린다(토스트 대신).
   *   idle       아직 시도 안 함
   *   working    굽는 중 또는 올리는 중
   *   needs-auth 구글 인증이 필요하다 — 다음 행동이 화면에 남아 있어야 한다
   *   done       옮겼다
   *   failed     사유를 화면에 남긴다(사라지지 않게)
   */
  const [archivePhase, setArchivePhase] = useState<ArchivePhase>({ kind: 'idle' });
  const { user } = useAuth();
  const qc = useQueryClient();

  /** 이미 Drive 로 옮겼는가 — 화면이 버튼 대신 링크를 보여 줄지 정한다 */
  const driveArchive = request ? readDriveArchive(request) : null;
  /** 요청자 본인인가. 사용자 OAuth 라 올린 사람의 Drive 로 가는데 문서 주인은 요청자다 */
  const isRequester = !!request && !!user?.id && request.requesterUserId === user.id;

  /**
   * **파일이 서버에 없는가.**
   *
   * 두 경우에 없다 — ①Drive 로 옮겼을 때(옮기는 즉시 Storage 에서 지운다)
   * ②기한이 지나 정리됐을 때. 둘 다 내려받기를 시도하면 **400 이 난다**(실사용 확인).
   * `purgedAt` 만 보면 부족하다: Drive 이관 직후에는 클라이언트가 파일을 지웠지만
   * 서버 정리(`purged_at` 기록)는 아직 안 돌았을 수 있다.
   */
  const filesGone = !!request && (!!request.purgedAt || !!readDriveArchive(request));

  // 원본은 열 때 한 번만 받는다
  useEffect(() => {
    if (!enabled || !request || request.sourcePath === 'pending' || filesGone) {
      setSource(null); setSigned(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSigned(null);

    (async () => {
      try {
        const blob = await downloadSignatureFile(request.sourcePath);
        if (!cancelled) setSource(blob);

        // 이미 구워 둔 완성본이 있으면 그것을 보여 준다(다시 굽지 않는다)
        if (request.signedPath) {
          const done = await downloadSignatureFile(request.signedPath);
          if (!cancelled) setSigned(done);
        }
      } catch (e) {
        console.error('문서 조회 실패', e);
        if (!cancelled) toast.error('문서를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // request 전체를 넣지 않는다 — 폴링으로 객체 참조만 바뀌어도 파일을 다시 내려받게 된다.
    // 실제로 문서가 달라지는 것은 아래 값들뿐이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, request?.id, request?.sourcePath, request?.signedPath, filesGone]);

  const stampItems = useMemo(
    () => (request ? collectStampItems(request) : []),
    [request],
  );

  /**
   * 내려받을 파일을 만든다.
   *
   * 완료된 요청은 **완성본을 Storage 에 저장**해 다음부터 다시 굽지 않게 한다.
   * 진행 중이면 굽되 저장하지 않는다 — 아직 서명이 더 붙을 문서라 확정본이 아니다.
   */
  const build = useCallback(async (): Promise<{ blob: Blob; name: string } | null> => {
    if (!request || !source) return null;
    if (signed) return { blob: signed, name: signedFileName(request) };
    if (stampItems.length === 0) return { blob: source, name: request.sourceName };

    setBuilding(true);
    try {
      const blob = await stampDocument(request, source, stampItems);
      const name = signedFileName(request);

      if (request.status === 'completed' && !request.signedPath) {
        try {
          await uploadSignedFile(request.id, name, blob);
        } catch (e) {
          // 저장에 실패해도 내려받기는 되어야 한다 — 사용자 목적은 파일을 얻는 것이다
          console.error('완성본 저장 실패(내려받기는 계속)', e);
        }
      }
      setSigned(blob);
      return { blob, name };
    } catch (e) {
      console.error('서명본 생성 실패', e);
      toast.error(e instanceof Error ? e.message : '서명본을 만들지 못했습니다.');
      return null;
    } finally {
      setBuilding(false);
    }
  }, [request, source, signed, stampItems]);

  /**
   * Drive 로 옮기기 — **토스트를 쓰지 않는다**.
   *
   * 종전엔 결과를 토스트로 알렸는데 두 가지가 나빴다: 금방 사라져 놓치기 쉽고,
   * "인증하고 보관" 같은 **다음 행동**을 토스트 버튼에 숨기면 발견되지 않는다.
   * 지금은 상태를 그대로 돌려주고 **화면이 모달 안에 단계로 그린다**.
   */
  const archive = useCallback(async (): Promise<ArchivePhase> => {
    if (!request || request.status !== 'completed') {
      return { kind: 'failed', message: '아직 서명이 끝나지 않았습니다.' };
    }
    if (readDriveArchive(request)) return { kind: 'done' };

    setArchivePhase({ kind: 'working' });
    const made = await build();
    if (!made) {
      const failed: ArchivePhase = { kind: 'failed', message: '서명본을 만들지 못했습니다.' };
      setArchivePhase(failed);
      return failed;
    }

    const result = await archiveToDrive(request, made.blob, made.name);
    let next: ArchivePhase;
    if (result.status === 'uploaded' || result.status === 'already') {
      next = { kind: 'done' };
      void qc.invalidateQueries({ queryKey: ['signature-requests'] });
    } else if (result.status === 'needs-auth') {
      next = { kind: 'needs-auth' };
    } else {
      next = { kind: 'failed', message: result.message };
    }
    setArchivePhase(next);
    return next;
  }, [request, build, qc]);

  /** 구글 재인증 후 이어서 옮긴다. 화면의 [Google 인증하고 옮기기] 가 부른다. */
  const authenticateAndArchive = useCallback(async (): Promise<ArchivePhase> => {
    setArchivePhase({ kind: 'working' });
    const ok = await popupReauth();
    if (!ok) {
      const failed: ArchivePhase = {
        kind: 'failed',
        message: '구글 인증이 취소됐거나 실패했습니다.',
      };
      setArchivePhase(failed);
      return failed;
    }
    return archive();
  }, [archive]);

  const resetArchivePhase = useCallback(() => setArchivePhase({ kind: 'idle' }), []);

  const download = useCallback(async () => {
    const made = await build();
    if (!made) return;
    const url = URL.createObjectURL(made.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = made.name;
    a.click();
    // 즉시 해제하면 일부 브라우저에서 저장이 취소된다
    setTimeout(() => URL.revokeObjectURL(url), 60_000);

  }, [build]);

  /**
   * 바로 출력.
   *
   * PDF·이미지는 새 창에서 곧장 인쇄할 수 있지만 **한글 파일은 브라우저가 못 연다** —
   * 그 경우는 내려받기로 돌린다(거짓으로 인쇄창을 띄우는 것보다 낫다).
   */
  const print = useCallback(async () => {
    if (!request) return;
    if (request.sourceKind === 'hwpx') {
      toast.info('한글 문서는 내려받아 한글에서 인쇄해 주세요.');
      await download();
      return;
    }
    const made = await build();
    if (!made) return;

    const url = URL.createObjectURL(made.blob);
    const win = window.open(url, '_blank');
    if (!win) {
      toast.error('팝업이 차단됐습니다. 팝업을 허용하거나 내려받아 인쇄해 주세요.');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    win.addEventListener('load', () => win.print(), { once: true });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [request, build, download]);

  return {
    source, signed, isLoading, isBuilding, download, print,
    /** 파일이 서버에 없다(Drive 로 옮겼거나 기한이 지나 정리됨) */
    filesGone,
    // Drive 이관 — 상태를 그대로 내준다. 알림은 화면이 모달 안에서 그린다.
    archive, authenticateAndArchive, archivePhase, resetArchivePhase,
    driveArchive, isRequester,
  };
}
