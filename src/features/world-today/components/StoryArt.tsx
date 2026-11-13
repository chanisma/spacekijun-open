import { cn } from '@/lib/utils';
import styles from '../world-today.module.css';

/** 한 장의 공통 삽화를 캐시하고 네 장면을 재사용한다. 기사 속 실제 사건의 사진이 아니다. */
export function StoryArt({ scene = 0, className }: { scene?: number; className?: string }) {
  return <div aria-hidden="true" className={cn('relative overflow-hidden', className)}>
    <div className={styles.art} style={{ backgroundPosition: `${scene % 2 ? 100 : 0}% ${scene >= 2 ? 100 : 0}%` }} />
  </div>;
}
