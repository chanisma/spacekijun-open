/**
 * Course Selection 공용 atoms — mockup 디자인 톤을 inline-style로 캡슐화.
 *
 * 사용 원칙:
 * - 표면(버튼·입력·탭·필드·토글)은 이 atoms 사용 → mockup 디자인 그대로
 * - 복잡한 모달(Dialog/Select 등)은 shadcn 사용 (접근성·키보드 제어)
 */

import React from 'react';
import { ListChecks } from 'lucide-react';
import { T, categoryColor } from '../../utils/tokens';

// ============================================================
// SubjectTag — 과목군 컬러 칩
// ============================================================
export function SubjectTag({
  cat,
  size = 'sm',
  children,
}: {
  cat: string | null | undefined;
  size?: 'sm' | 'lg';
  children?: React.ReactNode;
}) {
  const c = categoryColor(cat);
  const dims =
    size === 'lg'
      ? { padding: '4px 10px', fontSize: 12 }
      : { padding: '2px 8px', fontSize: 11 };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: c.bg,
        color: c.ink,
        borderRadius: 999,
        fontWeight: 600,
        letterSpacing: -0.1,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...dims,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 5, background: c.dot }} />
      {children ?? cat ?? '과목'}
    </span>
  );
}

// ============================================================
// Pill
// ============================================================
type PillTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'outline';

const PILL_TONE: Record<PillTone, { bg: string; fg: string; bd: string }> = {
  neutral: { bg: T.surfaceSunk, fg: T.inkMuted, bd: T.border },
  primary: { bg: T.primarySoft, fg: T.primarySoftInk, bd: 'transparent' },
  success: { bg: T.successSoft, fg: T.successSoftInk, bd: 'transparent' },
  warning: { bg: T.warningSoft, fg: T.warningSoftInk, bd: 'transparent' },
  danger: { bg: T.dangerSoft, fg: T.dangerSoftInk, bd: 'transparent' },
  outline: { bg: 'transparent', fg: T.ink, bd: T.borderStrong },
};

export function Pill({
  children,
  tone = 'neutral',
  size = 'sm',
  style,
}: {
  children: React.ReactNode;
  tone?: PillTone;
  size?: 'sm' | 'lg';
  style?: React.CSSProperties;
}) {
  const tt = PILL_TONE[tone];
  const dims =
    size === 'lg' ? { padding: '5px 12px', fontSize: 12 } : { padding: '2px 9px', fontSize: 11 };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: tt.bg,
        color: tt.fg,
        border: `1px solid ${tt.bd}`,
        borderRadius: 999,
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...dims,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ============================================================
// Btn — mockup 시안의 버튼 (oklch primary + 고정 height)
// ============================================================
type BtnVariant = 'primary' | 'soft' | 'outline' | 'ghost' | 'danger' | 'success';

const BTN_VARIANT: Record<BtnVariant, { bg: string; fg: string; bd: string; hover?: string }> = {
  primary: { bg: T.primary, fg: '#fff', bd: T.primary, hover: T.primaryHover },
  soft: { bg: T.primarySoft, fg: T.primarySoftInk, bd: 'transparent' },
  outline: { bg: '#fff', fg: T.ink, bd: T.borderStrong },
  ghost: { bg: 'transparent', fg: T.inkMuted, bd: 'transparent' },
  danger: { bg: '#fff', fg: T.dangerSoftInk, bd: T.borderStrong },
  success: { bg: T.success, fg: '#fff', bd: T.success },
};

const BTN_SIZE = {
  sm: { padding: '6px 12px', fontSize: 12, height: 30 },
  md: { padding: '8px 16px', fontSize: 13, height: 36 },
  lg: { padding: '11px 20px', fontSize: 14, height: 44 },
};

export function Btn({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  full,
  disabled,
  onClick,
  type = 'button',
  style,
  title,
}: {
  children?: React.ReactNode;
  variant?: BtnVariant;
  size?: keyof typeof BTN_SIZE;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  full?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  type?: 'button' | 'submit';
  style?: React.CSSProperties;
  title?: string;
}) {
  const v = BTN_VARIANT[variant];
  const sz = BTN_SIZE[size];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        background: v.bg,
        color: v.fg,
        border: `1px solid ${v.bd}`,
        borderRadius: T.r2,
        fontWeight: 600,
        letterSpacing: -0.1,
        height: sz.height,
        padding: sz.padding,
        fontSize: sz.fontSize,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        width: full ? '100%' : undefined,
        transition: 'background-color .15s ease',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled && v.hover) (e.currentTarget as HTMLButtonElement).style.background = v.hover;
      }}
      onMouseLeave={(e) => {
        if (!disabled && v.hover) (e.currentTarget as HTMLButtonElement).style.background = v.bg;
      }}
    >
      {icon}
      {children && <span style={{ whiteSpace: 'nowrap' }}>{children}</span>}
      {iconRight}
    </button>
  );
}

