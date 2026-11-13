import { useState } from "react";
import { Search, CheckSquare, Calendar, CalendarDays, X, Link as LinkIcon } from "lucide-react";
import { DialogFooter,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useLinkItem } from "@/hooks/useCollabNotes";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { LinkedItem } from "@/types/collabCardTypes";

interface LinkTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  boardId: string;
  existingLinks?: LinkedItem[];
}

interface EventItem {
  id: string;
  name: string;
  status: string;
  manager_id: string;
  meta?: any;
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  event_id: string;
  event?: {
    name: string;
  };
}

interface ScheduleItem {
  id: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  meta?: any;
}

export function LinkTaskDialog({
  open,
  onOpenChange,
  noteId,
  boardId,
  existingLinks = [],
}: LinkTaskDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { mutate: linkItem, isPending } = useLinkItem();
  const { toast } = useToast();

  // Fetch events
  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["events-for-link"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event")
        .select("id, name, status, manager_id, meta")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as EventItem[];
    },
    enabled: open,
  });

  // Fetch tasks
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks-for-link"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task")
        .select(`
          id,
          title,
          status,
          event_id,
          event:event_id(name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as TaskItem[];
    },
    enabled: open,
  });

  // Fetch schedules
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ["schedules-for-link"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting")
        .select("id, kind, starts_at, ends_at, meta")
        .eq("kind", "schedule")
        .order("starts_at", { ascending: false });

      if (error) throw error;
      return data as ScheduleItem[];
    },
    enabled: open,
  });

  const handleLinkItem = (item: LinkedItem) => {
    linkItem(
      {
        noteId,
        item,
      },
      {
        onSuccess: () => {
          const typeLabel = item.type === "event" ? "이벤트" : item.type === "task" ? "업무" : "스케줄";
          toast({
            title: "연결 완료",
            description: `${typeLabel}이(가) 노트에 연결되었습니다.`,
          });
          onOpenChange(false);
          setSearchQuery("");
        },
        onError: (error) => {
          toast({
            title: "연결 실패",
            description: error.message || "연결하는 중 오류가 발생했습니다.",
            variant: "destructive",
          });
        },
      }
    );
  };

  // Filter events based on search query
  const filteredWorks = events.filter((event) =>
    event.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter tasks based on search query
  const filteredTasks = tasks.filter((task) =>
    task.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter schedules based on search query
  const filteredSchedules = schedules.filter((schedule) => {
    const title = schedule.meta?.title || "";
    return title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Check if item is already linked
  const isLinked = (itemId: string, itemType: "event" | "task" | "schedule") => {
    return existingLinks.some((link) => link.id === itemId && link.type === itemType);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-700 border-green-500/20";
      case "completed":
        return "bg-blue-500/10 text-blue-700 border-blue-500/20";
      case "cancelled":
        return "bg-red-500/10 text-red-700 border-red-500/20";
      case "pending":
        return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
      default:
        return "bg-gray-500/10 text-gray-700 border-gray-500/20";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return "진행중";
      case "completed":
        return "완료";
      case "cancelled":
        return "취소";
      case "pending":
        return "대기";
      default:
        return status;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            업무/이벤트/스케줄 연결
          </DialogTitle>
          <DialogDescription>
            노트에 연결할 이벤트, 업무 또는 스케줄을 선택하세요
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 flex-shrink-0">
          <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          </div>
        </div>

        <Tabs defaultValue="events" className="flex-1 flex flex-col min-h-0 px-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="events">
              <Calendar className="h-4 w-4 mr-2" />
              이벤트 ({filteredWorks.length})
            </TabsTrigger>
            <TabsTrigger value="tasks">
              <CheckSquare className="h-4 w-4 mr-2" />
              업무 ({filteredTasks.length})
            </TabsTrigger>
            <TabsTrigger value="schedules">
              <CalendarDays className="h-4 w-4 mr-2" />
              스케줄 ({filteredSchedules.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="flex-1 overflow-y-auto mt-4 space-y-2">
            {eventsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : filteredWorks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchQuery ? "검색 결과가 없습니다" : "이벤트가 없습니다"}
              </div>
            ) : (
              filteredWorks.map((event) => {
                const linked = isLinked(event.id, "event");
                return (
                  <div
                    key={event.id}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      linked
                        ? "border-blue-200 bg-blue-50/50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{event.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className={`text-xs ${getStatusBadgeColor(event.status)}`}
                          >
                            {getStatusLabel(event.status)}
                          </Badge>
                          {event.meta?.department && (
                            <span className="text-xs text-gray-500">
                              {event.meta.department}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() =>
                          handleLinkItem({
                            type: "event",
                            id: event.id,
                            name: event.name,
                            status: event.status,
                            linked_at: new Date().toISOString(),
                          })
                        }
                        disabled={linked || isPending}
                        variant={linked ? "outline" : "default"}
                      >
                        {linked ? "연결됨" : "연결"}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="tasks" className="flex-1 overflow-y-auto mt-4 space-y-2">
            {tasksLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchQuery ? "검색 결과가 없습니다" : "업무가 없습니다"}
              </div>
            ) : (
              filteredTasks.map((task) => {
                const linked = isLinked(task.id, "task");
                return (
                  <div
                    key={task.id}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      linked
                        ? "border-blue-200 bg-blue-50/50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{task.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className={`text-xs ${getStatusBadgeColor(task.status)}`}
                          >
                            {getStatusLabel(task.status)}
                          </Badge>
                          {task.event?.name && (
                            <span className="text-xs text-gray-500 truncate">
                              {task.event.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() =>
                          handleLinkItem({
                            type: "task",
                            id: task.id,
                            name: task.title,
                            status: task.status,
                            linked_at: new Date().toISOString(),
                          })
                        }
                        disabled={linked || isPending}
                        variant={linked ? "outline" : "default"}
                      >
                        {linked ? "연결됨" : "연결"}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="schedules" className="flex-1 overflow-y-auto mt-4 space-y-2">
            {schedulesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : filteredSchedules.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchQuery ? "검색 결과가 없습니다" : "스케줄이 없습니다"}
              </div>
            ) : (
              filteredSchedules.map((schedule) => {
                const linked = isLinked(schedule.id, "schedule");
                const title = schedule.meta?.title || "제목 없음";
                const startDate = new Date(schedule.starts_at).toLocaleDateString('ko-KR', {
                  month: 'long',
                  day: 'numeric'
                });
                return (
                  <div
                    key={schedule.id}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      linked
                        ? "border-blue-200 bg-blue-50/50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500">
                            {startDate}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() =>
                          handleLinkItem({
                            type: "schedule",
                            id: schedule.id,
                            name: title,
                            linked_at: new Date().toISOString(),
                          })
                        }
                        disabled={linked || isPending}
                        variant={linked ? "outline" : "default"}
                      >
                        {linked ? "연결됨" : "연결"}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex justify-end pt-4 pb-6 px-6 border-t flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
