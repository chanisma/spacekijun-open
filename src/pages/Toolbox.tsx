import React, { useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { PageContainer } from '../components/layout/PageContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { FileText, ClipboardList, RefreshCw, ChevronRight, Sparkles, Search, CalendarSearch, Armchair, FilePenLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AbsenceReportDialog from '../components/toolbox/AbsenceReportDialog';
import RiroSurveyDialog from '../components/toolbox/RiroSurveyDialog';
import { LessonExchangeDocumentDialog } from '../components/toolbox/LessonExchangeDocumentDialog';
import MeetingTimeSearchDialog from '../components/schedule/MeetingTimeSearchDialog';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ToolCategory = 'all' | 'admin' | 'class' | 'student';

interface ToolItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  colorClass: string;
  iconBgClass: string; // Background color for the icon
  category: ToolCategory;
  action?: () => void;
  component?: React.ReactNode;
}

const Toolbox: React.FC = () => {
  const navigate = useNavigate();
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const tools: ToolItem[] = [
    {
      id: 'absence-report',
      title: '학생 결석 신고서',
      description: '학생 결석 신고서를 간편하게 작성하고 바로 출력하세요.',
      icon: <FileText className="h-6 w-6" />,
      colorClass: 'text-blue-600',
      iconBgClass: 'bg-blue-100',
      category: 'student',
      component: <AbsenceReportDialog open={selectedTool === 'absence-report'} onOpenChange={(open) => setSelectedTool(open ? 'absence-report' : null)} />
    },
    {
      id: 'riro-survey',
      title: '리로스쿨 설문지 출력',
      description: '여러 개의 리로스쿨 설문지 결과를 개인별로 일괄 출력합니다.',
      icon: <ClipboardList className="h-6 w-6" />,
      colorClass: 'text-green-600',
      iconBgClass: 'bg-green-100',
      category: 'admin',
      component: <RiroSurveyDialog open={selectedTool === 'riro-survey'} onOpenChange={(open) => setSelectedTool(open ? 'riro-survey' : null)} />
    },
    {
      id: 'lesson-exchange',
      title: '수업 교환/대체 계획서',
      description: '수업 교환 및 대체 계획서를 표준 양식에 맞춰 작성합니다.',
      icon: <RefreshCw className="h-6 w-6" />,
      colorClass: 'text-purple-600',
      iconBgClass: 'bg-purple-100',
      category: 'class',
      component: <LessonExchangeDocumentDialog open={selectedTool === 'lesson-exchange'} onOpenChange={(open) => setSelectedTool(open ? 'lesson-exchange' : null)} />
    },
    {
      // 스케줄 머리글 [부가 기능] 메뉴에서도 연다(2026-09-28) — 회의를 잡으려는 사람은 달력을 보고 있다.
      // 도구 모음에도 남긴다(사용자 결정). 컴포넌트는 schedule 쪽 한 벌을 함께 쓴다.
      id: 'meeting-time-search',
      title: '회의 가능 시간 검색',
      description: '교사를 선택하면 시간표를 바탕으로 회의 가능한 시간대를 한눈에 확인합니다.',
      icon: <CalendarSearch className="h-6 w-6" />,
      colorClass: 'text-indigo-600',
      iconBgClass: 'bg-indigo-100',
      category: 'admin',
      component: <MeetingTimeSearchDialog open={selectedTool === 'meeting-time-search'} onOpenChange={(open) => setSelectedTool(open ? 'meeting-time-search' : null)} />
    },
    {
      id: 'seat-arrangement',
      title: '자리 배치',
      description: '학급 학생들을 좌석 배치도에 자동/수동으로 배치하고 인쇄합니다.',
      icon: <Armchair className="h-6 w-6" />,
      colorClass: 'text-blue-600',
      iconBgClass: 'bg-blue-100',
      category: 'class',
      action: () => navigate('/seat-arrangement'),
    },
    {
      id: 'hwpx-editor',
      title: 'HWPX 시각 편집기',
      description: 'HWP/HWPX 문서를 브라우저에서 열어 편집하고 새 파일로 저장합니다.',
      icon: <FilePenLine className="h-6 w-6" />,
      colorClass: 'text-cyan-700',
      iconBgClass: 'bg-cyan-100',
      category: 'admin',
      action: () => navigate('/toolbox/hwpx-editor'),
    },
    {
      id: 'placeholder-1',
      title: '준비 중',
      description: '더 편리한 교무 업무를 위한 새로운 도구를 준비하고 있습니다.',
      icon: <Sparkles className="h-6 w-6" />,
      colorClass: 'text-amber-600',
      iconBgClass: 'bg-amber-100',
      category: 'all',
    }
  ];

  const filteredTools = tools.filter(tool => {
    // Filter by category
    if (activeCategory !== 'all' && tool.category !== activeCategory && tool.category !== 'all') {
      return false;
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        tool.title.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query)
      );
    }

    return true;
  });

  const handleToolClick = (tool: ToolItem) => {
    if (tool.id.startsWith('placeholder')) return;

    if (tool.action) {
      tool.action();
    } else if (tool.component) {
      setSelectedTool(tool.id);
    }
  };

  return (
    <Layout>
      <PageContainer width="narrow" className="min-h-[calc(100vh-80px)]">

        <div className="space-y-6">
          {/* Compact Header & Controls */}
          <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/40 shadow-sm p-3">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <Tabs defaultValue="all" value={activeCategory} onValueChange={setActiveCategory} className="w-full md:w-auto">
                <TabsList className="bg-slate-100/50 p-1 rounded-lg h-auto flex-wrap">
                  <TabsTrigger value="all" className="text-xs px-3 py-1.5 h-auto data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm">전체</TabsTrigger>
                  <TabsTrigger value="student" className="text-xs px-3 py-1.5 h-auto data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm">학생 관리</TabsTrigger>
                  <TabsTrigger value="class" className="text-xs px-3 py-1.5 h-auto data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm">수업</TabsTrigger>
                  <TabsTrigger value="admin" className="text-xs px-3 py-1.5 h-auto data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm">행정</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="도구 검색..."
                  className="pl-9 h-9 text-sm bg-white border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20 shadow-sm transition-all rounded-lg"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Grid Layout */}
          {filteredTools.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
              {filteredTools.map((tool) => (
                <div
                  key={tool.id}
                  onClick={() => handleToolClick(tool)}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border transition-all duration-300",
                    !tool.id.startsWith('placeholder')
                      ? "bg-white/70 backdrop-blur-md border-white/40 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-1 cursor-pointer"
                      : "bg-slate-50/50 border-slate-100 opacity-70 cursor-not-allowed"
                  )}
                >
                  {/* Decorative background gradient on hover */}
                  {!tool.id.startsWith('placeholder') && (
                    <div className={cn(
                      "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-10 transition-opacity duration-300 pointer-events-none",
                      tool.colorClass.replace('text-', 'from-')
                    )} />
                  )}

                  <div className="p-6 h-full flex flex-col items-start relative z-10">
                    <div className="flex items-start justify-between w-full mb-5">
                      <div className={cn(
                        "p-3.5 rounded-2xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-sm",
                        !tool.id.startsWith('placeholder')
                          ? "bg-white shadow-inner ring-1 ring-slate-100"
                          : "bg-slate-100"
                      )}>
                        <div className={cn(
                          "transition-colors duration-300",
                          tool.colorClass
                        )}>
                          {tool.icon}
                        </div>
                      </div>

                      {!tool.id.startsWith('placeholder') && (
                        <div className="text-slate-300 group-hover:text-indigo-500 transition-colors duration-300">
                          <ChevronRight className="h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 flex-grow">
                      <h3 className={cn(
                        "text-lg font-bold tracking-tight transition-colors duration-300",
                        !tool.id.startsWith('placeholder')
                          ? "text-slate-900 group-hover:text-indigo-700"
                          : "text-slate-400"
                      )}>
                        {tool.title}
                      </h3>
                      <p className="text-sm text-slate-500 leading-relaxed line-clamp-2">
                        {tool.description}
                      </p>
                    </div>

                    {tool.id.startsWith('placeholder') && (
                      <div className="mt-4 inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-500 text-[10px] font-medium uppercase tracking-wider">
                        Coming Soon
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">검색 결과가 없습니다</h3>
              <p className="text-slate-500 max-w-xs mx-auto mt-2">
                다른 검색어를 입력하거나 카테고리를 변경해보세요.
              </p>
            </div>
          )}

          {/* Render selected tool components (Dialogs) */}
          {tools.map(tool => tool.component ? (
            <div key={tool.id}>
              {tool.component}
            </div>
          ) : null)}

        </div>
      </PageContainer>
    </Layout>
  );
};

export default Toolbox;
