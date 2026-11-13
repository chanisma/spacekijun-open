// ========================================
// 입력 받기 설정 편집기 — 누구에게(대상 규칙) · 무엇을 한 줄로(줄 단위·구분) · 어떤 칸을(항목) · 어떻게(공개 방식)
// 요청을 보낸 뒤에는 줄 단위·응답 방식·구분·공개 방식이 잠기고(서버도 거부), 항목은 추가·이름 변경만 된다.
// ========================================

import { useState } from 'react';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AudienceRuleBuilder } from '@/components/audience/AudienceRuleBuilder';
import { AUDIENCE_AXIS_LABEL, type AudienceAxis } from '@/lib/audienceRule';
import {
  collectAnswerModeLabel,
  COLLECT_FIELD_TYPE_LABEL,
  COLLECT_MODE_LABEL,
  dimensionsFromLines,
  nextKey,
  type CollectConfig,
  type CollectField,
  type CollectFieldType,
} from '@/lib/collectInput';
import { cn } from '@/lib/utils';

const DIMENSION_PRESETS: { label: string; items: string[] }[] = [
  { label: '1차·2차 정기시험', items: ['1차 정기시험', '2차 정기시험'] },
  { label: '1학기·2학기', items: ['1학기', '2학기'] },
];

const AXIS_HINT: Record<AudienceAxis, string> = {
  person: '대상자 한 명이 한 줄을 채웁니다.',
  subject: '대상자가 이번 학기에 가르치는 과목(학년별)마다 한 줄이 생깁니다.',
  class: '대상자가 가르치는 학급마다 한 줄이 생깁니다.',
  club: '대상자가 지도하는 동아리마다 한 줄 — 공동지도 교사 중 누구든 채웁니다.',
  club_member: '대상자가 지도하는 동아리의 부원마다 한 줄 — 누가기록처럼 학생별로 받을 때.',
};

interface Props {
  value: CollectConfig;
  onChange: (next: CollectConfig) => void;
  /** 요청을 보낸 뒤 — 구조 잠금 */
  locked: boolean;
  /** 보낸 요청의 항목 키 — 잠금 후에도 지우거나 형식을 바꿀 수 없는 항목 */
  lockedFieldKeys?: string[];
  children?: React.ReactNode; // 대상 미리보기 자리
}

