import { useContext, type ReactNode } from 'react';
import { WardrobeContext } from './wardrobeContext';
import { gameAsset } from './gameAsset';
import { GameModal } from './GameModal';
import { npcDetails, type Npc } from './world';
import styles from './game.module.css';
export function CharacterPanel({ npc, title, onClose, reduced, children, className = '' }: { npc: Npc; title: string; onClose: () => void; reduced?: boolean; children: ReactNode; className?: string }) {
  const person = npcDetails[npc];
  const outfit = useContext(WardrobeContext);
  return <GameModal title={title} onClose={onClose} reduced={reduced} className={`${styles.characterScene} ${npc === 'serin' ? styles.roommateScene : ''} ${className}`}>
    <img className={styles.vnPortrait} src={gameAsset((npc === 'lamplighter' ? 'lamplighter' : outfit[npc]))} alt={person.name} />
    <div className={styles.vnContent}>{children}</div>
  </GameModal>;
}
