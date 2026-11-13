/**
 * 수업 교체·대체 부담 점수 회귀 테스트
 *
 * 실행: npx tsx scripts/swap-burden-test/run.mts
 *
 * 검증 목적
 *  1) 부담 요인(연강·일일 초과·빈 날 소멸·마지막 교시)이 각각 delta 를 올리는가
 *  2) 교체(remove 있음)가 대체(remove 없음)보다 가볍게 평가되는가 — 실제로 총량이 같으므로
 *  3) 정렬(compareBurden)이 "부담 적은 순 → 덜 바쁜 순 → 이른 시간 순"으로 안정적인가
 *  4) 기준값이 시간표 자동생성기 제약과 같은가 (기준이 갈라지면 추천 순서가 정책과 어긋난다)
 */
import {
  BURDEN_LEVEL_LABEL,
  TEACHER_LOAD_LIMITS,
  compareBurden,
  evaluateSwapBurden,
  type BurdenSlot,
} from '../../src/lib/swapBurden';

let passed = 0;
const failures: string[] = [];

const check = (name: string, condition: boolean, detail = '') => {
  if (condition) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

/** "11,12,23" 같은 축약 표기를 슬롯 배열로 (앞자리=요일, 뒷자리=교시) */
const slots = (codes: string): BurdenSlot[] =>
  codes
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => ({ weekday: Number(code[0]), period: Number(code.slice(1)) }));

// ────────────────────────────────────────────── 1) 요인별 반응
{
  // 월 1·2교시가 있는 교사가 월 3교시를 더 맡으면 3연강이 된다
  const r = evaluateSwapBurden({ teacherSlots: slots('11,12,25'), add: { weekday: 1, period: 3 } });
  check('3연강이 생기면 delta > 0', r.delta > 0, `delta=${r.delta}`);
  check(
    '3연강 사유 문구 노출',
    r.reasons.some((x) => x.includes('연속')),
    r.reasons.join(' / ')
  );
  check('3연강이면 level=high', r.level === 'high', r.level);
}

{
  // 월요일에 이미 4개(한계) → 하루 5개가 된다. 연강이 되지 않도록 띄엄띄엄 배치
  const r = evaluateSwapBurden({ teacherSlots: slots('11,13,15,17'), add: { weekday: 1, period: 4 } });
  check('하루 한계 초과 시 delta > 0', r.delta > 0, `delta=${r.delta}`);
  check(
    '하루 수업 수 사유 문구에 실제 개수 표기',
    r.reasons.some((x) => x.includes('5개')),
    r.reasons.join(' / ')
  );
}

{
  // 수요일에 수업이 하나도 없던 교사가 수요일을 맡는다
  const r = evaluateSwapBurden({ teacherSlots: slots('11,22,44'), add: { weekday: 3, period: 2 } });
  check('빈 날이 사라지면 delta > 0', r.delta > 0, `delta=${r.delta}`);
  check(
    '빈 날 소멸 사유 문구 노출',
    r.reasons.some((x) => x.includes('없던 날')),
    r.reasons.join(' / ')
  );
}

{
  // 마지막 교시(7)가 이미 주 3회 → 4회가 된다
  const r = evaluateSwapBurden({ teacherSlots: slots('17,27,37,41'), add: { weekday: 4, period: 7 } });
  check('마지막 교시 주간 한계 초과 시 delta > 0', r.delta > 0, `delta=${r.delta}`);
  check(
    '마지막 교시 사유 문구 노출',
    r.reasons.some((x) => x.includes('마지막 교시')),
    r.reasons.join(' / ')
  );
}

{
  // 아무 한계에도 닿지 않는 평범한 추가
  const r = evaluateSwapBurden({ teacherSlots: slots('11,22,33,44,52'), add: { weekday: 1, period: 5 } });
  check('한계에 닿지 않으면 사유 없음', r.reasons.length === 0, r.reasons.join(' / '));
  check('한계에 닿지 않으면 level=low', r.level === 'low', `${r.level} delta=${r.delta}`);
}

// ────────────────────────────────────────────── 2) 교체 vs 대체
{
  const teacherSlots = slots('11,12,25,33');
  const add = { weekday: 4, period: 2 };
  const substitute = evaluateSwapBurden({ teacherSlots, add });
  const swap = evaluateSwapBurden({ teacherSlots, add, remove: { weekday: 2, period: 5 } });

  check('대체는 주간 수업이 하나 늘어난다', substitute.totalAfter === teacherSlots.length + 1);
  check('교체는 주간 수업 총량이 그대로다', swap.totalAfter === teacherSlots.length);
  check(
    '같은 시간을 맡아도 교체가 대체보다 가볍거나 같다',
    swap.delta <= substitute.delta,
    `swap=${swap.delta} substitute=${substitute.delta}`
  );
}

