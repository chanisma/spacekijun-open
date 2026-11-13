/**
 * 연수 참석자 명단 파싱 — `meeting.meta.assignee`의 단일 해석기.
 *
 * 이 필드는 형태가 두 갈래다:
 *   - 객체(현행): `{ "홍길동": { name: "홍길동", signature: 0 } }`
 *   - 문자열(레거시): `"홍길동, 김철수"`
 * 라이브 연수 4건은 모두 객체형이지만, 문자열형을 만드는 경로가 코드에 남아 있어
 * 읽는 쪽은 둘 다 받아야 한다. 화면마다 따로 분기하면 한 곳만 고쳐지므로 여기로 모은다.
 *
 * React 비의존 순수 모듈.
 */

export interface TrainingAssignee {
  name: string;
  /** 1 = 서명 완료. 실제 서명 데이터는 `training_signature` 표에 있고 이건 파생 플래그다. */
  signature: number;
}

/** 참석자 목록(이름 + 서명 플래그). 순서는 원본 순서를 따른다. */
export function parseTrainingAssignees(assignee: unknown): TrainingAssignee[] {
  if (!assignee) return [];

  if (typeof assignee === 'string') {
    return assignee
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name, signature: 0 }));
  }

  if (Array.isArray(assignee)) {
    return assignee
      .map((entry) => {
        if (typeof entry === 'string') return { name: entry.trim(), signature: 0 };
        if (entry && typeof entry === 'object') {
          const row = entry as { name?: unknown; signature?: unknown };
          if (typeof row.name === 'string' && row.name.trim()) {
            return { name: row.name.trim(), signature: toFlag(row.signature) };
          }
        }
        return null;
      })
      .filter((v): v is TrainingAssignee => v !== null);
  }

  if (typeof assignee === 'object') {
    return Object.entries(assignee as Record<string, unknown>)
      .map(([key, value]) => {
        // 키가 이름이지만, 값 안의 name이 더 정확할 수 있어 있으면 그쪽을 쓴다.
        const row = (value && typeof value === 'object' ? value : {}) as {
          name?: unknown;
          signature?: unknown;
        };
        const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : key.trim();
        return name ? { name, signature: toFlag(row.signature) } : null;
      })
      .filter((v): v is TrainingAssignee => v !== null);
  }

  return [];
}

/** 참석자 이름만. 중복은 제거한다. */
export function trainingAssigneeNames(assignee: unknown): string[] {
  return Array.from(new Set(parseTrainingAssignees(assignee).map((a) => a.name)));
}

/** 가나다순 정렬(인쇄 명단 기준) */
export function sortAssigneesByName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function toFlag(value: unknown): number {
  return value === 1 || value === true || value === '1' ? 1 : 0;
}
