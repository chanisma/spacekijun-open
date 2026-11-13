/**
 * 노드 **크기**로 중요도를 말한다 — Activity · Thread · Interest 만 (2026-09-12 사용자 지시).
 *
 * 문제: "중요한 노드가 무엇인지 한눈에 보이지 않는다". 그런데 **단순 차수로는 안 된다** —
 * 라이브 실측(v8 최신 316명 · 활동 822개)에서 이웃 타입의 절반이 **개수가 아니라 있음/없음**이다
 * (링크 수 = 보유 활동 수: Competency 721/721 · Achievement 167/167 · Interest 104/104 ·
 *  Attitude 70/70 · Role 14/14). 게다가 Competency 는 **87.7% 가 정확히 1개**라 차수의 8할이 상수가 된다.
 *
 * 그래서 **어떤 노드와 이어졌는지로 가중**한다. 같은 실측에서 가중합의 변동계수가 **0.835** 로
 * 단순 차수 **0.416** 의 두 배다(둘의 상관은 0.905 — 차수를 버린 게 아니라 날카롭게 벼린 것이다).
 *
 * ## 채택하지 않은 것 (측정으로 기각)
 * - **개념 다리 가산점**(여러 활동이 공유하는 개념) — 학생 안 개념 fanout 평균 **1.01**·최대 2.
 *   적용 대상이 사실상 없다.
 * - **PageRank·betweenness 류** — ①학생 허브가 전 노드에 붙어 구조를 평탄화하고 ②1학년 그래프는
 *   노드 8개라 고유벡터가 잡음이며 ③**왜 큰지 설명할 수 없다**. 1-hop 가중합은 "다른 활동 2개와
 *   이어져 있어서 크다"고 말할 수 있다.
 * - **심화 수준(`level`)·분절 점수(`usefulness`) 혼합** — 822개 전수에서 연결 점수와의 상관이
 *   `usefulness` **−0.08** · `level` **0.00** 으로 **완전히 독립**이다. 섞으면 크기 하나가 두 가지를
 *   뜻해 "왜 큰가"에 답할 수 없다. 깊이를 보이려면 다른 채널(테두리 등)로 따로 말할 것.
 */

/** 크기를 조절할 타입. 잎(역량·성취·태도…)은 건드리지 않는다 — 애초에 변별할 것이 없다. */
export const SIZED_TYPES = new Set(['Activity', 'Thread', 'Interest']);

/**
 * 이웃 타입별 가산점. 대부분이 "개수의 배수"가 아니라 **그 플래그가 켜졌을 때의 가산점**이다.
 * 괄호 안은 822개 활동 중 그 이웃을 가진 비율.
 */
export const NEIGHBOR_WEIGHT: Record<string, number> = {
  // 전 노드에 정확히 1개씩 붙는다 — 상수항은 변별에 기여하지 않고 정규화만 흐린다.
  Student: 0,
  Activity: 3.0,    // 52.4%, 0~3 으로 변한다. v8 이 만들어 낸 유일한 종단 신호이자 최대 변별원
  Thread: 2.0,      // 30.3%. 흐름 소속 = 활동 3개 이상을 관통하는 서사의 일원(v8 규칙)
  Interest: 1.5,    // 12.7%
  Concept: 1.0,     // 39.7%, 0~2
  Achievement: 1.0, // 20.3%. 드물지만 "결과물이 남았다"는 강한 신호
  Book: 0.8,        // 22.3%
  Person: 0.5,      // 5.4%
  // 전부 플래그. Competency 는 87.7% 라 사실상 상수인데 **0으로 두지는 않는다** —
  // 역량이 하나도 붙지 않은 활동 101개를 구분할 수 있어야 한다.
  Competency: 0.25,
  Attitude: 0.25,
  Role: 0.25,
};

/**
 * 그 타입 노드가 이보다 적으면 크기를 건드리지 않는다.
 * 3이면 작음·중간·큼 세 자리가 생겨 순위가 뜻을 갖는다(2개는 "둘 중 하나"라 셀 필요가 없다).
 */
export const MIN_NODES_FOR_SIZING = 3;
/** 지름 배수 = √(AREA_MIN + AREA_SPAN × t) → 0.787 ~ 1.360 */
export const AREA_MIN = 0.62;
export const AREA_SPAN = 1.23;

