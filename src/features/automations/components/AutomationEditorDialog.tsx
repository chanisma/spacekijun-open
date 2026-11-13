// ========================================
// 자동화 만들기·고치기 (2026-10-23)
// 반복 → 기간·학사력 → 받는 사람 → 쪽지. 저장하면 승인 단계(AutomationApproveDialog)로 넘어간다.
// 이미 승인된 자동화를 고치면 서버 트리거가 승인을 풀고 끈다 — 화면이 저장 전에 그 사실을 말한다.
// ========================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Loader2, MessageSquareText, Users, Variable } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { AudienceRuleBuilder } from '@/components/audience/AudienceRuleBuilder';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, SectionLabel, TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { useFacultyAudienceResolution } from '@/hooks/useStudentAudience';
import type { AudienceRule } from '@/lib/audienceRule';
import {
  BODY_MODE_LABEL, COOLMSG_SENDER_NAME, audienceToFacultyRule, facultyRuleToAudience, isPerRecipient,
  tokensForMode, validateCoolmsgConfig, type BodyMode, type CoolmsgConfig,
} from '@/lib/automationConfig';
import {
  ISO_DOW_LABEL, SCHEDULE_KIND_LABEL, cronValid, formatRunAt, kstDateKeyOf, nextRuns, onceRange, specToCron,
  type ScheduleKind, type ScheduleSpec,
} from '@/lib/automationCron';
import type { FacultyAudienceRule } from '@/lib/facultyAudienceRule';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { createAutomation, updateAutomation, type Automation, type AutomationDraft } from '../automationService';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 고칠 자동화 — 없으면 새로 만든다 */
  automation: Automation | null;
  onSaved: (saved: Automation) => void;
}

/** 키 순서와 무관한 문자열 — jsonb 는 키 순서를 바꿔 돌려준다 */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const DEFAULT_SPEC: ScheduleSpec ={ kind: 'weekdays', time: '08:00', days: [1], dayOfMonth: 1 };

