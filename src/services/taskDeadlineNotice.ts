/**
 * 할 일 마감 알림의 방아쇠 (2026-09-24).
 *
 * ⚠️ 이 프로젝트에는 **pg_cron 이 없다**(실측). 정해진 시각에 도는 것이 없으므로 «화면이
 * 방아쇠»다 — 전자서명 문서 정리(`purge-signature-files`)가 쓰는 것과 같은 방식이다.
 *
 * 규칙 셋:
 *   ① **세션당 한 번**만 부른다(모듈 전역 플래그). 화면을 옮겨 다닐 때마다 부르면
 *      교직원 수만큼 전체 할 일을 훑는 조회가 생긴다.
 *   ② **결과를 기다리지 않고 오류도 삼킨다.** 이 호출이 실패해도 화면은 그대로 떠야 한다
 *      — 알림을 못 보내는 것과 앱이 안 열리는 것은 심각도가 다르다.
 *   ③ **중복 발송은 서버가 막는다**(부분 유니크 인덱스). 그래서 여러 사람이 동시에 열어도,
 *      같은 사람이 새로고침을 반복해도 알림은 한 번이다 — 클라이언트가 기억할 필요가 없다.
 *
 * 누가 받는지·언제 보내는지의 판정은 전부 `notify_task_deadlines()` 안에 있다(단일 출처).
 * 교직원이 아니면 서버가 0 을 돌려준다 — 여기서 역할을 다시 판정하지 않는다.
 */
import { supabase } from '@/integrations/supabase/client';

let triggered = false;

export function triggerTaskDeadlineNotices(): void {
  if (triggered) return;
  triggered = true;

  void supabase
    .rpc('notify_task_deadlines')
    .then(({ error }) => {
      if (error) console.warn('마감 알림 발송 건너뜀', error.message);
    });
}

/** 테스트용 — 세션 플래그를 되돌린다 */
export function resetTaskDeadlineNoticeTrigger(): void {
  triggered = false;
}
