// Spec Workspace(R2): 로컬 HWPX를 "양식"으로 만드는 시각 작업대.
// 편집 표면(오버레이+타깃 패널+탐지 칩+AI 라벨 보완)은 공용 SpecStudio가 담당 —
// 러너 confirm의 "시각 검수" 모달과 UI·기능이 항상 동일하다. 여기는 파일 정규화·
// detect 초기화·양식 이름·저장만 맡는다.
// 연구: docs/superpowers/specs/2026-07-25-rhwp-spec-workspace-research.md
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { convertToHwpxBytes, isHwpxZip } from '@/lib/rhwp/coreEngine';
import { createSpecTemplate, loadHwpxSections } from '../services/specTemplateService';
import { DETECTORS, SpecStudio } from './SpecStudio';
import { detectSpecDraft, type WorkSpec } from '../document/spec';

export interface SpecWorkspaceProps {
  file: File;
}

export function SpecWorkspace({ file }: SpecWorkspaceProps) {
  const [spec, setSpec] = useState<WorkSpec | null>(null);
  const [sections, setSections] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [busy, setBusy] = useState<'detect' | 'save' | null>('detect');
  const [savedId, setSavedId] = useState<string | null>(null);
  // .hwp(바이너리)는 진입 시 HWPX로 정규화 — 스펙 파이프라인·오버레이·저장이 같은 바이트 공유
  const [normalized, setNormalized] = useState<File | null>(null);

  const loadSource = useCallback(
    () => Promise.resolve<Blob>(normalized ?? file),
    [normalized, file],
  );

  // 정규화 + detect 자동 제안으로 초기 스펙 구성
  useEffect(() => {
    let cancelled = false;
    setBusy('detect');
    setSavedId(null);
    setNormalized(null);
    setSpec(null);
    (async () => {
      try {
        let workFile = file;
        if (!(await isHwpxZip(file))) {
          const bytes = await convertToHwpxBytes(file);
          workFile = new File([bytes as BlobPart], file.name.replace(/\.hwp$/i, '') + '.hwpx', {
            type: 'application/hwp+zip',
          });
          if (cancelled) return;
          setNormalized(workFile);
          toast.info('HWP 문서를 HWPX로 변환해 양식 작업을 시작합니다.');
        }
        const src = await loadHwpxSections(workFile);
        if (cancelled) return;
        setSections(src.sections);
        const name = file.name.replace(/\.(hwpx?|hwp)$/i, '');
        const detected = detectSpecDraft(src.sections, name);
        const initial = new Set(DETECTORS.filter((d) => d.on).map((d) => d.key));
        setSpec({
          ...detected.draft,
          targets: detected.draft.targets.filter((t) => t.detector && initial.has(t.detector)),
        });
        setNotes(detected.instructions);
        setTemplateName(name);
        toast.success(`기본 기준(누름틀·체크박스·자리표시자 등) 제안을 표시했습니다. 상단 칩으로 기준을 켜고 끄거나, 문서를 직접 클릭·드래그해 지정하세요.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '문서를 분석하지 못했습니다.');
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  const unconfirmed = useMemo(() => spec?.targets.filter((t) => t.confirmRequired).length ?? 0, [spec]);

  const handleSave = async () => {
    if (!spec) return;
    if (unconfirmed > 0) {
      toast.error(`확정되지 않은 제안 ${unconfirmed}건이 있습니다. 각 항목을 확인 또는 삭제하세요.`);
      return;
    }
    setBusy('save');
    try {
      const row = await createSpecTemplate({ name: templateName || spec.documentType, file: normalized ?? file, spec });
      setSavedId(row.id);
      toast.success(`양식 스펙을 저장했습니다 — 업무 흐름의 "HWPX 스펙 기반 문서 생성"에서 바로 사용할 수 있습니다.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setBusy(null);
    }
  };

  if (busy === 'detect' || !spec) {
    return (
      <div className="flex h-[calc(100vh-245px)] min-h-[620px] items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />작성 지점 자동 제안 중
      </div>
    );
  }

  return (
    <SpecStudio
      loadSource={loadSource}
      sections={sections}
      spec={spec}
      onChange={setSpec}
      headerLeft={
        <Input className="h-8 text-xs" placeholder="양식 이름" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
      }
      headerRight={
        <Button size="sm" disabled={busy != null || unconfirmed > 0} onClick={() => void handleSave()}>
          {busy === 'save' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
          스펙 저장
        </Button>
      }
      infoSlot={
        <>
          {savedId && (
            <p className="rounded bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">저장됨 · 템플릿 ID {savedId.slice(0, 8)}…</p>
          )}
          {notes.length > 0 && (
            <p className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-500">문서 내 지침: {notes.join(' / ').slice(0, 160)}</p>
          )}
        </>
      }
    />
  );
}
