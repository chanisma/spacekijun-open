import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offsetDay, seoulDay, validPlanTimes } from '../plannerModel';
import { canRoleSeePath } from '../../../lib/routeAccess';
import { isNavGroup, regularNavSections, studentNavSections } from '../../../config/navigation';
import { pickMobileBottomItems } from '../../../lib/navMobileLayout';

test('planner dates follow Seoul midnight and repeat across month/year boundaries', () => {
  assert.equal(seoulDay(new Date('2026-09-20T14:59:00Z')), '2026-09-20');
  assert.equal(seoulDay(new Date('2026-09-20T15:00:00Z')), '2026-09-21');
  assert.equal(offsetDay('2026-12-31', 1), '2027-01-01');
  assert.equal(offsetDay('2028-02-28', 1), '2028-02-29');
  assert.equal(offsetDay('2026-03-01', -1), '2026-02-28');
});

test('optional times must be a complete, increasing same-day interval', () => {
  assert.equal(validPlanTimes('', ''), true);
  assert.equal(validPlanTimes('09:00', '10:30'), true);
  for (const [start, end] of [['09:00', ''], ['', '10:00'], ['10:00', '09:00'], ['10:00', '10:00'], ['23:00', '24:00']]) {
    assert.equal(validPlanTimes(start, end), false);
  }
});

test('planner is discoverable in both menus without changing mobile shortcuts', () => {
  for (const original of [studentNavSections, regularNavSections]) {
    const items = original.flatMap(section => section.items.flatMap(item => isNavGroup(item) ? item.children : [item]));
    assert.equal(items.filter(item => item.href === '/planner').length, 1);
    const kind = original === studentNavSections ? 'student' : 'teacher';
    assert.deepEqual(pickMobileBottomItems(items, null, kind).map(item => item.href), kind === 'student'
      ? ['/', '/timetable', '/schedule', '/world-today', '/ipsi']
      : ['/', '/timetable', '/schedule', '/my-tasks', '/ipsi']); // 4번째 칸 = 내 할 일 (2026-09-21 사용자 결정)
  }
  assert.equal(canRoleSeePath('staff', '/planner'), false);
  for (const role of ['student', 'teacher', 'admin'] as const) assert.equal(canRoleSeePath(role, '/planner'), true);
});
