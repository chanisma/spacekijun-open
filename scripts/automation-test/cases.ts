// cron 판정 표 — run.mts(화면 TS)와 sql-parity.mts(서버 automation_private.cron_matches)가 같은 표를 잰다.
// at = 한국 벽시계. 2026-10-23 = 금, 10-24 = 토, 10-25 = 일, 10-26 = 월.
export const CRON_CASES: Array<{ expr: string; at: string; match: boolean }> = [
  { expr: '30 8 * * 1-5', at: '2026-10-23 08:30', match: true },
  { expr: '30 8 * * 1-5', at: '2026-10-24 08:30', match: false },
  { expr: '30 8 * * 1-5', at: '2026-10-23 08:31', match: false },
  { expr: '0 9 * * 0', at: '2026-10-25 09:00', match: true },
  { expr: '0 9 * * 7', at: '2026-10-25 09:00', match: true },
  { expr: '0 9 * * 5-7', at: '2026-10-25 09:00', match: true },
  { expr: '0 9 * * 5-7', at: '2026-10-26 09:00', match: false },
  { expr: '*/15 * * * *', at: '2026-10-23 10:45', match: true },
  { expr: '*/15 * * * *', at: '2026-10-23 10:46', match: false },
  { expr: '5/15 * * * *', at: '2026-10-23 10:50', match: true },
  { expr: '5/15 * * * *', at: '2026-10-23 10:00', match: false },
  { expr: '0 9-17/4 * * *', at: '2026-10-23 13:00', match: true },
  { expr: '0 9-17/4 * * *', at: '2026-10-23 15:00', match: false },
  { expr: '0 8,12,18 * * *', at: '2026-10-23 12:00', match: true },
  // 일·요일이 둘 다 제한되면 OR
  { expr: '0 9 1 * 1', at: '2026-10-26 09:00', match: true },
  { expr: '0 9 1 * 1', at: '2026-11-01 09:00', match: true },
  { expr: '0 9 1 * 1', at: '2026-10-27 09:00', match: false },
  // 일만 제한되면 AND(요일 *)
  { expr: '0 9 23 10 *', at: '2026-10-23 09:00', match: true },
  { expr: '0 9 23 11 *', at: '2026-10-23 09:00', match: false },
  { expr: '0 0 31 * *', at: '2026-10-31 00:00', match: true },
  { expr: '0 0 * * *', at: '2026-10-23 00:00', match: true },
  { expr: '59 23 * * *', at: '2026-10-23 23:59', match: true },
  { expr: '61 * * * *', at: '2026-10-23 10:00', match: false },
];
