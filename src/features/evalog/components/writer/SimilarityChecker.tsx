import React, { useMemo, useState } from 'react';
import { checkSentenceSimilarity, SentenceSimilarityResult } from '../../utils/similarity';
import { AlertTriangle, CheckCircle, Sparkles, X, Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { rewriteSentence } from '../../utils/solarApi';
import { DialogFooter,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

interface SimilarityCheckerProps {
    currentText: string;
    otherDocs: { studentId: string; studentName: string; text: string }[];
    onReplace?: (original: string, newText: string) => void;
}

const SimilarityChecker: React.FC<SimilarityCheckerProps> = ({ currentText, otherDocs, onReplace }) => {
    const [rewriteDialog, setRewriteDialog] = useState<{ open: boolean; original: string }>({ open: false, original: '' });
    const [isRewriting, setIsRewriting] = useState(false);
    const [rewrittenText, setRewrittenText] = useState('');

    // Debounce text input to prevent lag during typing (500ms delay)
    const debouncedText = useDebounce(currentText, 500);

    const results = useMemo(() => {
        if (!debouncedText.trim() || otherDocs.length === 0) return [];

        // We only need studentId and text for the utility
        const docsForCheck = otherDocs.map(d => ({ studentId: d.studentId, text: d.text }));
        const simResults = checkSentenceSimilarity(debouncedText, docsForCheck);

        return simResults;
    }, [debouncedText, otherDocs]);

    const highSimilaritySentences = results.filter(r => r.maxSimilarity >= 0.85);
    const maxSim = highSimilaritySentences.length > 0
        ? Math.max(...highSimilaritySentences.map(s => s.maxSimilarity))
        : 0;

    const handleRewrite = async () => {
        if (!rewriteDialog.original) return;

        setIsRewriting(true);
        try {
            const result = await rewriteSentence(rewriteDialog.original);
            setRewrittenText(result);
        } catch (error) {
            console.error(error);
            toast.error('문장 생성에 실패했습니다.');
        } finally {
            setIsRewriting(false);
        }
    };

    const handleApplyReplace = () => {
        if (onReplace && rewriteDialog.original && rewrittenText) {
            onReplace(rewriteDialog.original, rewrittenText);
            setRewriteDialog({ open: false, original: '' });
            setRewrittenText('');
        }
    };

    if (!currentText.trim()) {
        return (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 text-center text-slate-400 text-xs">
                비교할 내용을 입력해주세요.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    {highSimilaritySentences.length > 0 ? (
                        <>
                            <AlertTriangle size={14} className="text-amber-500" />
                            <span className="text-amber-700">유사도 주의 ({Math.round(maxSim * 100)}%)</span>
                        </>
                    ) : (
                        <>
                            <CheckCircle size={14} className="text-emerald-500" />
                            <span className="text-emerald-700">유사도 안전</span>
                        </>
                    )}
                </h4>
                <span className="text-[10px] text-slate-400">유사 문장 클릭 시 AI 문장 생성</span>
            </div>

            <div className="p-3 bg-white rounded-md border border-slate-200 text-xs leading-relaxed max-h-[200px] overflow-y-auto custom-scrollbar">
                {results.map((result, idx) => {
                    const matchRatio = result.similarStudentIds.length / Math.max(otherDocs.length, 1);
                    const simPercent = result.maxSimilarity * 100;

                    let baseColor = "green"; // ~40%
                    if (simPercent >= 85) baseColor = "slate"; // 85~100% (Black/Slate)
                    else if (simPercent >= 60) baseColor = "red"; // 60~85%
                    else if (simPercent >= 40) baseColor = "amber"; // 40~60% (Yellow/Amber)

                    let intensity = "100"; // < 5% (Light)
                    if (matchRatio >= 0.2) intensity = "300"; // > 20% (Dark)
                    else if (matchRatio >= 0.05) intensity = "200"; // 5~20% (Medium)

                    // Special handling for slate (black)
                    if (baseColor === "slate") {
                        if (matchRatio >= 0.2) intensity = "500";
                        else if (matchRatio >= 0.05) intensity = "300";
                        else intensity = "200";
                    }

                    // Static lookup map to ensure Tailwind classes are preserved
                    const getHighlightStyle = (c: string, i: string) => {
                        const styleMap: Record<string, Record<string, string>> = {
                            green: {
                                "100": "bg-green-100 text-green-900 decoration-green-300 decoration-wavy underline cursor-pointer transition-colors hover:bg-green-200",
                                "200": "bg-green-200 text-green-900 decoration-green-400 decoration-wavy underline cursor-pointer transition-colors hover:bg-green-300",
                                "300": "bg-green-300 text-green-950 decoration-green-500 decoration-wavy underline cursor-pointer transition-colors hover:bg-green-400"
                            },
                            amber: {
                                "100": "bg-amber-100 text-amber-900 decoration-amber-300 decoration-wavy underline cursor-pointer transition-colors hover:bg-amber-200",
                                "200": "bg-amber-200 text-amber-900 decoration-amber-400 decoration-wavy underline cursor-pointer transition-colors hover:bg-amber-300",
                                "300": "bg-amber-300 text-amber-950 decoration-amber-500 decoration-wavy underline cursor-pointer transition-colors hover:bg-amber-400"
                            },
                            red: {
                                "100": "bg-red-100 text-red-900 decoration-red-300 decoration-wavy underline cursor-pointer transition-colors hover:bg-red-200",
                                "200": "bg-red-200 text-red-900 decoration-red-400 decoration-wavy underline cursor-pointer transition-colors hover:bg-red-300",
                                "300": "bg-red-300 text-red-950 decoration-red-500 decoration-wavy underline cursor-pointer transition-colors hover:bg-red-400"
                            },
                            slate: {
                                "200": "bg-slate-200 text-slate-900 decoration-slate-400 decoration-wavy underline cursor-pointer transition-colors hover:bg-slate-300",
                                "300": "bg-slate-300 text-slate-900 decoration-slate-500 decoration-wavy underline cursor-pointer transition-colors hover:bg-slate-400",
                                "500": "bg-slate-500 text-white decoration-slate-700 decoration-wavy underline cursor-pointer transition-colors hover:bg-slate-600"
                            }
                        };
                        return styleMap[c]?.[i] || "";
                    };

                    const highlightClass = result.maxSimilarity >= 0.2
                        ? getHighlightStyle(baseColor, intensity)
                        : "";

                    const similarStudentNames = result.similarStudentIds.map(id =>
                        otherDocs.find(d => d.studentId === id)?.studentName
                    ).filter(Boolean).join(', ');

                    return (
                        <span
                            key={idx}
                            className={highlightClass}
                            title={result.maxSimilarity >= 0.2 ? `유사 학생: ${similarStudentNames} (${Math.round(result.maxSimilarity * 100)}%)` : undefined}
                            onClick={() => {
                                if (result.maxSimilarity >= 0.2) {
                                    setRewriteDialog({ open: true, original: result.sentence });
                                    setRewrittenText(''); // Reset on open
                                }
                            }}
                        >
                            {result.sentence}{' '}
                        </span>
                    );
                })}
            </div>

            <Dialog open={rewriteDialog.open} onOpenChange={(open) => setRewriteDialog(prev => ({ ...prev, open }))}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-violet-600" />
                            AI 문장 재생성
                        </DialogTitle>
                        <DialogDescription>
                            유사도가 높은 문장을 AI를 사용하여 다르게 표현할 수 있습니다.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500">원본 문장</label>
                            <div className="p-3 bg-slate-50 rounded-md text-sm text-slate-700 border border-slate-100">
                                {rewriteDialog.original}
                            </div>
                        </div>

                        {rewrittenText && (
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-violet-500">생성된 문장</label>
                                <div className="p-3 bg-violet-50 rounded-md text-sm text-slate-800 border border-violet-100 animate-in fade-in slide-in-from-bottom-2">
                                    {rewrittenText}
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setRewriteDialog(prev => ({ ...prev, open: false }))}>
                            취소
                        </Button>
                        {!rewrittenText ? (
                            <Button onClick={handleRewrite} disabled={isRewriting} className="bg-violet-600 hover:bg-violet-700 text-white">
                                {isRewriting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        생성중...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="mr-2 h-4 w-4" />
                                        문장 생성
                                    </>
                                )}
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={handleRewrite}
                                    disabled={isRewriting}
                                    className="border-violet-300 text-violet-600 hover:bg-violet-50"
                                >
                                    {isRewriting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            생성중...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="mr-2 h-4 w-4" />
                                            다시 생성
                                        </>
                                    )}
                                </Button>
                                <Button onClick={handleApplyReplace} disabled={isRewriting} className="bg-green-600 hover:bg-green-700 text-white">
                                    적용하기
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default SimilarityChecker;
