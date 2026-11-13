import React, { useState } from 'react';
import { Student, Evaluation } from '../../types';
import { ChevronDown, ChevronUp, ClipboardList } from 'lucide-react';

interface WorksheetPanelProps {
  student: Student | null;
  evaluation: Evaluation | null;
}

const WorksheetPanel: React.FC<WorksheetPanelProps> = ({
  student,
  evaluation
}) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    academic: true,
    activities: true,
    overall: true
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (!student || !evaluation) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-50/50 border border-slate-100 flex items-center justify-center">
          <ClipboardList size={32} className="text-slate-300" />
        </div>
        <p className="text-sm font-medium">평가할 학생을 선택해주세요</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* 헤더 */}
      <div className="px-5 py-4 flex items-center justify-between bg-white/50 backdrop-blur-sm border-b border-white/20">
        <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
          평가 워크시트
        </h2>
        <div className="text-xs text-slate-500 font-medium bg-white px-2 py-1 rounded-md shadow-sm border border-slate-100">
          {student.name} ({student.studentNo})
        </div>
      </div>

      {/* 평가 항목 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">

        {/* 학업 역량 평가 */}
        <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/60 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md hover:border-brand-200">
          <div
            className="px-4 py-3 flex items-center justify-between cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-colors select-none"
            onClick={() => toggleSection('academic')}
          >
            <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-brand-500"></span>
              학업역량
            </span>
            {expandedSections.academic ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </div>

          {expandedSections.academic && (
            <div className="p-4 space-y-4 border-t border-slate-100 animate-fadeIn">
              {/* 평가 표 */}
              <table className="w-full text-xs border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-slate-400">
                    <th className="font-medium p-1 text-left">평가항목</th>
                    <th className="font-medium p-1 text-center w-8">5</th>
                    <th className="font-medium p-1 text-center w-8">4</th>
                    <th className="font-medium p-1 text-center w-8">3</th>
                    <th className="font-medium p-1 text-center w-8">2</th>
                    <th className="font-medium p-1 text-center w-8">1</th>
                  </tr>
                </thead>
                <tbody className="text-slate-600">
                  <tr className="bg-white rounded-lg shadow-sm">
                    <td className="p-2 pl-3 font-medium rounded-l-lg border-2 border-transparent hover:border-brand-100 transition-all">학업성취도</td>
                    {[5, 4, 3, 2, 1].map(score => (
                      <td key={score} className="p-1 text-center last:rounded-r-lg">
                        <input type="radio" name="achievement" value={score} defaultChecked={score === 4}
                          className="accent-brand-600 w-3.5 h-3.5 cursor-pointer" />
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white rounded-lg shadow-sm">
                    <td className="p-2 pl-3 font-medium rounded-l-lg border-2 border-transparent hover:border-brand-100 transition-all">학업태도</td>
                    {[5, 4, 3, 2, 1].map(score => (
                      <td key={score} className="p-1 text-center last:rounded-r-lg">
                        <input type="radio" name="attitude" value={score} defaultChecked={score === 3}
                          className="accent-brand-600 w-3.5 h-3.5 cursor-pointer" />
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white rounded-lg shadow-sm">
                    <td className="p-2 pl-3 font-medium rounded-l-lg border-2 border-transparent hover:border-brand-100 transition-all">학업발전가능성</td>
                    {[5, 4, 3, 2, 1].map(score => (
                      <td key={score} className="p-1 text-center last:rounded-r-lg">
                        <input type="radio" name="potential" value={score} defaultChecked={score === 5}
                          className="accent-brand-600 w-3.5 h-3.5 cursor-pointer" />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>

              {/* 평가 코멘트 */}
              <div className="relative">
                <textarea
                  className="w-full p-3 border border-slate-200 rounded-lg text-xs resize-none h-20 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all bg-white"
                  placeholder="구체적인 평가 근거를 입력하세요..."
                />
                <span className="absolute bottom-2 right-2 text-[10px] text-slate-300">0/500</span>
              </div>
            </div>
          )}
        </div>

        {/* 전공 적합성 평가 */}
        <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/60 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md hover:border-brand-200">
          <div
            className="px-4 py-3 flex items-center justify-between cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-colors select-none"
            onClick={() => toggleSection('activities')}
          >
            <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-brand-500"></span>
              전공적합성
            </span>
            {expandedSections.activities ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </div>

          {expandedSections.activities && (
            <div className="p-4 space-y-4 border-t border-slate-100 animate-fadeIn">
              {/* 체크박스 평가 */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100 hover:border-brand-200 cursor-pointer transition-all">
                  <input type="checkbox" defaultChecked className="accent-brand-600 rounded" />
                  <span className="text-xs text-slate-700">전공관련 교과목 이수</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100 hover:border-brand-200 cursor-pointer transition-all">
                  <input type="checkbox" defaultChecked className="accent-brand-600 rounded" />
                  <span className="text-xs text-slate-700">전공관련 비교과활동</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100 hover:border-brand-200 cursor-pointer transition-all">
                  <input type="checkbox" className="accent-brand-600 rounded" />
                  <span className="text-xs text-slate-700">전공관련 독서활동</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100 hover:border-brand-200 cursor-pointer transition-all">
                  <input type="checkbox" defaultChecked className="accent-brand-600 rounded" />
                  <span className="text-xs text-slate-700">진로희망 일관성</span>
                </label>
              </div>

              {/* 점수 선택 */}
              <div className="flex items-center gap-3 bg-brand-50/50 p-2 rounded-lg border border-brand-100">
                <label className="text-xs font-bold text-brand-800">전공적합성 종합:</label>
                <select className="border border-brand-200 rounded px-2 py-1 text-xs bg-white text-brand-900 focus:outline-none focus:ring-1 focus:ring-brand-500">
                  <option value="5">매우우수 (5점)</option>
                  <option value="4" selected>우수 (4점)</option>
                  <option value="3">보통 (3점)</option>
                  <option value="2">미흡 (2점)</option>
                  <option value="1">매우미흡 (1점)</option>
                </select>
              </div>

              <div className="relative">
                <textarea
                  className="w-full p-3 border border-slate-200 rounded-lg text-xs resize-none h-20 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all bg-white"
                  placeholder="전공적합성 평가 근거를 입력하세요..."
                />
              </div>
            </div>
          )}
        </div>

        {/* 인성 및 종합 평가 */}
        <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/60 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md hover:border-brand-200">
          <div
            className="px-4 py-3 flex items-center justify-between cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-colors select-none"
            onClick={() => toggleSection('overall')}
          >
            <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-brand-500"></span>
              종합평가
            </span>
            {expandedSections.overall ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </div>

          {expandedSections.overall && (
            <div className="p-4 space-y-4 border-t border-slate-100 animate-fadeIn">
              {/* 점수 요약 */}
              <div className="grid grid-cols-4 gap-2 text-xs">
                {[
                  { label: "학업역량", score: "4.0" },
                  { label: "전공적합성", score: "4.0" },
                  { label: "인성", score: "3.5" },
                  { label: "발전가능성", score: "4.0" }
                ].map((item, idx) => (
                  <div key={idx} className="text-center p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
                    <div className="font-medium text-slate-500 mb-1">{item.label}</div>
                    <div className="text-lg font-bold text-brand-600">{item.score}</div>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-3">
                <label className="text-xs font-bold text-slate-800 block mb-2">
                  종합의견 (최종)
                </label>
                <textarea
                  className="w-full p-3 border border-slate-200 rounded-lg text-xs resize-none h-24 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all bg-white"
                  placeholder="종합적인 평가 의견을 입력하세요..."
                  defaultValue="우수한 학업 성취도와 전공 관련 활동을 보이며, 발전 가능성이 높은 학생으로 평가됨."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button className="flex-1 py-2.5 bg-white text-slate-600 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all shadow-sm">
                  임시저장
                </button>
                <button className="flex-1 py-2.5 bg-brand-600 text-white rounded-lg text-xs font-bold hover:bg-brand-500 transition-all shadow-md hover:shadow-lg shadow-brand-500/20">
                  평가완료
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default WorksheetPanel;