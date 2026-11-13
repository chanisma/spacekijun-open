import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Plus, Upload, Download, Edit, Trash2, Users } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { withoutPersonalPhone } from '@/utils/resourceMetaPrivacy';

// Updated interfaces for new schema
interface SectionAssignment {
  resource_id: string;
  resource_name: string;
  resource_type: string;
  sections: string[];
  meta: Record<string, any>;
}

interface Section {
  id: string;
  name: string;
  subject?: string;
  is_combined?: boolean;
  meta: {
    grade?: string;
    class?: string;
    weekday_time?: string;
  };
}

interface Resource {
  id: string;
  name: string;
  type: string;
  meta: {
    section?: string[];
    grade?: string;
    class?: string;
    email?: string;
    homeroom?: string;
  };
}

export function SectionMemberManagement() {
  const [assignments, setAssignments] = useState<SectionAssignment[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBulkImportDialog, setShowBulkImportDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedResourceType, setSelectedResourceType] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    resource_id: '',
    section_names: [] as string[],
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [sectionsResult, resourcesResult] = await Promise.all([
        supabase.from('section').select('*'),
        supabase.from('resource').select('*')
      ]);

      if (sectionsResult.error) throw sectionsResult.error;
      if (resourcesResult.error) throw resourcesResult.error;

      setSections(sectionsResult.data as Section[] || []);
      setResources(resourcesResult.data as Resource[] || []);
      
      // Transform resources into assignments view
      const resourceAssignments: SectionAssignment[] = (resourcesResult.data || [])
        .filter(resource => {
          const meta = resource.meta as any;
          return meta?.section && Array.isArray(meta.section) && meta.section.length > 0;
        })
        .map(resource => {
          const meta = resource.meta as any;
          return {
            resource_id: resource.id,
            resource_name: resource.name,
            resource_type: resource.type,
            sections: meta.section || [],
            meta: meta || {}
          };
        });
      
      setAssignments(resourceAssignments);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "오류",
        description: "데이터를 불러오는 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addSectionToResource = async (resourceId: string, sectionNames: string[]) => {
    try {
      // Get current resource
      const { data: resource, error: fetchError } = await supabase
        .from('resource')
        .select('meta')
        .eq('id', resourceId)
        .single();

      if (fetchError) throw fetchError;

      // Merge new sections with existing ones
      const meta = resource.meta as any;
      const currentSections = meta?.section || [];
      const updatedSections = [...new Set([...currentSections, ...sectionNames])];

      const { error } = await supabase
        .from('resource')
        .update({
          meta: {
            ...withoutPersonalPhone(meta),
            section: updatedSections
          } as any
        })
        .eq('id', resourceId);

      if (error) throw error;


      fetchData();
    } catch (error) {
      console.error('Error adding sections to resource:', error);
      toast({
        title: "오류",
        description: "섹션 배정 추가에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const removeSectionFromResource = async (resourceId: string, sectionName: string) => {
    try {
      // Get current resource
      const { data: resource, error: fetchError } = await supabase
        .from('resource')
        .select('meta')
        .eq('id', resourceId)
        .single();

      if (fetchError) throw fetchError;

      // Remove section from array
      const meta = resource.meta as any;
      const currentSections = meta?.section || [];
      const updatedSections = currentSections.filter((s: string) => s !== sectionName);

      const { error } = await supabase
        .from('resource')
        .update({
          meta: {
            ...withoutPersonalPhone(meta),
            section: updatedSections
          } as any
        })
        .eq('id', resourceId);

      if (error) throw error;


      fetchData();
    } catch (error) {
      console.error('Error removing section from resource:', error);
      toast({
        title: "오류",
        description: "섹션 배정 제거에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.resource_id || formData.section_names.length === 0) {
      toast({
        title: "오류",
        description: "리소스와 섹션을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    await addSectionToResource(formData.resource_id, formData.section_names);
    setFormData({ resource_id: '', section_names: [] });
    setShowCreateDialog(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: '오류',
        description: 'CSV 파일만 업로드할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast({
          title: '오류',
          description: '최소 헤더와 데이터 1줄이 필요합니다.',
          variant: 'destructive',
        });
        return;
      }

      // Expected format: 리소스ID|섹션명1,섹션명2,섹션명3
      for (let i = 1; i < lines.length; i++) {
        const [resourceId, sectionsStr] = lines[i].split('|');
        if (resourceId && sectionsStr) {
          const sectionNames = sectionsStr.split(',').map(s => s.trim()).filter(s => s);
          await addSectionToResource(resourceId.trim(), sectionNames);
        }
      }

      toast({
        title: '성공',
        description: `${lines.length - 1}개의 배정이 처리되었습니다.`,
      });

      setShowBulkImportDialog(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('파일 처리 중 오류:', error);
      toast({
        title: '오류',
        description: '파일을 처리하는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const downloadSampleCSV = () => {
    const sampleData = [
      '리소스ID|섹션명',
      'resource-uuid-1|수학1,영어1',
      'resource-uuid-2|국어1',
      'resource-uuid-3|과학1,사회1'
    ].join('\n');

    const blob = new Blob([sampleData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'section_assignments_sample.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter assignments based on selected section and resource type
  const filteredAssignments = assignments.filter(assignment => {
    const matchesSection = selectedSection === 'all' || assignment.sections.includes(selectedSection);
    const matchesType = selectedResourceType === 'all' || assignment.resource_type === selectedResourceType;
    return matchesSection && matchesType;
  });

  // Get resources available for a specific section
  const getResourcesForSection = (sectionName: string) => {
    return resources.filter(resource => 
      resource.meta?.section?.includes(sectionName)
    );
  };

  // Get section statistics
  const getSectionStats = () => {
    return sections.map(section => {
      const assignedResources = getResourcesForSection(section.name);
      const students = assignedResources.filter(r => r.type === 'student').length;
      const teachers = assignedResources.filter(r => r.type === 'teacher').length;
      const classrooms = assignedResources.filter(r => r.type === 'room').length;
      
      return {
        section: section.name,
        students,
        teachers,
        classrooms,
        total: students + teachers + classrooms
      };
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>섹션 멤버 관리 (새 스키마)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div>데이터를 불러오는 중...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>섹션 멤버 관리 (새 스키마)</span>
            </CardTitle>
            <div className="flex space-x-2">
              <Dialog open={showBulkImportDialog} onOpenChange={setShowBulkImportDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    일괄 배정
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>CSV 파일로 섹션 일괄 배정</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      <p>CSV 파일 형식: 리소스ID|섹션명1,섹션명2</p>
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" onClick={downloadSampleCSV}>
                        <Download className="h-4 w-4 mr-2" />
                        샘플 파일 다운로드
                      </Button>
                    </div>
                    <div>
                      <Label htmlFor="csv-file">CSV 파일 선택</Label>
                      <input
                        ref={fileInputRef}
                        id="csv-file"
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        disabled={uploading}
                        className="block w-full mt-1"
                      />
                    </div>
                    {uploading && <div>파일을 처리하고 있습니다...</div>}
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    섹션 배정
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>새 섹션 배정</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label>리소스 선택</Label>
                      <Select 
                        value={formData.resource_id} 
                        onValueChange={(value) => setFormData(prev => ({ ...prev, resource_id: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="리소스를 선택하세요" />
                        </SelectTrigger>
                        <SelectContent>
                          {resources.map(resource => (
                            <SelectItem key={resource.id} value={resource.id}>
                              {resource.name} ({resource.type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>섹션 선택 (다중 선택)</Label>
                      <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border p-2 rounded">
                        {sections.map(section => (
                          <label key={section.id} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={formData.section_names.includes(section.name)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData(prev => ({
                                    ...prev,
                                    section_names: [...prev.section_names, section.name]
                                  }));
                                } else {
                                  setFormData(prev => ({
                                    ...prev,
                                    section_names: prev.section_names.filter(name => name !== section.name)
                                  }));
                                }
                              }}
                            />
                            <span className="text-sm">{section.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <DialogFooter className="flex justify-end space-x-2">
                      <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                        취소
                      </Button>
                      <Button type="submit">배정</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex space-x-4">
              <Select value={selectedSection} onValueChange={setSelectedSection}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 섹션</SelectItem>
                  {sections.map(section => (
                    <SelectItem key={section.id} value={section.name}>{section.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={selectedResourceType} onValueChange={setSelectedResourceType}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 타입</SelectItem>
                  <SelectItem value="student">학생</SelectItem>
                  <SelectItem value="teacher">교사</SelectItem>
                  <SelectItem value="room">교실</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assignments Table */}
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>리소스</TableHead>
                    <TableHead>타입</TableHead>
                    <TableHead>배정된 섹션</TableHead>
                    <TableHead>추가 정보</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        배정된 섹션이 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAssignments.map((assignment) => (
                      <TableRow key={assignment.resource_id}>
                        <TableCell>
                          <div className="font-medium">{assignment.resource_name}</div>
                          <div className="text-sm text-muted-foreground font-mono">
                            {assignment.resource_id}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                            {assignment.resource_type === 'student' ? '학생' : 
                             assignment.resource_type === 'teacher' ? '교사' : '교실'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {assignment.sections.map((sectionName) => (
                              <div key={sectionName} className="flex items-center bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs">
                                {sectionName}
                                <button
                                  onClick={() => removeSectionFromResource(assignment.resource_id, sectionName)}
                                  className="ml-1 text-blue-600 hover:text-blue-800"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {assignment.resource_type === 'student' && (
                            <div className="text-xs">
                              {assignment.meta.grade}학년 {assignment.meta.class}반
                            </div>
                          )}
                          {assignment.resource_type === 'teacher' && assignment.meta.homeroom && (
                            <div className="text-xs">
                              담임: {assignment.meta.homeroom}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setFormData({
                                resource_id: assignment.resource_id,
                                section_names: assignment.sections
                              });
                              setShowCreateDialog(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>섹션별 배정 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {getSectionStats().map((stat) => (
              <Card key={stat.section}>
                <CardContent className="p-4">
                  <div className="text-lg font-semibold">{stat.section}</div>
                  <div className="text-sm text-muted-foreground">
                    학생: {stat.students} | 교사: {stat.teachers} | 교실: {stat.classrooms}
                  </div>
                  <div className="text-2xl font-bold mt-2">{stat.total}</div>
                  <div className="text-sm text-muted-foreground">총 배정</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