/**
 * **영향력 기반 최소 크기**의 기준점 (2026-09-12 사용자 지시).
 *
 * 순위만 쓰면 그래프마다 자가 다시 눈금을 매긴다 — 강한 활동이 여럿인 학생에게는
 * 그중 아래쪽이 작게 그려지고, 반대로 전부 약한 학생의 1등이 크게 그려진다.
 * 그래서 순위 위에 **바닥**을 깐다: 객관적으로 영향력이 큰 노드는 어떤 무리에 있든
 * 작게 그려지지 않는다.
 *
 * `low`·`high` 는 **라이브 코퍼스 전수 실측**(2026-09-12, v8 최신 버전):
 *
 * | 타입 | n | 중앙 | p90 | 최대 |
 * |---|---|---|---|---|
 * | Activity | 7,095 | 6.0 | 11.8 | 27.8 |
 * | Thread   |   970 | 32.1 | 59.5 | 173.8 |
 * | Interest |   724 | 30.8 | 62.4 | 202.5 |
 *
 * `low` = 중앙값("보통"), `high` = p90("확실히 크다"). 타입마다 점수 scale 이 다르므로
 * (Thread·Interest 는 소속 활동 점수의 **합**이다) 한 기준으로 묶을 수 없다.
 *
 * ⚠️ **추출 파이프라인이나 `NEIGHBOR_WEIGHT` 를 바꾸면 이 값을 다시 재야 한다.**
 * 여기만 옛 분포에 맞춰져 있으면 바닥이 조용히 어긋난다.
 */
export const INFLUENCE_REFERENCE: Record<string, { low: number; high: number }> = {
  Activity: { low: 6, high: 12 },
  Thread: { low: 32, high: 60 },
  Interest: { low: 31, high: 62 },
};

/**
 * 바닥이 올릴 수 있는 **상한**. 위쪽 구간(t 0.6~1.0)은 순위에게 남긴다.
 *
 * 이 값이 없으면 바닥이 최대까지 밀어 **강한 노드가 전부 같은 크기로 포화**된다
 * (검증: 점수 12·13·20 인 세 활동이 모두 68px 로 붙어 서열이 사라졌다).
 * 바닥이 답할 질문은 "작게 보이면 안 된다"이지 "1등이다"가 아니다 — 1등은 순위가 정한다.
 */
export const FLOOR_MAX_T = 0.6;

/**
 * 영향력만으로 정하는 **최소** 지름 배수. 절대 1.0 아래로 내려가지 않는다 —
 * 이건 "이 정도면 크게 보여야 한다"는 바닥이지 크기를 깎는 자가 아니다.
 */
function influenceFloor(type: string, value: number): number {
  const ref = INFLUENCE_REFERENCE[type];
  if (!ref || ref.high <= ref.low) return 1;
  const raw = (value - ref.low) / (ref.high - ref.low);
  const t = Math.min(FLOOR_MAX_T, Math.max(0, raw));
  return Math.max(1, Math.sqrt(AREA_MIN + AREA_SPAN * t));
}

export interface ImportanceNode { id: string; type: string }
export interface ImportanceEdge { source: string; target: string }

/**
 * 노드 id → **지름 배수**. 크기를 조절하지 않는 노드는 아예 담지 않는다(호출부가 1.0 으로 본다).
 *
 * 크기 = **max(그래프 안 순위, 영향력 바닥)**. 순위가 "상대적으로 다른 것들보다
 * 영향력이 크면 크게"를 맡고, 바닥이 "객관적으로 큰 노드는 어떤 무리에 있든 작지 않다"를
 * 맡는다. 순위 정규화는 **그래프 안에서, 타입별로** 한다:
 *   · 그래프 안 — 1학년 활동 4개와 3학년 52개를 같은 자로 재면 1학년이 통째로 작아진다.
 *     한 번에 한 학생을 보므로 이게 맞다. **대가: 학생 간·버전 간 크기 비교는 성립하지 않는다.**
 *   · 타입별 — Thread(기본 54)를 Activity(50)와 같은 척도에 놓지 않는다.
 */
