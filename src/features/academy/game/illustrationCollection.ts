import { skyChapterStory } from './skyChapterStory';
import type { ChapterState } from './chapterService';
import { prologueScenes, prologueStory, type PrologueProgress } from './prologueStory';
import { libraryChapterStory } from './libraryChapterStory';
import { dormChapterStory } from './dormChapterStory';
import { postChapterStory } from './postChapterStory';

export interface CollectedIllustration { asset: string; title: string; group: string; caption: string }
const titles: Record<string, string> = {
  'chapter-library-arrival': '이야기가 잠든 도서관', 'chapter-library-shelves': '수많은 이야기 앞에서',
  'chapter-dorm-hall': '낯선 홀에서 만난 다정함', 'chapter-dorm-planning': '내일을 위한 작은 약속', 'chapter-dorm-night': '별빛 아래 돌아본 하루',
  'chapter-post-morning': '광장의 아침 인사', 'chapter-post-arrival': '날개에 실려 온 소식', 'chapter-post-letter': '리아에게 건네진 편지', 'chapter-post-complete': '나만의 질문을 품고',
};
/** Existing durable story bookmarks unlock art, without a second progress store. */
export function collectIllustrations(chapters: ChapterState | null | undefined, prologue: PrologueProgress | null | undefined): CollectedIllustration[] {
  const collected = new Map<string, CollectedIllustration>();
  const add = (asset: string, title: string, group: string, caption = title) => collected.set(asset, { asset, title, group, caption });
  if (prologue) {
    for (const [scene, info] of Object.entries(prologueScenes)) {
      // Finishing or skipping unlocks the whole replayable prologue, including legacy bookmarks.
      if (prologue.completed_at || prologueStory.findIndex(beat => beat.scene === scene) <= prologue.scene_index) add(info.image.replace(/\.png$/, ''), info.title.replace(/^\d+ · /, ''), '프롤로그');
    }
  }
  const first = chapters?.chapter?.step ?? -1;
  if (first >= 3) add('chapter-observatory-arrival', '천장 가득 펼쳐진 우주', '제1장', '별빛으로 가득한 연구시설에 놀라는 리아와 루온');
  if (first >= 7) add('ria-telescope-assisted', '함께 별을 관측하는 시간', '제1장', '망원경을 들여다보는 리아의 곁에서 초점을 맞춰 주는 카시안');
  if (first >= 16) add('chapter-first-star-complete', '나의 첫 별', '제1장', '리아의 첫 탐구 설계를 함께 축하하는 루온과 카시안');
  const stories = [
    { story: libraryChapterStory, record: chapters?.library, group: '제2장' },
    { story: dormChapterStory, record: chapters?.dorm, group: '제3장' },
    { story: postChapterStory, record: chapters?.post, group: '제4장' },
    { story: skyChapterStory, record: chapters?.sky, group: '제5장' },
  ];
  for (const { story, record, group } of stories) {
    if (!record) continue;
    story.forEach((beat, index) => {
      if (index <= record.step && beat.art && !collected.has(beat.art)) add(beat.art, titles[beat.art] ?? beat.alt ?? group, group, beat.alt);
    });
    if (group === '제2장' && record.step >= 13) add('ria-reading-assisted', '함께 첫 장을 펼치는 시간', group, '책을 펼치는 리아의 곁에서 기록을 안내하는 엘리안');
  }
  return [...collected.values()];
}