{
  // 3연강을 풀어주는 교체는 부담이 오히려 줄어든다
  const r = evaluateSwapBurden({
    teacherSlots: slots('11,12,13,25'),
    add: { weekday: 4, period: 2 },
    remove: { weekday: 1, period: 2 },
  });
  check('연강을 해소하는 교체는 delta < 0', r.delta < 0, `delta=${r.delta}`);
  check('delta<=0 이면 level=low', r.level === 'low', r.level);
  // 총점이 내려가도 개별 악화 요인은 그대로 보고한다 — 상대가 반대할 근거를 숨기지 않는다.
  check(
    '총점이 내려가도 악화된 개별 요인은 보고한다',
    r.reasons.some((x) => x.includes('없던 날')),
    r.reasons.join(' / ')
  );
}

{
  // 실제로 가진 슬롯을 빼고 같은 자리에 다시 넣으면 시간표가 그대로다
  const teacherSlots = slots('11,12,13,21,22,23');
  const r = evaluateSwapBurden({
    teacherSlots,
    add: { weekday: 1, period: 1 },
    remove: { weekday: 1, period: 1 },
  });
  check('시간표가 그대로면 delta = 0', r.delta === 0, `delta=${r.delta}`);
  check('시간표가 그대로면 사유 없음', r.reasons.length === 0, r.reasons.join(' / '));
}

// ────────────────────────────────────────────── 3) 정렬
{
  const light = evaluateSwapBurden({ teacherSlots: slots('11,33'), add: { weekday: 1, period: 5 } });
  const heavy = evaluateSwapBurden({ teacherSlots: slots('11,12'), add: { weekday: 1, period: 3 } });
  check('부담이 적은 쪽이 앞선다', compareBurden({ burden: light }, { burden: heavy }) < 0);

  // delta 가 같으면 덜 바쁜 교사가 앞선다
  const busy = evaluateSwapBurden({
    teacherSlots: slots('11,22,33,44,55,21,32'),
    add: { weekday: 1, period: 5 },
  });
  const idle = evaluateSwapBurden({ teacherSlots: slots('11,22'), add: { weekday: 1, period: 5 } });
  check('delta 동점이면 덜 바쁜 교사가 앞선다', compareBurden({ burden: idle }, { burden: busy }) < 0,
    `idle=${idle.delta}/${idle.totalAfter} busy=${busy.delta}/${busy.totalAfter}`);

  // delta·총량이 같으면 이른 요일·교시 순
  const a = evaluateSwapBurden({ teacherSlots: slots('11,22'), add: { weekday: 1, period: 5 } });
  const b = evaluateSwapBurden({ teacherSlots: slots('11,22'), add: { weekday: 1, period: 5 } });
  check(
    'delta·총량 동점이면 이른 시간이 앞선다',
    compareBurden({ burden: a, weekday: 2, period: 1 }, { burden: b, weekday: 3, period: 1 }) < 0
  );
  check(
    '같은 요일이면 이른 교시가 앞선다',
    compareBurden({ burden: a, weekday: 2, period: 1 }, { burden: b, weekday: 2, period: 4 }) < 0
  );

  // 정렬이 실제로 오름차순을 만드는지
  const sorted = [{ burden: heavy }, { burden: light }].sort(compareBurden);
  check('sort 결과가 부담 오름차순', sorted[0].burden.delta <= sorted[1].burden.delta);
}

// ────────────────────────────────────────────── 4) 기준값 정합
check('하루 한계 = 자동생성기와 동일(4)', TEACHER_LOAD_LIMITS.maxPerDay === 4);
check('연속 한계 = 자동생성기와 동일(2)', TEACHER_LOAD_LIMITS.maxConsecutive === 2);
check('마지막 교시 주간 한계 = 자동생성기와 동일(3)', TEACHER_LOAD_LIMITS.maxLastPeriodPerWeek === 3);
check('마지막 교시 = 7교시', TEACHER_LOAD_LIMITS.lastPeriod === 7);
check('레벨 라벨 3종', Object.keys(BURDEN_LEVEL_LABEL).length === 3);

// ────────────────────────────────────────────── 결과
console.log(`\n통과 ${passed}건 / 실패 ${failures.length}건`);
if (failures.length > 0) {
  console.error('\n실패 목록:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log('모든 검사를 통과했습니다.');