// ============================================================
// Input — mockup 34px flat input (prefix/suffix slot)
// ============================================================
type InputElProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'size'>;

export function Input({
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  mono,
  type = 'text',
  style,
  inputStyle,
  disabled,
  ...rest
}: {
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  mono?: boolean;
  type?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  disabled?: boolean;
} & Omit<InputElProps, 'value' | 'onChange' | 'placeholder' | 'type' | 'style' | 'prefix'>) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: disabled ? T.surfaceSunk : '#fff',
        border: `1px solid ${T.border}`,
        borderRadius: T.r2,
        height: 34,
        padding: '0 12px',
        gap: 8,
        fontSize: 13,
        color: T.ink,
        fontFamily: mono
          ? T.fontMono
          : '"Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif',
        ...style,
      }}
    >
      {prefix && <span style={{ color: T.inkDim, display: 'flex' }}>{prefix}</span>}
      <input
        {...rest}
        type={type}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: 13,
          fontFamily: 'inherit',
          color: T.ink,
          minWidth: 0,
          padding: 0,
          ...inputStyle,
        }}
      />
      {suffix && <span style={{ color: T.inkDim, display: 'flex' }}>{suffix}</span>}
    </div>
  );
}

// ============================================================
// Textarea
// ============================================================
export function Textarea({
  value,
  onChange,
  placeholder,
  rows = 4,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  style?: React.CSSProperties;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%',
        background: '#fff',
        border: `1px solid ${T.border}`,
        borderRadius: T.r2,
        padding: '10px 12px',
        fontSize: 13,
        color: T.ink,
        fontFamily: 'inherit',
        lineHeight: 1.55,
        resize: 'vertical',
        outline: 'none',
        ...style,
      }}
    />
  );
}

// ============================================================
// Field — label + control + hint
// ============================================================
export function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label?: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      {label && (
        <span style={{ fontSize: 12, fontWeight: 600, color: T.ink, letterSpacing: -0.1 }}>
          {label}
          {required && <span style={{ color: T.danger, marginLeft: 4 }}>*</span>}
        </span>
      )}
      {children}
      {hint && !error && <span style={{ fontSize: 11, color: T.inkDim }}>{hint}</span>}
      {error && <span style={{ fontSize: 11, color: T.danger }}>{error}</span>}
    </label>
  );
}

// ============================================================
// Toggle — mockup의 작은 토글
// ============================================================
export function Toggle({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        justifyContent: 'space-between',
        fontSize: 12.5,
        color: T.ink,
        cursor: 'pointer',
      }}
    >
      {label && <span>{label}</span>}
      <span
        style={{
          width: 32,
          height: 18,
          borderRadius: 999,
          background: value ? T.primary : T.surfaceSunk,
          border: `1px solid ${value ? T.primary : T.borderStrong}`,
          position: 'relative',
          flexShrink: 0,
          transition: 'background-color .15s ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 1,
            left: value ? 14 : 1,
            width: 14,
            height: 14,
            borderRadius: 999,
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,.2)',
            transition: 'left .15s ease',
          }}
        />
      </span>
    </div>
  );
}

