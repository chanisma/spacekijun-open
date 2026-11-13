import React, { useCallback, useMemo, useState, useEffect } from 'react';
import type { Student } from '../../types';
import WordCloud from 'wordcloud';
import {
  analyzeWordFrequency,
  extractStudentTexts
} from '../../utils/textAnalysis';
import { BarChart2, Cloud, FileText, ArrowRight, Loader2, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { WordFrequency } from '../../utils/textAnalysis';
import WordContextGraph from './WordContextGraph';
import type { WordContextFilter } from './WordContextGraph';


interface WordAnalysisProps {
  student: Student;
}

const WordAnalysis: React.FC<WordAnalysisProps> = ({ student }) => {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [contextFilter, setContextFilter] = useState<WordContextFilter | null>(null);
  const [zoomLevel, setZoomLevel] = useState(3); // weightFactor (1~6 범위)
  const [wordFrequencies, setWordFrequencies] = useState<WordFrequency[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  /**
   * 캔버스를 **state 로** 잡는다(단순 ref 가 아니라).
   *
   * 캔버스는 `isAnalyzing === false && wordCloudData.length > 0` 일 때만 마운트되는데,
   * 이 둘은 서로 다른 마이크로태스크에서 갱신된다(`.then` 이 wordFrequencies, `.finally` 가
   * isAnalyzing). React 가 둘을 한 렌더로 묶으면 정상이지만 **두 렌더로 갈리면**:
   *   1차 — wordCloudData 가 바뀌어 렌더 이펙트가 돌지만 isAnalyzing 이 아직 true 라
   *          캔버스가 없다 → ref 는 null → 아무것도 그리지 않는다
   *   2차 — 캔버스가 붙지만 wordCloudData 는 그대로 → 이펙트가 다시 돌지 않는다 → **빈 캔버스**
   * ref 는 바뀌어도 리렌더를 일으키지 않아 이 구멍을 못 메운다. state 로 두면 캔버스가
   * 붙는 순간이 곧 이펙트의 의존값이 되어 순서와 무관하게 항상 그려진다.
   * ("가끔 워드클라우드가 안 보임"의 원인 — 2026-09-04)
   */
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

  // 학생의 모든 비교과 텍스트 추출
  const studentTexts = useMemo(() => {
    return extractStudentTexts(student);
  }, [student]);

  // 형태소 분석기는 워드 분석 탭에 진입할 때 지연 로드된다.
  useEffect(() => {
    let cancelled = false;
    const texts = studentTexts.map(({ text, category, source }) => ({ text, category, source }));

    setIsAnalyzing(true);
    setAnalysisError(null);
    setWordFrequencies([]);
    setSelectedWord(null);
    setContextFilter(null);

    analyzeWordFrequency(texts, { topN: 100 })
      .then(frequencies => {
        if (!cancelled) setWordFrequencies(frequencies);
      })
      .catch(error => {
        console.error('단어 형태소 분석 실패:', error);
        if (!cancelled) setAnalysisError('단어 분석 중 오류가 발생했습니다.');
      })
      .finally(() => {
        if (!cancelled) setIsAnalyzing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentTexts]);

  // TOP 5 단어
  const top5Words = useMemo(() => wordFrequencies.slice(0, 5), [wordFrequencies]);

  // 워드클라우드 데이터 (빈도 vs 소스 다양성 중 높은 값 적용)
  // 가중치 공식: max(빈도, 소스개수 × 1.5)
  const wordCloudData = useMemo(() => {
    return wordFrequencies
      .filter(f => f.count >= 2)
      .slice(0, 50)
      .map(f => ({
        text: f.word,
        value: Math.max(f.count, f.sourceCount * 1.5),
        category: f.category
      }))
      .sort((a, b) => b.value - a.value);
  }, [wordFrequencies]);

  const handleWordClick = useCallback((word: string) => {
    setSelectedWord(currentWord => currentWord === word ? null : word);
    setContextFilter(null);
  }, []);

  // 마우스 휠로 확대/축소 (passive: false로 등록해야 preventDefault 동작)
  useEffect(() => {
    const canvas = canvasEl;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) {
        setZoomLevel(prev => Math.min(6, prev + 1));
      } else {
        setZoomLevel(prev => Math.max(1, prev - 1));
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [canvasEl]);

  // wordcloud 라이브러리 렌더링 — 캔버스가 붙은 뒤에만, 그리고 붙을 때마다 다시 그린다
  useEffect(() => {
    if (canvasEl && wordCloudData.length > 0) {
      const list: [string, number][] = wordCloudData.map(item => [item.text, item.value]);

      WordCloud(canvasEl, {
        list,
        gridSize: 8,
        weightFactor: zoomLevel,
        fontFamily: 'sans-serif',
        color: () => {
          const colors = ['#8b5cf6', '#a78bfa', '#6366f1', '#818cf8', '#ec4899', '#f472b6'];
          return colors[Math.floor(Math.random() * colors.length)];
        },
        rotateRatio: 0,
        rotationSteps: 0,
        backgroundColor: 'transparent',
        click: item => {
          handleWordClick(item[0]);
        },
        hover: item => {
          canvasEl.style.cursor = item ? 'pointer' : 'default';
        }
      });

      // wordcloud2 는 타이머로 단어를 하나씩 그린다. 정리하지 않으면 탭을 벗어나거나
      // 다시 그릴 때 이전 실행이 계속 돌아 캔버스를 덧그린다.
      return () => WordCloud.stop();
    }
  }, [canvasEl, handleWordClick, wordCloudData, zoomLevel]);

  // 선택된 단어가 포함된 텍스트 찾기
  const textsWithSelectedWord = useMemo(() => {
    if (!selectedWord) return [];
    return studentTexts.filter(({ text }) => text.includes(selectedWord));
  }, [selectedWord, studentTexts]);

  const visibleSourceTexts = useMemo(() => {
    if (!contextFilter) return textsWithSelectedWord;

    return textsWithSelectedWord.filter(item => (
      item.category === contextFilter.category
      && (!contextFilter.source || item.source === contextFilter.source)
    ));
  }, [contextFilter, textsWithSelectedWord]);

  return (
    <div className="space-y-6">
      {/* 헤더 안내 */}
      <div className="glass-panel p-5 bg-blue-50/30 border-blue-100/50">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100/50 text-blue-600 rounded-lg shrink-0">
            <FileText size={20} />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm mb-1">텍스트 분석 가이드</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              학생의 교과 세특 및 비교과 기록(자율/동아리/진로/행동특성)에서 추출한 키워드를 분석합니다.
              <br />
              <span className="text-blue-600 font-medium">💡 단어를 클릭하면 해당 단어가 포함된 원본 텍스트를 확인할 수 있습니다.</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* TOP 5 빈도수 테이블 */}
        <div className="glass-panel p-6 lg:col-span-1 h-full">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100/50">
            <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
              <BarChart2 size={18} />
            </div>
            <h3 className="font-semibold text-slate-800">키워드 빈도 TOP 5</h3>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-100/60 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-gray-100 text-slate-500 text-xs">
                  <th className="py-2.5 px-2 text-center font-medium w-10">순위</th>
                  <th className="py-2.5 px-2 text-center font-medium w-12">빈도</th>
                  <th className="py-2.5 px-2 text-center font-medium w-12">소스</th>
                  <th className="py-2.5 px-2 text-center font-medium">단어</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {top5Words.map((item, index) => (
                  <tr key={index} className="bg-white hover:bg-slate-50/50 transition-colors group">
                    <td className="py-2.5 px-2 text-center font-medium text-slate-400 group-hover:text-brand-500 transition-colors">{index + 1}</td>
                    <td className="py-2.5 px-2 text-center font-bold text-slate-700">{item.count}</td>
                    <td className="py-2.5 px-2 text-center text-slate-500">{item.sourceCount}</td>
                    <td className="py-2.5 px-2 text-center">
                      <button
                        onClick={() => handleWordClick(item.word)}
                        className="px-3 py-1 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 transition-all font-medium text-xs border border-brand-100/50 shadow-sm hover:shadow"
                      >
                        {item.word}
                      </button>
                    </td>
                  </tr>
                ))}
                {isAnalyzing && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 text-xs">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        키워드 분석 중
                      </span>
                    </td>
                  </tr>
                )}
                {!isAnalyzing && analysisError && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-red-500 text-xs">
                      {analysisError}
                    </td>
                  </tr>
                )}
                {!isAnalyzing && !analysisError && top5Words.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 text-xs">
                      분석할 데이터가 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 워드클라우드 */}
        <div className="glass-panel p-6 lg:col-span-2 min-h-[400px] flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100/50">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
                <Cloud size={18} />
              </div>
              <h3 className="font-semibold text-slate-800">워드클라우드</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 hidden sm:block">스크롤로 확대/축소</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setZoomLevel(prev => Math.max(1, prev - 1))}
                  disabled={zoomLevel <= 1}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="축소"
                >
                  <ZoomOut size={16} />
                </button>
                <span className="text-xs text-slate-400 w-8 text-center">{zoomLevel}x</span>
                <button
                  onClick={() => setZoomLevel(prev => Math.min(6, prev + 1))}
                  disabled={zoomLevel >= 6}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="확대"
                >
                  <ZoomIn size={16} />
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 rounded-2xl bg-gradient-to-br from-slate-50/50 to-white border border-slate-100/80 flex items-center justify-center overflow-hidden relative group hover:border-brand-100 transition-colors">
            {isAnalyzing ? (
              <div className="text-slate-400 text-sm flex items-center gap-2">
                <Loader2 size={18} className="animate-spin" />
                키워드 분석 중
              </div>
            ) : analysisError ? (
              <div className="text-red-500 text-sm">{analysisError}</div>
            ) : wordCloudData.length > 0 ? (
              <canvas
                ref={setCanvasEl}
                width={800}
                height={400}
                className="max-w-full cursor-pointer opacity-90 hover:opacity-100 transition-opacity"
                title="마우스 스크롤로 확대/축소"
              />
            ) : (
              <div className="text-slate-400 text-sm flex flex-col items-center gap-2">
                <Cloud size={32} className="opacity-20" />
                분석할 데이터가 없습니다
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedWord && textsWithSelectedWord.length > 0 && (
        <WordContextGraph
          word={selectedWord}
          texts={textsWithSelectedWord}
          filter={contextFilter}
          onFilterChange={setContextFilter}
        />
      )}

      {/* 선택된 단어가 포함된 텍스트 */}
      {selectedWord && (
        <div className="glass-panel p-6 animate-in slide-in-from-top-4 duration-300">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-xl font-bold text-slate-800">"{selectedWord}"</span>
              <span className="font-medium text-slate-500">단어가 포함된 원본 텍스트</span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                {visibleSourceTexts.length}/{textsWithSelectedWord.length}건
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedWord(null);
                setContextFilter(null);
              }}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              title="선택 닫기"
            >
              <X size={20} />
            </button>
          </div>
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {visibleSourceTexts.map((item, index) => (
              <div key={index} className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2.5 py-1 bg-brand-50 text-brand-700 rounded-md text-xs font-bold border border-brand-100">
                    {item.category}
                  </span>
                  <ArrowRight size={12} className="text-slate-300" />
                  <span className="text-xs font-medium text-slate-500">{item.source}</span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed font-medium">
                  {item.text.split(selectedWord).map((part, i, arr) => (
                    <React.Fragment key={i}>
                      {part}
                      {i < arr.length - 1 && (
                        <mark className="bg-yellow-200/80 px-1 rounded text-slate-900 font-bold mx-0.5">
                          {selectedWord}
                        </mark>
                      )}
                    </React.Fragment>
                  ))}
                </p>
              </div>
            ))}
            {visibleSourceTexts.length === 0 && (
              <div className="text-center text-slate-500 py-12 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                해당 단어가 포함된 텍스트가 없습니다
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WordAnalysis;