export function computeImportanceScale(
  nodes: ImportanceNode[],
  edges: ImportanceEdge[],
): Map<string, number> {
  const scale = new Map<string, number>();
  const typeById = new Map<string, string>();
  for (const n of nodes) typeById.set(n.id, n.type);

  const neighbors = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = neighbors.get(a);
    if (list) list.push(b);
    else neighbors.set(a, [b]);
  };
  for (const e of edges) {
    if (!typeById.has(e.source) || !typeById.has(e.target)) continue;
    link(e.source, e.target);
    link(e.target, e.source);
  }

  // ── 1패스: 활동 점수 = 이웃 가중합 ──────────────────────────────────────
  const activityScore = new Map<string, number>();
  for (const n of nodes) {
    if (n.type !== 'Activity') continue;
    let s = 0;
    for (const other of neighbors.get(n.id) ?? []) {
      s += NEIGHBOR_WEIGHT[typeById.get(other) ?? ''] ?? 0;
    }
    activityScore.set(n.id, s);
  }

  // ── 2패스: Thread·Interest = 소속 **활동 점수의 합** ──────────────────────
  // 개수가 아니라 합인 이유: 중요한 활동 4개를 묶은 흐름과 사소한 활동 4개를 묶은 흐름은 다르다.
  // 순환이 아니다 — 활동 점수가 먼저 확정되고 그 값을 읽기만 하는 고정 2패스다.
  const score = new Map<string, number>(activityScore);
  for (const n of nodes) {
    if (n.type !== 'Thread' && n.type !== 'Interest') continue;
    let s = 0;
    for (const other of neighbors.get(n.id) ?? []) s += activityScore.get(other) ?? 0;
    score.set(n.id, s);
  }

  // ── 점수 → 지름 배수 = **max(순위, 영향력 바닥)** ───────────────────────
  //
  // 순위는 "이 그래프 안에서 몇 번째인가", 바닥은 "객관적으로 얼마나 큰가"를 말한다.
  // 둘 중 큰 값을 쓰므로 ①무리 안의 서열이 보이고 ②강한 노드가 강한 무리에 섞여도
  // 작아지지 않는다. 바닥은 1.0 미만이 될 수 없어 **크기를 깎지는 않는다**.
  for (const type of SIZED_TYPES) {
    const members = nodes.filter((n) => n.type === type);
    if (members.length === 0) continue;

    // 바닥은 **노드 수와 무관**하게 적용한다 — 흐름이 하나뿐이어도 활동 6개를 묶었다면
    // 크게 보여야 한다(종전엔 3개 미만이면 통째로 기본 크기였다).
    for (const n of members) {
      const floor = influenceFloor(type, score.get(n.id) ?? 0);
      if (floor > 1) scale.set(n.id, floor);
    }

    // 순위는 셋 이상일 때만 뜻이 있다(2개는 "둘 중 하나"라 셀 필요가 없다).
    if (members.length < MIN_NODES_FOR_SIZING) continue;

    // ── **순위(상대) 기반 매핑** (2026-09-12 사용자 지시) ────────────────
    // 종전엔 `(점수 − p10) / (p90 − p10)` 이라 **점수 값**이 자를 정했다. 그러면
    // 한 노드가 유난히 크면 나머지가 바닥에 몰려 전부 같은 크기로 보이고, 반대로
    // 점수 차가 작으면 있으나 마나 한 차이가 된다 — 화면이 "절대값"처럼 읽히는 이유다.
    // 지금은 **그래프 안에서 몇 번째인가**만 쓴다: 영향력이 상대적으로 크면 크게 보인다.
    const sorted = members
      .map((n) => ({ id: n.id, value: score.get(n.id) ?? 0 }))
      .sort((a, b) => a.value - b.value);

    // 전부 같으면 순위가 뜻을 잃는다(라이브 38개 그래프가 여기 해당).
    // 순위만 건너뛴다 — 위에서 깐 영향력 바닥은 그대로 남는다(전부 강한 무리라면
    // 서열이 없어도 전부 크게 보이는 것이 맞다).
    if (sorted[0].value === sorted[sorted.length - 1].value) continue;

    // **동점은 같은 크기**여야 한다. 평균 순위를 쓰지 않으면 정렬이 우연히 정한
    // 앞뒤 때문에 값이 같은 두 노드가 다른 크기로 그려진다.
    const denominator = sorted.length - 1;
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) j += 1;
      const t = ((i + j) / 2) / denominator;
      // **면적 비례**. 사람은 원의 넓이로 양을 읽으므로 지름은 √로 간다 —
      // 순위를 지름에 선형으로 매핑하면 한 칸 차이가 넓이로는 두 배 가까이 보인다.
      const k = Math.sqrt(AREA_MIN + AREA_SPAN * t);
      // 바닥이 이미 더 크면 그것을 남긴다.
      for (let x = i; x <= j; x += 1) {
        scale.set(sorted[x].id, Math.max(k, scale.get(sorted[x].id) ?? 0));
      }
      i = j + 1;
    }
  }

  return scale;
}