// ============================================================
// CapacityBar
// ============================================================
export function CapacityBar({
  enrolled,
  capacity,
  height = 4,
  showLabel = false,
}: {
  enrolled: number;
  capacity: number | null;
  height?: number;
  showLabel?: boolean;
}) {
  if (capacity == null) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: T.inkMuted,
          fontFamily: T.fontMono,
        }}
      >
        <span>{enrolled}명</span>
        <span style={{ color: T.inkDim, fontWeight: 500 }}>· 제한 없음</span>
      </div>
    );
  }
  const pct = Math.min(100, (enrolled / capacity) * 100);
  const tone = pct >= 95 ? T.danger : pct >= 80 ? T.warning : T.primary;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 90 }}>
      {showLabel && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            fontFamily: T.fontMono,
          }}
        >
          <span style={{ color: T.ink, fontWeight: 600 }}>
            {enrolled}
            <span style={{ color: T.inkDim }}>/{capacity}</span>
          </span>
          <span style={{ color: tone, fontWeight: 600 }}>{Math.round(pct)}%</span>
        </div>
      )}
      <div
        style={{
          height,
          background: T.surfaceSunk,
          borderRadius: height,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: tone,
            borderRadius: height,
            transition: 'width .25s ease',
          }}
        />
      </div>
    </div>
  );
}

// ============================================================
// 헤더 부품 — course-analyze `Header.tsx`와 같은 디자인 언어(글래스 바 + 알약 탭 + 정보 카드).
// 다른 atoms와 달리 Tailwind 클래스를 쓰는 이유: 두 화면이 같은 클래스 문자열을 공유해야
// 한쪽만 손봤을 때 조용히 어긋나는 일이 없다.
// ============================================================

/** 헤더 우측 정보 카드의 라벨-값 한 쌍. */
export function HeaderStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-slate-500 font-medium scale-90 origin-right whitespace-nowrap">
        {label}
      </span>
      <div className="flex items-baseline gap-0.5 whitespace-nowrap">
        <span className="font-bold text-brand-600">{value}</span>
        {unit && <span className="text-slate-400 text-xs">{unit}</span>}
      </div>
    </div>
  );
}

/** HeaderStat 사이 구분선. */
export function HeaderStatDivider() {
  return <div className="w-px h-2.5 bg-slate-200 shrink-0" />;
}

/** 헤더 우측 끝 텍스트 액션 (course-analyze의 Admin 버튼과 동일 톤). */
export function HeaderAction({
  icon,
  children,
  onClick,
  title,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="text-slate-500 hover:text-slate-800 text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1"
    >
      {icon}
      {children}
    </button>
  );
}

