import { useContext } from 'react';
import { GameModal } from './GameModal';
import { WardrobeContext } from './wardrobeContext';
import { gameAsset } from './gameAsset';
import { useChapterPlayback } from './useChapterPlayback';
import styles from './game.module.css';
import css from './chapter.module.css';

const postludeStory = [
  { speaker: 'luon', text: '리아, 우편국에서 읽은 편지는 어땠어요? 세상에서 들려온 소식에 리아의 질문도 하나 남았네요.' },
  { speaker: 'ria', text: '네. 처음에는 저와 먼 이야기인 줄 알았는데, 읽다 보니 더 알아보고 싶은 게 생겼어요. 제 질문으로 남겨 두니 다시 찾아보고 싶고요.' },
  { speaker: 'luon', text: '이제 도서관도, 연구시설도, 기숙사와 우편국도 알게 됐네요. 앞으로는 리아가 가 보고 싶은 곳을 정해서, 스스로 탐험을 이어 갈 수 있을 것 같아요?' },
  { speaker: 'ria', text: '아직 망설일 때도 있을 것 같아요. 그래도 궁금한 게 생기면 어디로 가 볼지 조금은 알겠어요. 이제 제가 가고 싶은 곳부터 찾아가 볼래요.' },
  { speaker: 'luon', text: '저는 리아가 해낼 수 있을 거라고 믿어요. 방금도 무엇이 궁금한지, 어디로 가고 싶은지 리아가 직접 이야기해 줬잖아요.' },
  { speaker: 'luon', text: '도움이 필요하면 얼마든지 찾아와요. 저는 이 광장에 있을게요. 길이 헷갈릴 때도, 새로 알게 된 걸 누군가에게 들려주고 싶을 때도요.' },
  { speaker: 'ria', text: '고마워요, 루온. 다녀와서 제가 찾은 이야기도 들려드릴게요.' },
  { speaker: 'luon', text: '그리고 플래너에 리아가 이루고 싶은 목표를 하나 세워 봐요. 그 목표에 연결된 서로 다른 계획을 다섯 개 이상 실천하면, 새로 알려 주고 싶은 게 있어요. 그때 이 광장에서 다시 만나요.' },
  { speaker: 'ria', text: '하나의 목표를 향해 다섯 가지 계획을 해 보는 거군요. 어떤 걸 알려 주실지 궁금해요. 우선 제가 해 보고 싶은 목표부터 적어 볼게요.' },
] as const;

export function PostludeScene({ step, busy, error, readOnly, reduced, onNext, onClose }: {
  step: number; busy: boolean; error: string; readOnly: boolean; reduced: boolean; onNext: () => void; onClose: () => void;
}) {
  const outfit = useContext(WardrobeContext), playback = useChapterPlayback(step);
  const beat = postludeStory[Math.min(playback.step, postludeStory.length - 1)];
  return <GameModal title="루온과의 약속 · 나의 발걸음으로" reduced={reduced} onClose={() => { if (!busy) onClose(); }} className={`${styles.characterScene} ${css.scene} ${css.postludeScene}`}>
    <img className={css.postludeBackground} src={gameAsset('plaza')} alt="우편국에서 돌아온 중앙 광장" />
    <div className={css.postludePair}>
      <img data-speaker={beat.speaker === 'ria'} className={css.postludeRia} src={gameAsset(outfit.ria)} alt="리아" />
      <img data-speaker={beat.speaker === 'luon'} className={css.postludeLuon} src={gameAsset(outfit.luon)} alt="루온" />
    </div>
    <header className={css.heading}><small>CHAPTER IV · EPILOGUE</small><h2>나의 발걸음으로</h2><p>중앙 광장에서 루온과 나누는 약속</p></header>
    <div className={css.dialogue} data-arrival="true"><strong className={css.speaker}>{beat.speaker === 'ria' ? '리아' : '루온'}</strong><p className={css.speech}>{beat.text}</p>
      {error && <p role="alert" className={css.error}>{error}</p>}
      {readOnly && <p className={css.notice}>학생 시점 열람 · 책갈피는 변경하지 않아요.</p>}
      <div className={css.actions}><button disabled={busy || playback.step === 0} onClick={playback.back}>← 이전 대사</button>
        {playback.reviewing ? <button onClick={playback.forward}>다음 대사 →</button> : <button disabled={busy || readOnly} onClick={onNext}>{busy ? '책갈피를 보관하는 중…' : step === 8 ? '나의 탐험 시작하기' : '다음 이야기 →'}</button>}
      </div><small className={css.bookmark}>{playback.step + 1} / 9 · 이야기는 여기부터 다시 이어집니다.</small>
    </div>
  </GameModal>;
}
