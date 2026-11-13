import { useState, useCallback, useEffect, useRef } from 'react';
import { Layout } from '@/components/layout/Layout';
import {
  KnowledgeGraphIframe,
  useStudentKnowledgeGraph,
  useKgGrades,
  useKgClasses,
  useKgStudents,
} from '@/features/kg-viewer';
import type { KgJson } from '@/services/studentKgService';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Loader2, RefreshCw, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

const KnowledgeGraphPage = () => {
  // ─── Student selection state ───
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedStudentName, setSelectedStudentName] = useState<string>('');

  // ─── File upload state (테스트용) ───
  const [fileKgData, setFileKgData] = useState<KgJson | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Data queries ───
  const { data: grades, isLoading: gradesLoading } = useKgGrades();
  const { data: classes, isLoading: classesLoading } = useKgClasses(selectedGrade);
  const { data: students, isLoading: studentsLoading } = useKgStudents(selectedGrade, selectedClass);
  const {
    kgData,
    versionInfo,
    isLoading: kgLoading,
    isFetching: kgFetching,
    error: kgError,
    hasData,
    refetch: refetchKg,
  } = useStudentKnowledgeGraph(selectedStudentId);

  // ─── Toast on KG fetch error ───
  useEffect(() => {
    if (kgError) {
      toast.error('지식 그래프 조회 실패', {
        description: kgError.message || '데이터를 불러오는 중 오류가 발생했습니다.',
      });
    }
  }, [kgError]);

  // ─── Handlers ───
  const handleGradeChange = (value: string) => {
    const grade = Number(value);
    setSelectedGrade(grade);
    setSelectedClass(null);
    setSelectedStudentId(null);
    setSelectedStudentName('');
  };

  const handleClassChange = (value: string) => {
    const cls = Number(value);
    setSelectedClass(cls);
    setSelectedStudentId(null);
    setSelectedStudentName('');
  };

  const handleStudentChange = (value: string) => {
    setSelectedStudentId(value);
    const student = students?.find((s) => s.id === value);
    setSelectedStudentName(student?.name ?? '');
  };

  // ─── File upload handler ───
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string) as KgJson;

        // 기본 유효성 검사
        if (!Array.isArray(json.entities) || !Array.isArray(json.triples)) {
          toast.error('잘못된 KG JSON 형식', {
            description: 'entities와 triples 배열이 필요합니다.',
          });
          return;
        }

        setFileKgData(json);
        setFileName(file.name);
        toast.success('파일 로드 완료', {
          description: `엔티티 ${json.entities.length}개, 관계 ${json.triples.length}개`,
        });
      } catch {
        toast.error('JSON 파싱 실패', {
          description: '유효한 JSON 파일이 아닙니다.',
        });
      }
    };
    reader.readAsText(file, 'UTF-8');

    // input 초기화 (같은 파일 재선택 가능하도록)
    e.target.value = '';
  }, []);

  const handleClearFile = useCallback(() => {
    setFileKgData(null);
    setFileName('');
  }, []);

  // ─── 표시할 데이터 결정: 파일 우선, DB 폴백 ───
  const displayData = fileKgData ?? kgData;
  const isFileMode = !!fileKgData;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">지식 그래프</h1>
            <p className="text-sm text-muted-foreground">
              학생별 세특 텍스트에서 추출한 역량, 활동, 관심분야 간의 관계를 시각화합니다.
            </p>
          </div>
          {/* File upload button */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
            {isFileMode ? (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1.5 py-1">
                  <Upload className="h-3 w-3" />
                  {fileName}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleClearFile}
                  title="파일 미리보기 닫기"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                JSON 불러오기
              </Button>
            )}
          </div>
        </div>

        {/* File preview mode */}
        {isFileMode && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {fileKgData.student_code && `${fileKgData.student_code} `}지식 그래프
                  <Badge variant="secondary" className="ml-2">파일 미리보기</Badge>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <KnowledgeGraphIframe
                  data={fileKgData}
                  height={700}
                  studentName={fileKgData.student_code}
                />
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>엔티티: {fileKgData.entities.length}개</span>
                  <span>관계: {fileKgData.triples.length}개</span>
                  {fileKgData.source_stats?.categories && (
                    <span>카테고리: {Object.keys(fileKgData.source_stats.categories).join(', ')}</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Student Selection (DB 모드) */}
        {!isFileMode && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">학생 선택</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {/* Grade */}
                  <Select
                    value={selectedGrade?.toString() ?? ''}
                    onValueChange={handleGradeChange}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="학년" />
                    </SelectTrigger>
                    <SelectContent>
                      {gradesLoading ? (
                        <SelectItem value="_loading" disabled>불러오는 중...</SelectItem>
                      ) : (
                        grades?.map((g) => (
                          <SelectItem key={g} value={g.toString()}>
                            {g}학년
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  {/* Class */}
                  <Select
                    value={selectedClass?.toString() ?? ''}
                    onValueChange={handleClassChange}
                    disabled={!selectedGrade}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="반" />
                    </SelectTrigger>
                    <SelectContent>
                      {classesLoading ? (
                        <SelectItem value="_loading" disabled>불러오는 중...</SelectItem>
                      ) : (
                        classes?.map((c) => (
                          <SelectItem key={c} value={c.toString()}>
                            {c}반
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  {/* Student */}
                  <Select
                    value={selectedStudentId ?? ''}
                    onValueChange={handleStudentChange}
                    disabled={!selectedClass}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="학생" />
                    </SelectTrigger>
                    <SelectContent>
                      {studentsLoading ? (
                        <SelectItem value="_loading" disabled>불러오는 중...</SelectItem>
                      ) : (
                        students?.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.number ?? '?'}번 {s.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* KG Viewer from DB */}
            {selectedStudentId && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">
                        {selectedStudentName && `${selectedStudentName} `}지식 그래프
                      </CardTitle>
                      {kgFetching && !kgLoading && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {versionInfo && (
                        <>
                          <Badge variant="secondary">v{versionInfo.version}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(versionInfo.created_at).toLocaleDateString('ko-KR', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => refetchKg()}
                        disabled={kgFetching}
                        title="새로고침"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${kgFetching ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {kgLoading ? (
                    <Skeleton className="h-[500px] w-full rounded-lg" />
                  ) : kgError ? (
                    <div className="flex h-[300px] items-center justify-center rounded-lg border bg-destructive/5">
                      <div className="flex flex-col items-center gap-3 text-center">
                        <AlertCircle className="h-8 w-8 text-destructive" />
                        <div>
                          <p className="text-sm font-medium text-destructive">
                            지식 그래프를 불러오지 못했습니다
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {kgError.message}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => refetchKg()}
                          className="mt-1"
                        >
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                          다시 시도
                        </Button>
                      </div>
                    </div>
                  ) : hasData && kgData ? (
                    <div className="space-y-3">
                      <KnowledgeGraphIframe
                        data={kgData}
                        height={700}
                        studentName={selectedStudentName}
                      />
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>엔티티: {kgData.entities.length}개</span>
                        <span>관계: {kgData.triples.length}개</span>
                        {kgData.source_stats?.categories && (
                          <span>카테고리: {Object.keys(kgData.source_stats.categories).join(', ')}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-[300px] items-center justify-center rounded-lg border bg-muted/30">
                      <div className="text-center text-muted-foreground">
                        <p className="text-sm font-medium">저장된 지식 그래프가 없습니다</p>
                        <p className="mt-1 text-xs">
                          Claude Code에서 /text-knowledge-graph 스킬로 생성 후 저장해주세요.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Empty state when no student selected */}
            {!selectedStudentId && (
              <Card>
                <CardContent className="flex h-[400px] items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <p className="text-sm font-medium">학생을 선택해주세요</p>
                    <p className="mt-1 text-xs">
                      학년, 반, 학생을 선택하면 해당 학생의 지식 그래프를 확인할 수 있습니다.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default KnowledgeGraphPage;