// ============================================================
// AdminTabs — 운영 화면 상단 헤더
// ============================================================
export function AdminTabs({
  tabs,
  active,
  onChange,
  info,
  rightAction,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  /** 우측 정보 카드 내용 — HeaderStat / HeaderStatDivider 조합 */
  info?: React.ReactNode;
  /** 헤더 우측 끝에 표시할 액션 (예: 학생 미리보기 버튼) */
  rightAction?: React.ReactNode;
}) {
  return (
    <header className="px-5 py-2.5 bg-white/60 backdrop-blur-md border-b border-white/20 relative z-40 supports-[backdrop-filter]:bg-white/60 shrink-0">
      <div className="flex items-center justify-between h-full w-full gap-4">
        {/* 왼쪽 섹션: 타이틀 */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-gradient-to-r from-brand-600 to-brand-500 text-white px-2.5 py-1 rounded-md text-xs font-bold shadow-sm tracking-wide whitespace-nowrap flex items-center gap-1.5">
            <ListChecks size={12} />
            SELECT
          </div>
          <span className="text-slate-800 text-sm font-bold tracking-tight whitespace-nowrap">
            수강신청 관리
          </span>
        </div>

        {/* 중앙 섹션: 탭 메뉴 */}
        <div className="flex-1 flex justify-center">
          <nav className="flex items-center gap-1 bg-white/50 backdrop-blur-sm px-2 py-1 rounded-full border border-white/40 shadow-sm">
            {tabs.map((t) => {
              const on = t.id === active;
              return (
                <button
                  key={t.id}
                  onClick={() => onChange(t.id)}
                  className={`
                    px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-full transition-all duration-200
                    ${on
                      ? 'text-white bg-gradient-to-r from-brand-500 to-brand-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-white/80'
                    }
                  `}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 오른쪽 섹션: 정보 + 액션 */}
        <div className="flex items-center gap-4 shrink-0 justify-end">
          {info && (
            <div className="flex items-center gap-3 bg-white/50 px-3 py-1 rounded-full border border-white/40 shadow-sm">
              {info}
            </div>
          )}
          {info && rightAction && <div className="w-px h-3 bg-slate-200 mx-1 shrink-0" />}
          {rightAction}
        </div>
      </div>
    </header>
  );
}

// ============================================================
// GroupTabs — 학생 화면의 선택군 탭 (numbered + bottom-border)
// ============================================================
export function GroupTabs({
  groups,
  active,
  completedMap,
  onChange,
}: {
  groups: { id: string; name: string; category_codes?: string[] | null }[];
  active: string;
  completedMap: Record<string, 'saved' | 'partial' | 'untouched'>;
  onChange: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 4,
        borderBottom: `1px solid ${T.border}`,
        padding: '0 28px',
        background: '#fff',
        flexShrink: 0,
        overflowX: 'auto',
      }}
    >
      {groups.map((g, i) => {
        const isActive = g.id === active;
        const state = completedMap[g.id];
        const saved = state === 'saved';
        const partial = state === 'partial';
        return (
          <button
            key={g.id}
            onClick={() => onChange(g.id)}
            style={{
              position: 'relative',
              padding: '14px 16px 13px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? T.ink : T.inkMuted,
              borderBottom: isActive ? `2px solid ${T.primary}` : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                fontSize: 10.5,
                fontWeight: 700,
                fontFamily: T.fontMono,
                display: 'grid',
                placeItems: 'center',
                background: saved ? T.success : partial ? T.warning : isActive ? T.primary : T.surfaceSunk,
                color: saved || partial || isActive ? '#fff' : T.inkMuted,
              }}
            >
              {saved ? '✓' : i + 1}
            </span>
            {(g.category_codes ?? []).slice(0, 2).map((c) => (
              <SubjectTag key={c} cat={c} size="sm" />
            ))}
            <span>{g.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// StatusBar — 학생 화면 진행 상태 줄
// ============================================================
export function StatusBar({
  done,
  total,
  dirtyCount,
  lastSavedAt,
}: {
  done: number;
  total: number;
  dirtyCount: number;
  lastSavedAt?: string | null;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 28px',
        background: T.surfaceMuted,
        borderBottom: `1px solid ${T.border}`,
        fontSize: 12,
        flexShrink: 0,
      }}
    >
      <span style={{ color: T.inkMuted, fontWeight: 600 }}>전체 진행</span>
      <div
        style={{
          flex: 1,
          maxWidth: 280,
          height: 6,
          background: '#fff',
          border: `1px solid ${T.border}`,
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${(done / Math.max(1, total)) * 100}%`,
            height: '100%',
            background: T.primary,
            borderRadius: 999,
          }}
        />
      </div>
      <span style={{ fontFamily: T.fontMono, fontWeight: 600, color: T.ink }}>
        {done}
        <span style={{ color: T.inkDim }}>/{total}</span> 선택군 저장
      </span>
      {dirtyCount > 0 && <Pill tone="warning" size="sm">미저장 변경 {dirtyCount}건</Pill>}
      {lastSavedAt && (
        <span style={{ marginLeft: 'auto', color: T.inkDim, fontFamily: T.fontMono }}>
          마지막 저장 {lastSavedAt}
        </span>
      )}
    </div>
  );
}

// ============================================================
// EmptyHint
// ============================================================
export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '32px 24px',
        textAlign: 'center',
        color: T.inkMuted,
        fontSize: 13,
        lineHeight: 1.6,
        background: T.surfaceSunk,
        borderRadius: T.r3,
      }}
    >
      {children}
    </div>
  );
}
