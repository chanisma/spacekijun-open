// 할 일 작업 「메시지 보내기」 회귀 (2026-09-24)
//   npx tsx --tsconfig tsconfig.app.json scripts/task-message-test/run.mts
// 서버(발송·권한·중복 제거)는 2026-09-24 드라이런으로 실측 — docs/features/task-message.md
import { readFileSync } from 'node:fs';
import {
  coolMessengerText, parseMessageConfig, parseMessageDraft, recipientNamesText,
  serializeMessageConfig, validateMessageConfig, MESSAGE_BODY_MAX,
} from '../../src/lib/taskMessage';

let pass = 0;
function ok(cond: boolean, name: string) {
  if (!cond) { console.error('  ✗', name); process.exit(1); }
  console.log('  ✓', name); pass++;
}
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const cfg = parseMessageConfig({ message: { title: ' 안내 ', body: ' 본문 ', audience: { include: [{ type: 'homeroom', grades: [1] }] } } });
ok(cfg.title === ' 안내 ' && cfg.audience.include.length === 1, '설정 읽기');
ok(parseMessageConfig({}).body === '', 'config.message 없으면 빈 초안');
ok(JSON.stringify(serializeMessageConfig(cfg)).includes('"title":"안내"'), '저장할 때 앞뒤 공백 제거');
ok(validateMessageConfig({ ...cfg, body: ' ' }) !== null, '빈 본문 거부');
ok(validateMessageConfig({ ...cfg, body: 'x'.repeat(MESSAGE_BODY_MAX + 1) }) !== null, '본문 길이 상한(서버와 같은 4,000자)');
ok(validateMessageConfig({ ...cfg, audience: { include: [], exclude: [] } }) !== null, '받는 사람 조건 없음 거부');
ok(validateMessageConfig(cfg) === null, '정상');

ok(coolMessengerText({ title: '점검 안내', body: '본문' }) === '[점검 안내]\n본문', '쿨메신저 본문 = 제목을 첫 줄에(쪽지에는 제목 칸이 없다)');
ok(coolMessengerText({ title: '', body: '본문' }) === '본문', '제목이 없으면 본문만');
ok(recipientNamesText(['장재윤', '윤하준', '장재윤', ' ']) === '윤하준, 장재윤', '받는 사람 = 중복 제거·가나다순·쉼표');

ok(JSON.stringify(parseMessageDraft('설명\n{"title":"점검","body":"부탁드립니다"}')) === '{"title":"점검","body":"부탁드립니다"}', 'AI 초안: 앞뒤 잡담이 있어도 JSON 을 꺼낸다');
ok(parseMessageDraft('그냥 글입니다').body === '그냥 글입니다', 'AI 초안: JSON 이 아니면 본문으로 받는다(버리지 않는다)');

const sql = read('supabase/migrations/20260924120000_task_message.sql');
ok(/resolve_audience\(coalesce\(v_cfg->'audience'/.test(sql), '명단은 서버가 푼다(클라이언트 id 목록을 믿지 않는다)');
ok(sql.includes("'task_message'") && sql.includes('array_agg(distinct (r.value->>\'resource_id\')::uuid)'), '알림은 사람당 한 번(여러 조건에 걸려도 중복 없음)');
ok(/revoke insert, update, delete on public\.task_message_send/.test(sql), '발송 기록은 RPC 로만 쓴다');
ok(!/coolmsg_outbox/.test(sql.replace(/--.*$/gm, '')), '쿨메신저 발송 큐를 쓰지 않는다(2026-09-22 방향 전환)');

const registry = read('src/features/task-workflow/actionRegistry.ts');
ok(/'message\.send':\s*\{[\s\S]*?category: 'message'[\s\S]*?multiple: true/.test(registry), 'message.send 등록');
const panel = read('src/features/task-workflow/components/TaskActionPanel.tsx');
// 범주 순서의 단일 출처는 등록부 — 패널에 사본이 없다(2026-10-01 바로잡음)
ok(panel.includes("action.action_type === 'message.send' ? (") && registry.includes("'collect', 'submit', 'message', 'signature', 'document'"), '러너 분기·연결 창 범주');
const nav = read('src/components/notifications/notificationNavigation.ts');
ok(nav.includes("type === 'task_message'") && nav.includes('/my-tasks?task='), '알림 → 그 할 일');
const runner = read('src/features/task-workflow/components/message/MessageSendRunner.tsx');
ok(runner.includes('쿨메신저로도 보내기') && runner.includes('recipientNamesText') && runner.includes('coolMessengerText'), '쿨메신저 안내·복사');
ok(runner.includes('reasoningEffort') === false && read('src/features/task-workflow/services/taskMessageService.ts').includes("reasoningEffortFor('generation')"), 'AI 초안 = 공용 aiChat + 과제 성격 선언');

console.log(`\n${pass}건 통과`);
