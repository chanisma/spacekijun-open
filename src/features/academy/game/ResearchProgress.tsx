import { useEffect, useState } from 'react';
export type ResearchPhase = 'context' | 'analysis' | 'graph' | 'draft';
const steps: [ResearchPhase, string][] = [['context', '과목과 참고 자료 준비'], ['analysis', '교수가 탐구 설계 작성'], ['graph', '설계도를 별자리 지도에 연결'], ['draft', '연구 수첩에 초안 보관']];
export function ResearchProgress({ phase, startedAt, paused = false }: { phase: ResearchPhase; startedAt: number; paused?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const index = steps.findIndex(([id]) => id === phase);
  return <div aria-label="탐구 설계 진행 상황"><ol>{steps.map(([id, label], i) => <li key={id} aria-current={i === index ? 'step' : undefined} style={{ opacity: i > index ? .5 : 1 }}>{i < index ? '✓' : i === index ? '✦' : '○'} {label}{i === index && (paused ? ' · 잠시 멈춤' : ' · 진행 중')}</li>)}</ol><p><time>{Math.floor(seconds / 60)}분 {seconds % 60}초</time> 경과</p><small>{phase === 'analysis' ? '질문과 별자리 자료를 함께 읽고 탐구 내용을 작성하고 있어요. 완성되면 별자리 연결 단계로 넘어가요.' : phase === 'draft' ? '설계도는 완성됐어요. 다시 펼칠 수 있도록 초안을 저장하고 있어요.' : phase === 'graph' ? '완성된 탐구 내용을 기존 별과 연결하고 있어요.' : '선택한 과목의 성취기준과 함께 가져온 자료를 확인하고 있어요.'}</small>{seconds >= 60 && phase === 'analysis' && <p>평소보다 오래 걸리고 있어요. 긴 설계 응답이나 서버의 재시도 때문에 지연될 수 있어요. 다른 곳을 다녀와도 서버에 접수된 의뢰는 계속 진행돼요.</p>}</div>;
}