export function CollectConfigEditor({ value, onChange, locked, lockedFieldKeys = [], children }: Props) {
  const [dimText, setDimText] = useState('');
  const set = <K extends keyof CollectConfig>(key: K, v: CollectConfig[K]) => onChange({ ...value, [key]: v });

  const updateField = (index: number, patch: Partial<CollectField>) =>
    set('fields', value.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  return (
    <div className="space-y-6">
      <Section title="요청">
        <div className="grid gap-2 sm:grid-cols-[1fr_170px] sm:items-end">
          <Input
            value={value.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="요청 이름 (예: 정기시험 문항 점검 확인)"
            aria-label="요청 이름"
          />
          {/* 기한의 뜻은 툴팁이 아니라 글로 (2026-10-06) — 터치에서는 툴팁이 안 열리고, [입력 닫기]와 반대로 읽혔다 */}
          <label className="flex flex-col gap-1 text-[11px] text-slate-500">
            기한(선택)
            <Input
              type="date"
              value={value.dueDate ?? ''}
              onChange={(e) => set('dueDate', e.target.value || null)}
              aria-label="기한"
            />
          </label>
        </div>
        <p className="text-[11px] text-slate-500">기한은 알림·목록에 보이기만 합니다 — 지나도 입력은 열려 있고, 받기를 끝내려면 현황에서 [입력 닫기]를 누릅니다.</p>
        <Textarea
          value={value.guide}
          onChange={(e) => set('guide', e.target.value)}
          rows={2}
          placeholder="응답자에게 보일 안내 (선택)"
          className="text-sm"
        />
      </Section>

      <Section title="누구에게">
        <AudienceRuleBuilder value={value.audience} onChange={(audience) => set('audience', audience)} allowTaskScoped />
        {children}
      </Section>

      <Section title="한 줄의 단위" locked={locked}>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {(Object.keys(AUDIENCE_AXIS_LABEL) as AudienceAxis[]).map((axis) => (
            <OptionCard
              key={axis}
              active={value.axis === axis}
              disabled={locked}
              title={AUDIENCE_AXIS_LABEL[axis]}
              hint={AXIS_HINT[axis]}
              onClick={() => set('axis', axis)}
            />
          ))}
        </div>
        {value.axis !== 'person' && (
          <div className="space-y-1.5">
            {/* 따로 된 질문이다 — 제목 없이 아래 줄에 붙어 있으면 위 카드와 한 선택(5지선다)처럼 읽혔다 */}
            <p className="text-xs font-medium text-slate-600">
              같은 {value.axis === 'class' ? '학급' : value.axis === 'club' ? '동아리' : value.axis === 'club_member' ? '부원' : '과목'}을 여럿이 맡으면
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['each', 'shared'] as const).map((mode) => {
                const label = collectAnswerModeLabel(mode, value.axis);
                return (
                  <OptionCard
                    key={mode}
                    active={value.answerMode === mode}
                    disabled={locked}
                    title={label.title}
                    hint={label.hint}
                    onClick={() => set('answerMode', mode)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </Section>

      <Section title="구분 (한 줄을 여러 칸으로 나눌 때)" locked={locked}>
        <div className="flex flex-wrap items-center gap-1.5">
          {value.dimensions.map((d) => (
            <span key={d.key} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs">
              {d.label}
              {!locked && (
                <button
                  type="button"
                  aria-label={`${d.label} 빼기`}
                  className="-my-1 -mr-1 flex h-11 w-11 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 sm:h-5 sm:w-5"
                  onClick={() => set('dimensions', value.dimensions.filter((x) => x.key !== d.key))}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {value.dimensions.length === 0 && <span className="text-xs text-slate-400">구분 없음 — 한 줄에 한 번 답합니다.</span>}
        </div>
        {!locked && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              value={dimText}
              onChange={(e) => setDimText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && dimText.trim()) {
                  e.preventDefault();
                  set('dimensions', dimensionsFromLines([...value.dimensions.map((d) => d.label), dimText].join('\n'), value.dimensions));
                  setDimText('');
                }
              }}
              placeholder="구분 이름 입력 후 Enter (여러 개는 쉼표로)"
              className="h-11 max-w-xs text-xs sm:h-8"
            />
            {DIMENSION_PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                size="sm"
                className="h-11 text-xs sm:h-8"
                onClick={() => set('dimensions', dimensionsFromLines(p.items.join('\n'), value.dimensions))}
              >
                {p.label}
              </Button>
            ))}
          </div>
        )}
      </Section>

      <Section title="입력 항목">
        <div className="space-y-2">
          {value.fields.map((f, i) => {
            const structureLocked = locked && lockedFieldKeys.includes(f.key);
            return (
              <div key={f.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg border bg-slate-50/60 p-2.5 sm:grid-cols-[1fr_120px_auto_auto]">
                <Input
                  value={f.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  placeholder="항목 이름 (예: 점검 완료)"
                  className="col-span-3 h-9 text-sm sm:col-span-1"
                  aria-label="항목 이름"
                />
                <Select
                  value={f.type}
                  disabled={structureLocked}
                  onValueChange={(v) => updateField(i, { type: v as CollectFieldType, options: v === 'select' ? f.options ?? [] : undefined })}
                >
                  <SelectTrigger className="h-9 text-xs" aria-label="형식"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(COLLECT_FIELD_TYPE_LABEL) as CollectFieldType[]).map((t) => (
                      <SelectItem key={t} value={t}>{COLLECT_FIELD_TYPE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <Checkbox checked={Boolean(f.required)} onCheckedChange={(c) => updateField(i, { required: c === true })} />
                  필수
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-slate-400 hover:text-rose-600"
                  aria-label="항목 지우기"
                  disabled={structureLocked || value.fields.length <= 1}
                  title={structureLocked ? '보낸 뒤에는 기존 항목을 지울 수 없습니다' : undefined}
                  onClick={() => set('fields', value.fields.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                {f.type === 'select' && (
                  <Input
                    value={(f.options ?? []).join(', ')}
                    onChange={(e) => updateField(i, { options: e.target.value.split(',').map((o) => o.trimStart()) })}
                    placeholder="보기를 쉼표로 (예: 완료, 진행 중, 해당 없음)"
                    className="col-span-3 h-8 text-xs sm:col-span-4"
                    aria-label="보기"
                  />
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs text-blue-600"
            onClick={() =>
              set('fields', [...value.fields, { key: nextKey('f', value.fields.map((f) => f.key)), label: '', type: 'text', required: false }])
            }
          >
            <Plus className="h-3.5 w-3.5" />
            항목 추가
          </Button>
        </div>
      </Section>

      <Section title="응답이 누구에게 보이나" locked={locked}>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['private', 'shared'] as const).map((mode) => (
            <OptionCard
              key={mode}
              active={value.mode === mode}
              disabled={locked}
              title={COLLECT_MODE_LABEL[mode].title}
              hint={COLLECT_MODE_LABEL[mode].hint}
              onClick={() => set('mode', mode)}
            />
          ))}
        </div>
        <p className="text-[11px] text-slate-400">어느 방식이든 결과는 표로 모입니다. 보낸 뒤에는 바꿀 수 없습니다(이미 한 비공개 답이 공개되는 것을 막기 위해).</p>
      </Section>
    </div>
  );
}

export function Section({ title, locked, children }: { title: string; locked?: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        {title}
        {locked && (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-normal text-slate-500">
            <Lock className="h-3 w-3" />보낸 뒤 잠김
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

function OptionCard({ active, disabled, title, hint, onClick }: {
  active: boolean;
  disabled?: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-lg border p-2.5 text-left transition-colors disabled:cursor-not-allowed',
        active ? 'border-blue-300 bg-blue-50/70 ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:bg-slate-50',
        disabled && !active && 'opacity-50',
      )}
    >
      <div className={cn('text-sm font-medium', active ? 'text-blue-800' : 'text-slate-700')}>{title}</div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{hint}</div>
    </button>
  );
}
