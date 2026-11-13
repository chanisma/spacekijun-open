import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTagDefinitions } from '../../hooks/useTagDefinitions';
import { upsertTagDefinition } from '../../services/rescueTag';
import { toast } from '@/components/ui/use-toast';
import { useQueryClient } from '@tanstack/react-query';

const COLOR_OPTIONS = [
  'bg-red-500', 'bg-amber-500', 'bg-yellow-500', 'bg-green-500', 'bg-teal-500',
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-pink-500', 'bg-gray-500',
];

export function TagDefinitionsAdmin() {
  const qc = useQueryClient();
  const defsQ = useTagDefinitions();
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('bg-blue-500');
  const [sortOrder, setSortOrder] = useState(100);

  const save = async () => {
    if (!key.trim() || !label.trim()) {
      toast({ title: 'key와 라벨을 입력해주세요.', variant: 'destructive' });
      return;
    }
    try {
      await upsertTagDefinition({ key: key.trim(), label: label.trim(), color, sortOrder });
      setKey(''); setLabel(''); setSortOrder(100);
      qc.invalidateQueries({ queryKey: ['rescue-note', 'tag-definitions'] });
    } catch (e: any) {
      toast({ title: '저장 실패', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gradient-to-b from-slate-50 via-white to-slate-50 min-h-full">
      {/* Existing tags */}
      <section className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl shadow-sm p-5">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0"></span>
          기존 태그
        </h3>
        {(defsQ.data ?? []).length === 0 ? (
          <p className="text-xs text-slate-400">등록된 태그 없음</p>
        ) : (
          <ul className="space-y-1.5">
            {(defsQ.data ?? []).map((d) => (
              <li key={d.key} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/40 hover:bg-white/80 transition-all">
                <span className={`w-3 h-3 rounded-full shrink-0 ${d.color}`} />
                <span className="font-medium text-sm text-slate-800">{d.label}</span>
                <span className="text-[11px] text-slate-400 font-mono">({d.key})</span>
                <span className="text-[11px] text-slate-400 ml-auto">정렬 {d.sortOrder}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Add / edit form */}
      <section className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl shadow-sm p-5">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0"></span>
          새 태그 추가 / 수정
        </h3>
        <div className="grid grid-cols-2 gap-4 max-w-xl">
          <div>
            <Label htmlFor="t-key" className="text-xs font-medium text-slate-700 mb-1 block">key (영문, 고유)</Label>
            <Input id="t-key" value={key} onChange={(e) => setKey(e.target.value)} className="text-sm" />
          </div>
          <div>
            <Label htmlFor="t-label" className="text-xs font-medium text-slate-700 mb-1 block">라벨 (한국어)</Label>
            <Input id="t-label" value={label} onChange={(e) => setLabel(e.target.value)} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1 block">색상</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full ${c} transition-all ${color === c ? 'ring-2 ring-slate-800 ring-offset-1 scale-110' : 'hover:scale-110'}`}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="t-sort" className="text-xs font-medium text-slate-700 mb-1 block">정렬 순서</Label>
            <Input
              id="t-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="text-sm"
            />
          </div>
        </div>
        <Button className="mt-5" onClick={save}>저장</Button>
      </section>
    </div>
  );
}