export function AutomationEditorDialog({ open, onOpenChange, automation, onSaved }: Props) {
  const [name, setName] = useState('');
  const [spec, setSpec] = useState<ScheduleSpec>(DEFAULT_SPEC);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [skipClosed, setSkipClosed] = useState(true);
  const [grace, setGrace] = useState(30);
  const [audience, setAudience] = useState<AudienceRule>({ include: [], exclude: [] });
  const [people, setPeople] = useState<string[]>([]);
  const [msgTitle, setMsgTitle] = useState('');
  const [body, setBody] = useState('');
  const [bodyMode, setBodyMode] = useState<BodyMode>('date');
  const [ruleUnreadable, setRuleUnreadable] = useState(false);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const a = automation;
    setName(a?.title ?? '');
    setSpec(a?.schedule_spec ?? (a ? { kind: 'custom', time: '08:00', cron: a.schedule_cron } : DEFAULT_SPEC));
    setStartsOn(a?.starts_on ?? '');
    setEndsOn(a?.ends_on ?? '');
    setSkipClosed(a?.skip_closed_days ?? true);
    setGrace(a?.grace_minutes ?? 30);
    const parsed = facultyRuleToAudience(a?.config.recipients.rule ?? null);
    setRuleUnreadable(parsed === null);
    setAudience(parsed ?? { include: [], exclude: [] });
    setPeople(a?.config.recipients.people ?? []);
    setMsgTitle(a?.config.title ?? '');
    setBody(a?.config.body ?? '');
    setBodyMode(a?.config.body_mode ?? 'date');
  }, [open, automation]);

  const cron = specToCron(spec);
  const once = onceRange(spec);
  const effectiveStarts = once?.startsOn ?? (startsOn || null);
  const effectiveEnds = once?.endsOn ?? (endsOn || null);
  const upcoming = useMemo(
    () => (cron ? nextRuns(cron, Date.now(), 5, { startsOn: effectiveStarts, endsOn: effectiveEnds }) : []),
    [cron, effectiveStarts, effectiveEnds],
  );

  const storedRule = audienceToFacultyRule(audience);
  const resolution = useFacultyAudienceResolution(
    (storedRule ?? { include: [], exclude: [] }) as FacultyAudienceRule,
    open && storedRule !== null,
  );
  const ruleCount = resolution.data?.rows.length ?? null;

  const config: CoolmsgConfig = {
    title: msgTitle,
    body,
    body_mode: bodyMode,
    recipients: { rule: ruleUnreadable ? automation?.config.recipients.rule ?? null : storedRule, people },
  };
  const configError = validateCoolmsgConfig(config);
  const rangeError = !once && startsOn && endsOn && endsOn < startsOn ? '끝나는 날이 시작하는 날보다 앞입니다.' : null;
  const error = !name.trim()
    ? '자동화 이름을 적어 주세요.'
    : !cron ? '반복 규칙을 끝까지 정해 주세요.'
    : rangeError ?? configError;
  // 서버 트리거(automation_private.guard)가 승인을 푸는 칸과 같은 것 — 이름만 바꾸면 승인이 남는다
  const watched = (v: { cron: string | null; starts: string | null; ends: string | null; skip: boolean; grace: number; config: CoolmsgConfig }) =>
    stableJson([v.cron, v.starts, v.ends, v.skip, v.grace, v.config.title.trim(), v.config.body.trim(), v.config.body_mode,
      v.config.recipients.rule, [...v.config.recipients.people].sort()]);
  const releasesApproval = Boolean(automation?.approved_at) && automation !== null
    && watched({ cron, starts: effectiveStarts, ends: effectiveEnds, skip: skipClosed, grace, config })
      !== watched({ cron: automation.schedule_cron, starts: automation.starts_on, ends: automation.ends_on,
        skip: automation.skip_closed_days, grace: automation.grace_minutes, config: automation.config });

  const insertToken = (token: string) => {
    const el = bodyRef.current;
    const text = `{${token}}`;
    if (!el) {
      setBody((b) => b + text);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  };

  async function save() {
    if (error || !cron) return;
    setSaving(true);
    try {
      const draft: AutomationDraft = {
        title: name.trim(),
        schedule_cron: cron,
        schedule_spec: spec,
        skip_closed_days: skipClosed,
        starts_on: effectiveStarts,
        ends_on: effectiveEnds,
        grace_minutes: grace,
        config: { ...config, title: msgTitle.trim(), body: body.trim() },
      };
      const saved = automation ? await updateAutomation(automation.id, draft) : await createAutomation(draft);
      onSaved(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  const setKind = (kind: ScheduleKind) =>
    setSpec((s) => ({
      ...s,
      kind,
      ...(kind === 'custom' && !s.cron ? { cron: specToCron(s) ?? '0 8 * * 1-5' } : {}),
      ...(kind === 'once' && !s.date ? { date: kstDateKeyOf(Date.now() + 86_400_000) } : {}),
    }));

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-start gap-3">
            <TitleIconChip icon={CalendarClock} />
            <div className="min-w-0">
              <DialogTitle className="text-base">{automation ? '자동화 고치기' : '새 자동화'}</DialogTitle>
              <DialogDescription className="text-xs">
                정해 둔 때에 학교 서버가 쿨메신저 «{COOLMSG_SENDER_NAME}» 계정으로 쪽지를 보냅니다. 저장한 뒤 미리보기를 보고 승인해야 시작합니다.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-1.5">
            <Label htmlFor="automation-name">자동화 이름</Label>
            <Input id="automation-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)}
              placeholder="예: 아침 급식지도 당번 안내" />
          </div>

          {/* ① 반복 */}
          <section className="space-y-3">
            <SectionLabel icon={CalendarClock}>언제</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(SCHEDULE_KIND_LABEL) as ScheduleKind[]).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={cn('h-8 rounded-lg border px-3 text-xs',
                    spec.kind === k ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}>
                  {SCHEDULE_KIND_LABEL[k]}
                </button>
              ))}
            </div>
            {spec.kind === 'custom' ? (
              <div className="space-y-1">
                <Input value={spec.cron ?? ''} onChange={(e) => setSpec((s) => ({ ...s, cron: e.target.value }))}
                  className="font-mono" placeholder="분 시 일 월 요일 — 예: 30 8 * * 1-5" />
                <p className="text-xs text-slate-500">
                  한국 시간 기준 · 요일 0·7=일, 1=월 · <code>*/15</code>=15분마다 · <code>1-5</code>=월~금 · 일과 요일을 둘 다 정하면 둘 중 하나만 맞아도 보냅니다.
                </p>
                {spec.cron && !cronValid(spec.cron) && <p className="text-xs text-rose-600">cron 식이 올바르지 않습니다.</p>}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                {spec.kind === 'weekly' && (
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const on = (spec.days ?? []).includes(d);
                      return (
                        <button key={d} type="button" aria-pressed={on}
                          onClick={() => setSpec((s) => ({ ...s, days: on ? (s.days ?? []).filter((x) => x !== d) : [...(s.days ?? []), d] }))}
                          className={cn('h-8 w-8 rounded-full border text-xs',
                            on ? 'border-blue-600 bg-blue-50 font-semibold text-blue-700' : 'border-slate-200 text-slate-600')}>
                          {ISO_DOW_LABEL[d]}
                        </button>
                      );
                    })}
                  </div>
                )}
                {spec.kind === 'monthly' && (
                  <label className="flex items-center gap-1.5 text-sm">
                    매월
                    <Input type="number" min={1} max={31} className="h-8 w-16" value={spec.dayOfMonth ?? 1}
                      onChange={(e) => setSpec((s) => ({ ...s, dayOfMonth: Number(e.target.value) }))} />
                    일
                  </label>
                )}
                {spec.kind === 'once' && (
                  <Input type="date" className="h-8 w-40" value={spec.date ?? ''}
                    onChange={(e) => setSpec((s) => ({ ...s, date: e.target.value }))} />
                )}
                <Input type="time" className="h-8 w-28" value={spec.time}
                  onChange={(e) => setSpec((s) => ({ ...s, time: e.target.value }))} />
              </div>
            )}
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {upcoming.length > 0 ? (
                <>다음 실행: {upcoming.map(formatRunAt).join(' · ')}{skipClosed && <span className="text-slate-400"> (쉬는 날이면 건너뜀)</span>}</>
              ) : cron ? '정한 기간 안에 실행할 때가 없습니다.' : '반복 규칙을 정하면 다음 실행 시각이 보입니다.'}
            </div>
          </section>

          {/* ② 기간·학사력 */}
          <section className="space-y-3">
            <SectionLabel icon={CalendarClock}>기간 · 학사력</SectionLabel>
            {spec.kind !== 'once' && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Input type="date" className="h-8 w-40" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} aria-label="시작하는 날" />
                <span className="text-slate-400">~</span>
                <Input type="date" className="h-8 w-40" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} aria-label="끝나는 날" />
                <span className="text-xs text-slate-500">비우면 제한 없음</span>
              </div>
            )}
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm text-slate-800">쉬는 날 건너뛰기</span>
                <span className="block text-xs text-slate-500">주말 · 공휴일 · 휴업일(방학 포함) — 학사일정 기준. 시험일은 보냅니다.</span>
              </span>
              <Switch checked={skipClosed} onCheckedChange={setSkipClosed} />
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              서버가 늦으면
              <Input type="number" min={1} max={720} className="h-8 w-20" value={grace}
                onChange={(e) => setGrace(Math.max(1, Math.min(720, Number(e.target.value) || 1)))} />
              분까지만 보내고, 그보다 늦으면 건너뜁니다.
            </label>
          </section>

          {/* ③ 받는 사람 */}
          <section className="space-y-3">
            <SectionLabel icon={Users}
              trailing={
                <span className="text-xs text-slate-500">
                  조건 {storedRule ? (resolution.isFetching ? '…' : `${ruleCount ?? 0}명`) : '없음'} · 직접 {people.length}명
                </span>
              }>
              받는 사람
            </SectionLabel>
            {ruleUnreadable ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                이 화면이 만들지 않은 모양의 조건이라 그대로 둡니다. 조건을 바꾸려면 새 자동화를 만들어 주세요.
              </p>
            ) : (
              <AudienceRuleBuilder value={audience} onChange={setAudience} />
            )}
            <div className="space-y-1">
              <p className="text-xs text-slate-500">조건은 보낼 때마다 다시 풀어서 인사이동을 따라갑니다. 꼭 받아야 하는 사람은 직접 고르세요.</p>
              <SearchableMultiSelect filterByTeacher selectedValues={people} onSelectionChange={setPeople}
                placeholder="교직원 직접 고르기…" searchPlaceholder="이름으로 검색" emptyText="검색 결과가 없습니다." />
            </div>
          </section>

          {/* ④ 쪽지 */}
          <section className="space-y-3">
            <SectionLabel icon={MessageSquareText}>쪽지</SectionLabel>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">본문 방식</span>
              <Select value={bodyMode} onValueChange={(v) => setBodyMode(v as BodyMode)}>
                <SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(BODY_MODE_LABEL) as BodyMode[]).map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">{BODY_MODE_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input value={msgTitle} maxLength={60} onChange={(e) => setMsgTitle(e.target.value)} placeholder="쪽지 제목" />
            <Textarea ref={bodyRef} value={body} rows={7} maxLength={4000} onChange={(e) => setBody(e.target.value)}
              placeholder={bodyMode === 'fixed' ? '보낼 글을 그대로 적어 주세요.' : '예: {날짜}({요일}) 급식지도 당번은 {급식지도 당번} 선생님입니다.'} />
            {tokensForMode(bodyMode).length > 0 && (
              <div className="space-y-1.5">
                <span className="flex items-center gap-1 text-xs text-slate-500"><Variable className="h-3.5 w-3.5" />눌러서 본문에 넣기</span>
                <div className="flex flex-wrap gap-1.5">
                  {tokensForMode(bodyMode).map((t) => (
                    <button key={t.name} type="button" title={t.hint} onClick={() => insertToken(t.name)}
                      className={cn('rounded-md border px-2 py-1 text-xs',
                        t.perRecipient ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}>
                      {`{${t.name}}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isPerRecipient(config) && (
              <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                {'{내 마감 임박 업무}'}가 들어 있어 사람마다 따로 한 통씩 보냅니다. 3일 안에 마감인 할 일이 없는 사람에게는 보내지 않습니다.
              </p>
            )}
            <p className="text-xs text-slate-500">값이 없는 변수는 «없음»으로 채워집니다. 쪽지는 회수할 수 없으니 미리보기에서 실제 글을 꼭 확인하세요.</p>
          </section>
        </div>

        <div className={cn(DIALOG_FOOTER_CLASS, 'flex-wrap items-center')}>
          <p className={cn('mr-auto min-w-0 text-xs', error ? 'text-rose-600' : 'text-slate-500')}>
            {error ?? (releasesApproval
              ? '언제·받는 사람·쪽지가 바뀌어 저장하면 승인이 풀리고 멈춥니다 — 미리보기를 보고 다시 승인해 주세요.'
              : automation?.approved_at ? '승인은 그대로 남습니다.' : '저장한 뒤 미리보기를 보고 승인합니다.')}
          </p>
          <Button variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} disabled={saving} onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button className={cn(FOOTER_BUTTON_CLASS, 'bg-blue-600 hover:bg-blue-700')} disabled={saving || Boolean(error)} onClick={save}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            저장하고 미리보기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
