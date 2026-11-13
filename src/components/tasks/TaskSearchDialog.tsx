// ========================================
// Task Search Dialog Component
// Global search dialog for tasks and works
// ========================================

import { useState, useEffect } from 'react';
import { useTaskSearchJsonb, usePopularKeywordsJsonb } from '@/hooks/useTasksJsonb';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { SearchResult } from '@/types/tasks';
import { Search, Calendar, CheckCircle, Tag, User, FileText } from 'lucide-react';
import { getTaskStatusLabel, getStatusBadgeVariant } from '@/lib/taskUtils';

interface TaskSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResultSelect?: (result: SearchResult) => void;
  initialQuery?: string;
}

export function TaskSearchDialog({
  open,
  onOpenChange,
  onResultSelect,
  initialQuery = ''
}: TaskSearchDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  
  const searchMutation = useTaskSearchJsonb();
  const { data: popularKeywords } = usePopularKeywordsJsonb();

  // Trigger search when query changes
  const [searchResults, setSearchResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setIsLoading(true);
    try {
      const results = await searchMutation.mutateAsync({ query: searchQuery });
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger search when query changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.trim()) {
        handleSearch(query);
      } else {
        setSearchResults(null);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleKeywordToggle = (keyword: string) => {
    setSelectedKeywords(prev => 
      prev.includes(keyword) 
        ? prev.filter(k => k !== keyword)
        : [...prev, keyword]
    );
    
    // Add keyword to search query
    if (!selectedKeywords.includes(keyword)) {
      setQuery(prev => prev ? `${prev} ${keyword}` : keyword);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    onResultSelect?.(result);
    onOpenChange(false);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-2xl md:max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center text-sm sm:text-base md:text-lg">
            <Search className="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            할 일 검색
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4">
          <div className="relative">
            <Search className="absolute left-2 sm:left-3 top-2.5 sm:top-3 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
            <Input
              placeholder="업무명, 할 일명, 담당자명, 키워드로 검색..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 sm:pl-10 h-9 sm:h-10 text-sm"
            />
          </div>
          
          {/* Popular Keywords */}
          {popularKeywords && popularKeywords.length > 0 && (
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm font-medium">인기 키워드</Label>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {popularKeywords.slice(0, 10).map((keyword: any) => (
                  <Badge
                    key={keyword.keyword || keyword}
                    variant={selectedKeywords.includes(keyword.keyword || keyword) ? "default" : "outline"}
                    className="cursor-pointer hover:bg-accent text-xs"
                    onClick={() => handleKeywordToggle(keyword.keyword || keyword)}
                  >
                    <Tag className="mr-0.5 sm:mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    {keyword.keyword || keyword}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          <ScrollArea className="h-[300px] sm:h-[400px]">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 sm:h-24 w-full" />
                ))}
              </div>
            ) : searchResults && searchResults.length > 0 ? (
              <div className="space-y-2">
                {searchResults.map(result => (
                  <Card
                    key={`${result.type}-${result.id}`}
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => handleResultClick(result)}
                  >
                    <CardContent className="p-3 sm:p-4">
                      <div className="space-y-1.5 sm:space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center space-x-1.5 sm:space-x-2">
                            {result.type === 'event' ? (
                              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600" />
                            ) : (
                              <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-600" />
                            )}
                            <Badge variant={result.type === 'event' ? 'default' : 'secondary'} className="text-xs">
                              {result.type === 'event' ? '업무' : '할 일'}
                            </Badge>
                          </div>
                          <Badge variant={getStatusBadgeVariant(result.status)} className="text-xs">
                            {getTaskStatusLabel(result.status)}
                          </Badge>
                        </div>

                        <h4 className="font-medium text-sm sm:text-base">{result.title}</h4>

                        {result.description && (
                          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                            {result.description}
                          </p>
                        )}
                        
                        {/* Keywords */}
                        {result.keywords && result.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {result.keywords.slice(0, 5).map((keyword, index) => (
                              <Badge
                                key={index}
                                variant={selectedKeywords.includes(keyword) ? "default" : "outline"}
                                className="text-[10px] sm:text-xs"
                              >
                                <Tag className="mr-0.5 sm:mr-1 h-2 w-2" />
                                {keyword}
                              </Badge>
                            ))}
                            {result.keywords.length > 5 && (
                              <Badge variant="outline" className="text-[10px] sm:text-xs">
                                +{result.keywords.length - 5}
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Context Information */}
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-muted-foreground">
                          {result.context.manager_name && (
                            <div className="flex items-center">
                              <User className="mr-0.5 sm:mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
                              관리자: {result.context.manager_name}
                            </div>
                          )}
                          {result.context.assigned_name && (
                            <div className="flex items-center">
                              <User className="mr-0.5 sm:mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
                              담당자: {result.context.assigned_name}
                            </div>
                          )}
                          {result.context.event_name && (
                            <div className="flex items-center">
                              <FileText className="mr-0.5 sm:mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
                              업무: {result.context.event_name}
                            </div>
                          )}
                          {result.context.total_tasks && (
                            <div className="flex items-center">
                              <CheckCircle className="mr-0.5 sm:mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
                              할 일: {result.context.completed_tasks}/{result.context.total_tasks}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : query.length >= 2 ? (
              <div className="text-center py-6 sm:py-8 text-muted-foreground">
                <Search className="mx-auto h-10 w-10 sm:h-12 sm:w-12 mb-3 sm:mb-4 opacity-50" />
                <p className="text-sm sm:text-base">검색 결과가 없습니다</p>
                <p className="text-xs sm:text-sm mt-1">다른 키워드로 검색해보세요</p>
              </div>
            ) : (
              <div className="text-center py-6 sm:py-8 text-muted-foreground">
                <Search className="mx-auto h-10 w-10 sm:h-12 sm:w-12 mb-3 sm:mb-4 opacity-50" />
                <p className="text-sm sm:text-base">검색어를 입력하세요</p>
                <p className="text-xs sm:text-sm mt-1">최소 2글자 이상 입력해주세요</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}