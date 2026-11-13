import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, Pencil, TrendingUp, Users, Check, SlidersHorizontal, MapPin, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useDebounce } from '@/hooks/use-debounce';
import { useMajorSearch, useAddWishlistItem, useWishlist } from '../hooks/useWishlist';
import {
  TRACK_LABELS, MAJOR_SORT_LABELS, ADMISSION_REGIONS, DEFAULT_MAJOR_SEARCH_OPTIONS,
  TIER_LABELS, MAX_TOTAL_SLOTS,
  type AdmissionTrack, type NewWishlistInput, type MajorSearchResult,
  type MajorSortKey, type MajorSearchOptions, type WishlistTier,
} from '../types';
import { toast } from '@/lib/toast';
import { addRejectReason, isTotalFull } from '../utils/tierRules';

/** 대학+학과+**전형** 정규화 키 (중복 판정용). 전형을 포함해야 같은 학과의
 *  다른 전형이 모두 "추가됨"으로 오표시되지 않는다. */
function dupKey(track: string, university: string, department: string | null, admissionName: string | null): string {
  return `${track}|${(university ?? '').trim()}|${(department ?? '').trim()}|${(admissionName ?? '').trim()}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentCode: string;
  /** 추가할 칸 — 지원희망(apply, 기본) / 관심대학(interest) */
  tier?: WishlistTier;
}

function fmt(n: number | null, suffix = ''): string {
  return n == null || !Number.isFinite(n) ? '–' : `${n}${suffix}`;
}

export function AddProgramDialog({ open, onOpenChange, studentCode, tier = 'apply' }: Props) {
  const [track, setTrack] = useState<AdmissionTrack>('gyogwa');
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState(false);
  // 자유 입력 필드
  const [mUniv, setMUniv] = useState('');
  const [mDept, setMDept] = useState('');
  const [mName, setMName] = useState('');
  const [memo, setMemo] = useState('');

  // 정렬·필터 옵션 (지역·70%컷 범위·정렬 기준)
  const [sort, setSort] = useState<MajorSortKey>(DEFAULT_MAJOR_SEARCH_OPTIONS.sort);
  const [regions, setRegions] = useState<string[]>([]);
  const [cutMin, setCutMin] = useState('');
  const [cutMax, setCutMax] = useState('');
  const [recruitMin, setRecruitMin] = useState('');

  // 빈 문자열·비정상 입력은 무제한(null)로. 컷은 1~9 범위로 클램프.
  const parseCut = (v: string): number | null => {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return null;
    return Math.min(9, Math.max(1, n));
  };
  // 모집인원 최소: 0 이상 정수. 빈 문자열·비정상 입력은 무제한(null).
  const parseRecruit = (v: string): number | null => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, n);
  };
  const options = useMemo<MajorSearchOptions>(
    () => ({ regions, cutMin: parseCut(cutMin), cutMax: parseCut(cutMax), recruitMin: parseRecruit(recruitMin), sort }),
    [regions, cutMin, cutMax, recruitMin, sort]
  );

  const debounced = useDebounce(query, 250);
  const searchQ = useMajorSearch(track, manual ? '' : debounced, options);
  const addMut = useAddWishlistItem(studentCode);

  const toggleRegion = (r: string) =>
    setRegions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  const hasActiveFilter =
    regions.length > 0 || cutMin.trim() !== '' || cutMax.trim() !== '' || recruitMin.trim() !== '';

  // 모든 페이지를 한 배열로 평탄화
  const results = useMemo<MajorSearchResult[]>(
    () => searchQ.data?.pages.flat() ?? [],
    [searchQ.data]
  );

  // 무한 스크롤: 스크롤 컨테이너 바닥의 sentinel 이 보이면 다음 페이지 로드
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = searchQ;
  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { root, threshold: 0.1 }
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, results.length]);

  // 이미 추가된 항목 식별: adiga_id(매칭된 adiga.id) + 대학·학과·전형 조합 둘 다로 중복 판정.
  const existingQ = useWishlist(studentCode);
  const { existingAdigaIds, existingKeys } = useMemo(() => {
    const ids = new Set<string>();
    const keys = new Set<string>();
    for (const it of existingQ.data ?? []) {
      if (it.adiga?.id) ids.add(it.adiga.id);
      keys.add(dupKey(it.track, it.university, it.department, it.admissionName));
    }
    return { existingAdigaIds: ids, existingKeys: keys };
  }, [existingQ.data]);

  const isAlreadyAdded = (r: MajorSearchResult): boolean =>
    existingAdigaIds.has(r.adigaId) || existingKeys.has(dupKey(track, r.university, r.major, r.program));

  // **모달이 스스로 닫히지 않으므로 정원을 여기서도 검사한다.**
  // 종전엔 여는 쪽(`WishlistView.openAdd`)에서 한 번만 봤는데, 이제 한 번 열고
  // 계속 담을 수 있어 그것만으로는 관심대학 15개 상한을 넘길 수 있다.
  const counts = useMemo(() => {
    const rows = existingQ.data ?? [];
    return {
      apply: rows.filter((it) => (it.tier ?? 'apply') !== 'interest').length,
      interest: rows.filter((it) => it.tier === 'interest').length,
    };
  }, [existingQ.data]);
  const total = counts.apply + counts.interest;
  const tierFull = isTotalFull(counts);

  // 이번에 연 모달에서 몇 개를 담았는지 (닫기 버튼 문구에만 쓴다)
  const [addedCount, setAddedCount] = useState(0);

  const reset = () => {
    setQuery(''); setManual(false);
    setMUniv(''); setMDept(''); setMName(''); setMemo('');
    setSort(DEFAULT_MAJOR_SEARCH_OPTIONS.sort); setRegions([]); setCutMin(''); setCutMax(''); setRecruitMin('');
    setAddedCount(0);
  };
  const close = () => { reset(); onOpenChange(false); };

  const addFromSearch = async (r: MajorSearchResult) => {
    if (isAlreadyAdded(r)) { toast.info('이미 추가된 학교입니다'); return; }
    const full = addRejectReason(counts);
    if (full) { toast.error(full); return; }
    const input: NewWishlistInput = {
      studentCode,
      tier,
      track,
      university: r.university,
      department: r.major,
      admissionName: r.program,
      gyogwaId: null,
      jonghapCode: null,
      adigaId: r.adigaId,   // 학과 단위 매칭 → 커트라인 + 자동 링크 반영방법/면접
      memo: null,
    };
    try {
      await addMut.mutateAsync(input);
      setAddedCount((n) => n + 1);
      toast.success(`${TIER_LABELS[tier]}에 추가했습니다 · ${r.university} ${r.major ?? ''}`.trim());
      // **모달을 닫지 않는다** (2026-09-01 사용자 요청): 닫으면 다시 열 때
      // 검색어와 지역·컷·정렬 필터를 처음부터 다시 잡아야 한다. 여러 곳을 담는 것이
      // 이 화면의 정상 사용법이라 검색 상태를 그대로 두고 계속 고를 수 있게 한다.
      // 추가된 항목은 목록 갱신과 함께 행이 '추가됨'으로 바뀌어 중복 클릭을 막는다.
    } catch (e: any) {
      toast.error(`추가 실패: ${e.message ?? e}`);
    }
  };

  const addManual = async () => {
    if (!mUniv.trim()) { toast.error('대학명을 입력하세요'); return; }
    const full = addRejectReason(counts);
    if (full) { toast.error(full); return; }
    if (existingKeys.has(dupKey(track, mUniv.trim(), mDept.trim() || null, mName.trim() || null))) {
      toast.info('이미 추가된 학교입니다'); return;
    }
    const input: NewWishlistInput = {
      studentCode,
      tier,
      track,
      university: mUniv.trim(),
      department: mDept.trim() || null,
      admissionName: mName.trim() || null,
      gyogwaId: null,
      jonghapCode: null,
      adigaId: null,
      memo: memo.trim() || null,
    };
    try {
      await addMut.mutateAsync(input);
      setAddedCount((n) => n + 1);
      toast.success(`${TIER_LABELS[tier]}에 추가했습니다 (직접 입력)`);
      // 검색과 같은 이유로 모달은 열어 두되, 자유 입력은 값이 남으면 다음 입력과
      // 섞이므로 **입력만 비운다**(전형 트랙·필터는 유지).
      setMUniv(''); setMDept(''); setMName(''); setMemo('');
    } catch (e: any) {
      toast.error(`추가 실패: ${e.message ?? e}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent className="max-w-xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>수시 지원 학교 추가</DialogTitle>
          <DialogDescription>
            전형 유형을 고르고 <b>대학·학과</b>를 검색해 추가하세요. 목록에 없으면 직접 입력할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        {/* Track toggle */}
        <div className="flex gap-2">
          {(['gyogwa', 'jonghap'] as AdmissionTrack[]).map((t) => (
            <button
              key={t}
              onClick={() => setTrack(t)}
              className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                track === t
                  ? 'bg-brand-50 border-brand-300 text-brand-700 font-medium'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {TRACK_LABELS[t]}
            </button>
          ))}
        </div>

        {!manual ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="대학명·학과명 검색 (예: 간호, 충남대 사회학과)"
                className="pl-9"
              />
            </div>

            {/* 정렬·필터 바 — 정렬 / 지역(다중) / 70%컷 범위 */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {/* 정렬 */}
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
                <Select value={sort} onValueChange={(v) => setSort(v as MajorSortKey)}>
                  <SelectTrigger className="h-8 w-[9.5rem] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MAJOR_SORT_LABELS) as MajorSortKey[]).map((k) => (
                      <SelectItem key={k} value={k} className="text-xs">{MAJOR_SORT_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 지역 다중 선택 */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-normal">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {regions.length === 0 ? '지역 전체' : `지역 ${regions.length}곳`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <div className="grid grid-cols-2 gap-1">
                    {ADMISSION_REGIONS.map((r) => (
                      <label key={r} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer">
                        <Checkbox checked={regions.includes(r)} onCheckedChange={() => toggleRegion(r)} />
                        <span className="text-xs text-slate-700">{r}</span>
                      </label>
                    ))}
                  </div>
                  {regions.length > 0 && (
                    <button onClick={() => setRegions([])} className="mt-2 w-full text-[11px] text-slate-400 hover:text-slate-600 underline">
                      지역 선택 해제
                    </button>
                  )}
                </PopoverContent>
              </Popover>

              {/* 70%컷 범위 */}
              <div className="flex items-center gap-1 text-slate-500">
                <span className="text-[11px]">70%컷</span>
                <Input
                  value={cutMin}
                  onChange={(e) => setCutMin(e.target.value)}
                  inputMode="decimal"
                  placeholder="최소"
                  className="h-8 w-14 text-xs px-2"
                />
                <span className="text-slate-300">~</span>
                <Input
                  value={cutMax}
                  onChange={(e) => setCutMax(e.target.value)}
                  inputMode="decimal"
                  placeholder="최대"
                  className="h-8 w-14 text-xs px-2"
                />
              </div>

              {/* 모집인원 최소 */}
              <div className="flex items-center gap-1 text-slate-500">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[11px]">모집</span>
                <Input
                  value={recruitMin}
                  onChange={(e) => setRecruitMin(e.target.value)}
                  inputMode="numeric"
                  placeholder="최소"
                  className="h-8 w-16 text-xs px-2"
                />
                <span className="text-[11px]">명 이상</span>
              </div>

              {hasActiveFilter && (
                <button
                  onClick={() => { setRegions([]); setCutMin(''); setCutMax(''); setRecruitMin(''); }}
                  className="inline-flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" /> 필터 초기화
                </button>
              )}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-[14rem] -mx-1 px-1 custom-scrollbar">
              {debounced.trim().length === 0 && !hasActiveFilter ? (
                <p className="text-sm text-slate-400 text-center py-10">대학명·학과명을 입력하거나 지역·70%컷·모집인원 필터로 찾아보세요</p>
              ) : searchQ.isLoading ? (
                <p className="text-sm text-slate-400 text-center py-10">검색 중...</p>
              ) : results.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <p className="text-sm text-slate-400">검색 결과가 없습니다</p>
                  <Button variant="outline" size="sm" onClick={() => { setManual(true); setMUniv(query); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> "{query}" 직접 입력
                  </Button>
                </div>
              ) : (
                <ul className="space-y-1">
                  {results.map((r) => {
                    const added = isAlreadyAdded(r);
                    return (
                    <li key={r.adigaId}>
                      <button
                        onClick={() => addFromSearch(r)}
                        disabled={addMut.isPending || added}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-3 ${
                          added
                            ? 'border-emerald-100 bg-emerald-50/40 cursor-default'
                            : 'border-slate-100 hover:border-brand-200 hover:bg-brand-50/40'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm text-slate-800">{r.university}</span>
                            <span className="text-sm text-brand-700">{r.major}</span>
                            {r.region && <span className="text-[10px] text-slate-400">{r.region}</span>}
                          </div>
                          <div className="text-xs text-slate-500 truncate mt-0.5">{r.program}</div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-slate-500">
                            <span>70%컷 <b className="text-slate-700">{fmt(r.grade70)}</b></span>
                            <span className="inline-flex items-center gap-0.5">
                              <TrendingUp className="h-3 w-3 text-slate-400" />경쟁률 <b className="text-slate-700">{fmt(r.competition2026, ':1')}</b>
                            </span>
                            <span className="inline-flex items-center gap-0.5">
                              <Users className="h-3 w-3 text-slate-400" />모집 <b className="text-slate-700">{fmt(r.recruit2026)}</b>
                            </span>
                            {r.field && <span className="text-slate-400">· {r.field}</span>}
                          </div>
                          {/* 수능최저 (교과 best-match gyogwa) — 있을 때만 원문 미리보기 */}
                          {r.hasCsat && r.csat && (
                            <div className="mt-1 flex items-start gap-1">
                              <span className="text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 shrink-0 leading-tight">수능최저</span>
                              <span className="text-[10.5px] text-slate-500 line-clamp-2">{r.csat}</span>
                            </div>
                          )}
                        </div>
                        {added ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 shrink-0">
                            <Check className="h-3.5 w-3.5" /> 추가됨
                          </span>
                        ) : (
                          <Plus className="h-4 w-4 text-brand-400 shrink-0" />
                        )}
                      </button>
                    </li>
                    );
                  })}
                </ul>
              )}
              {/* 무한 스크롤 sentinel + 추가 로딩/종료 표시 */}
              {results.length > 0 && (
                <div ref={sentinelRef} className="py-3 text-center text-[11px] text-slate-400">
                  {isFetchingNextPage ? '더 불러오는 중…' : !hasNextPage ? '모든 결과를 불러왔습니다' : ''}
                </div>
              )}
            </div>

            <button
              onClick={() => setManual(true)}
              className="text-xs text-slate-400 hover:text-slate-600 underline self-start"
            >
              찾는 학과가 없나요? 직접 입력
            </button>
          </>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">대학명 *</label>
              <Input value={mUniv} onChange={(e) => setMUniv(e.target.value)} placeholder="예: 전북대학교" autoFocus />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">모집단위 / 학과</label>
              <Input value={mDept} onChange={(e) => setMDept(e.target.value)} placeholder="예: 간호학과" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">전형명</label>
              <Input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="예: 지역인재전형" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">메모</label>
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="선택 입력" />
            </div>
            <p className="text-[11px] text-slate-400">
              직접 입력한 항목도 같은 대학명으로 커트라인·반영방법을 자동 매칭해 표시합니다.
            </p>
            <button
              onClick={() => setManual(false)}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              ← 검색으로 돌아가기
            </button>
          </div>
        )}

        {/* 모달이 스스로 닫히지 않으므로 **닫는 길이 항상 보여야 한다**.
            담은 개수를 함께 적어 "몇 개 넣었는지" 확인하고 끝낼 수 있게 한다. */}
        <DialogFooter className="border-t border-slate-100 px-4 sm:px-6 py-3">
          <span className="mr-auto flex items-center gap-2 text-xs text-slate-500">
            {addedCount > 0 && <span>이번에 <b className="text-slate-700">{addedCount}곳</b> 담았습니다</span>}
            <span className={tierFull ? 'font-semibold text-amber-700' : 'text-slate-400'}>
              전체 {total}/{MAX_TOTAL_SLOTS}
              {tierFull && ' · 가득 참'}
            </span>
          </span>
          {manual && (
            <Button onClick={addManual} disabled={addMut.isPending}>
              <Plus className="h-4 w-4 mr-1" /> 추가
            </Button>
          )}
          <Button variant={addedCount > 0 ? 'default' : 'ghost'} onClick={close}>
            {addedCount > 0 ? '완료' : '닫기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
