import { WardrobeContext } from './wardrobeContext';
import { gameAsset } from './gameAsset';
import { useContext, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchInquiryWorkspace } from './experienceService';
import { GameModal } from './GameModal';
import { journeyObjectives, journeyStages } from '../../../../supabase/functions/_shared/academyJourney';
import type { SelfDiscovery } from '../../../../supabase/functions/_shared/academyDiscovery';
import type { GameProgress } from './progress';
import { writeGrowth, type GrowthState } from './growthService';
import styles from './game.module.css';

export type GrowthView = 'journey' | 'self';
export type GuideAction = 'luon' | 'book' | 'journal' | 'letters' | 'telescope' | 'design' | 'history' | 'self' | 'journey' | 'professor';
interface Props {
  mode: GrowthView; state: GrowthState; progress: GameProgress | null | undefined; userId: string; studentId: string;
  onClose: () => void; onGo: (action: GuideAction) => void; onTalk: () => void; reduced: boolean; seed?: string;
}
export function GrowthPanel({ mode, state, progress, userId, studentId, onClose, onGo, onTalk, reduced, seed = '' }: Props) {
  const cache = useQueryClient();
  const outfit = useContext(WardrobeContext);
  const journey = state.journey;
  const workspace = useQuery({ queryKey: ['inquiry-design', 'workspace', studentId, null], queryFn: () => fetchInquiryWorkspace(studentId), enabled: mode === 'journey' && !!journey, staleTime: 0 });
  const [designId, setDesignId] = useState(journey?.design_id ?? '');
  const [reflection, setReflection] = useState(journey?.reflection ?? '');
  const [source, setSource] = useState<'first' | 'journey'>(journey?.stage === 'completed' ? 'journey' : 'first');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const refresh = async () => { await Promise.all([cache.invalidateQueries({ queryKey: ['academy-growth', userId] }), cache.invalidateQueries({ queryKey: ['inquiry-design', 'workspace', studentId] })]); };
  async function commit(body: Record<string, unknown>) {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await writeGrowth(body);
      await refresh();
      if (result.journey && body.action !== 'start' && body.revision === result.journey.revision && result.journey.stage !== 'completed') {
        setError('다른 창의 진행 기록을 가져왔어요. 현재 의뢰 단계를 확인해 주세요.'); return false;
      }
      setNotice('리아의 기록을 보관했어요. 다음 방문에도 이어집니다.'); return true;
    } catch (e) { setError(e instanceof Error ? e.message : '다시 시도해 주세요.'); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  const names = { journey: '질문이 별이 되는 여정', self: '마음의 별자리' };
  const selected = workspace.data?.savedDesigns.find(d => d.id === journey?.design_id);
  return <GameModal title={names[mode]} onClose={() => { if (!lock.current) onClose(); }} reduced={reduced} className={styles.growthPanel}>
    <header className={styles.facilityHeader}><img src={gameAsset(outfit.professor)} alt="카시안" /><div><span className={styles.kicker}>RIA'S JOURNEY</span><h2>{names[mode]}</h2><p>{mode === 'self' ? '“네가 경험하고 직접 확인한 생각으로, 너의 별을 밝혀 보자.”' : '“작은 질문 하나에서 다음 이야기가 시작된단다.”'}</p></div></header>
    <fieldset disabled={busy} className={styles.growthBody}>
      {mode === 'journey' && <>
        <ol className={styles.checklist}>{['첫 질문 전달', '내 탐구 확정', '실제 활동 연결', '발견 회고'].map((title, i) => <li key={title} data-done={!!journey && journeyStages.indexOf(journey.stage) >= i}><span>{i + 1}</span>{title}</li>)}</ol>
        <blockquote>{journey?.source_question ?? progress?.question ?? '도서관에서 나만의 질문을 발견해 보세요.'}</blockquote>
        {!journey ? <><p>도서관에서 기록한 질문을 카시안과 실제 탐구로 이어가요.</p><button className={styles.goldButton} disabled={progress?.quest_step !== 'completed'} onClick={() => void commit({ action: 'start', revision: 0 })}>카시안의 연속 의뢰 수락하기</button>{progress?.quest_step !== 'completed' && <button className={styles.mapButton} onClick={() => onGo('journal')}>제2장 이야기 이어가기</button>}</> : <>
          <p className={styles.objective}>{journeyObjectives[journey.stage]}</p>
          {journey.stage !== 'completed' && <><button className={styles.goldButton} onClick={() => onGo('design')}>이 질문으로 연구대에서 이어가기</button><button className={styles.mapButton} onClick={() => onGo('history')}>연구 수첩에서 실행 활동 연결하기</button>
            {workspace.isPending ? <p role="status">내 탐구 설계를 가져오고 있어요…</p> : workspace.isError ? <button onClick={() => void workspace.refetch()}>내 탐구 다시 불러오기</button> : <><label>이번 의뢰에 연결할 나의 확정 탐구<select value={designId} onChange={e => setDesignId(e.target.value)}><option value="">내 탐구 선택</option>{workspace.data?.savedDesigns.filter(d => ['saved', 'observed'].includes(d.status)).map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label><button className={styles.mapButton} disabled={!designId || designId === journey.design_id} onClick={() => void commit({ action: 'bind', revision: journey.revision, designId })}>이 탐구를 의뢰에 연결하기</button></>}
            {journey.design_id && <p>연결한 탐구 · {selected?.title ?? '기록 확인 중'}</p>}
            {['planned', 'observed'].includes(journey.stage) && <button className={styles.goldButton} onClick={() => void commit({ action: 'observe', revision: journey.revision })}>교수에게 실행 기록 확인받기</button>}
            {journey.stage === 'observed' && <><label>발견한 내용과 나의 생각<textarea aria-label="연속 의뢰 회고" value={reflection} onChange={e => setReflection(e.target.value)} maxLength={4000} placeholder="무엇을 직접 해 보았나요? 예상과 달랐던 점, 도움이 된 방법, 나에 대해 알게 된 점을 들려주세요." /></label><small>40~4,000자 · 기존 탐구의 성찰 기록에도 같은 내용이 보관됩니다.</small>{selected?.reflection && <><details><summary>현재 탐구에 보관한 성찰 보기</summary><p>{selected.reflection}</p></details><button className={styles.textButton} onClick={() => setReflection(selected.reflection ?? '')}>보관한 성찰을 가져와 이어 쓰기</button></>}<button className={styles.goldButton} disabled={reflection.trim().length < 40} onClick={() => void commit({ action: 'complete', revision: journey.revision, reflection })}>내 회고로 의뢰 마치기 ✦</button></>}
          </>}
          {journey.stage === 'completed' && <><div className={styles.rewardBurst}>✦</div><h3>회고의 별을 밝혔어요</h3><blockquote>{journey.reflection}</blockquote><button className={styles.goldButton} onClick={() => onGo('self')}>이 경험에서 나를 알아보기</button></>}
        </>}
      </>}
      {mode === 'self' && <><div className={styles.innerSky} aria-label="내가 확인한 마음의 별">{(['first', 'journey'] as const).map((s, i) => { const found = state.discoveries.find(d => d.source === s); return <button key={s} aria-pressed={source === s} data-lit={!!found} onClick={() => setSource(s)}><span>{found ? '✦' : '✧'}</span><strong>{i ? '경험에서 발견한 나' : '첫 질문에서 발견한 나'}</strong><small>{found ? found.statement : '아직 확인한 문장이 없어요'}</small></button>; })}</div><DiscoveryEditor key={source} row={state.discoveries.find(d => d.source === source)} source={source} evidence={source === 'first' ? progress?.question : journey?.stage === 'completed' ? journey.reflection : null} seed={seed} onSave={commit} /><button className={styles.mapButton} onClick={onTalk}>카시안과 나에 대해 이야기하기</button><p className={styles.chatNote}>본인이 확인한 문장입니다. 언제든 고치거나 NPC의 다음 기억 조회에서 제외할 수 있어요. 기존 일일 대화 기록은 그대로 남습니다.</p></>}
    </fieldset>
    {busy && <p role="status">리아의 기록을 보관하고 있어요…</p>}{error && <p className={styles.error} role="alert">{error} <button onClick={() => void refresh()}>현재 기록 다시 불러오기</button></p>}{notice && <p role="status">{notice}</p>}
  </GameModal>;
}
function DiscoveryEditor({ row, source, evidence, seed, onSave }: { row?: SelfDiscovery; source: 'first' | 'journey'; evidence?: string | null; seed: string; onSave: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [text, setText] = useState(seed || row?.statement || '');
  const [confirmed, setConfirmed] = useState(false);
  return <section className={styles.discoveryEditor}><h3>{source === 'first' ? '내 질문에서 어떤 부분에 끌렸나요?' : '이 경험을 통해 나에 대해 무엇을 알게 되었나요?'}</h3>{evidence ? <><details open><summary>함께 돌아볼 내 기록</summary><p>{evidence}</p></details>{row && <><p>현재 확인한 문장 · {row.statement}</p>{row.previous_statement && <details><summary>이전에 확인한 문장</summary><p>{row.previous_statement}</p></details>}</>}<label>내가 확인한 나의 모습<textarea aria-label="나에 대한 발견" value={text} maxLength={1000} onChange={e => { setText(e.target.value); setConfirmed(false); }} placeholder="나는 … 상황에서 … 하는 과정에 끌린다는 것을 알게 되었다. 다음에는 … 해 보고 싶다." /></label><label className={styles.confirmDiscovery}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />내 경험을 돌아보고 직접 확인한 문장입니다.</label><button className={styles.goldButton} disabled={!confirmed || text.trim().length < 10} onClick={() => void onSave({ action: 'discover', source, revision: row?.revision ?? 0, statement: text }).then(ok => { if (ok) setConfirmed(false); })}>내 문장으로 별 밝히기</button></> : <p>{source === 'first' ? '여행 수첩에 첫 질문을 남기면 그 기록에서 시작할 수 있어요.' : '연속 의뢰를 마친 회고에서 두 번째 별을 발견할 수 있어요.'}</p>}{row && <button className={styles.textButton} onClick={() => void onSave({ action: 'discover', source, revision: row.revision, memory: !row.memory_enabled })}>{row.memory_enabled ? '이 문장을 NPC 기억에서 제외하기' : '이 문장을 NPC가 다시 참고하게 하기'}</button>}</section>;
}
