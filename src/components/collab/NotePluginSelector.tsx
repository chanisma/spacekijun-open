import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Puzzle, X, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePlugins, usePluginInstances } from "@/hooks/usePlugins";

interface NotePluginSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  boardId: string;
  onPluginAttached?: () => void;
  canManagePlugin?: boolean; // 플러그인 관리 권한 (노트 생성자 또는 보드 소유자)
}

export function NotePluginSelector({
  open,
  onOpenChange,
  noteId,
  boardId,
  onPluginAttached,
  canManagePlugin = false,
}: NotePluginSelectorProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: plugins = [], isLoading } = usePlugins();
  const { data: pluginInstances = [] } = usePluginInstances('collab_note', noteId);
  const [attaching, setAttaching] = useState(false);
  const [detaching, setDetaching] = useState<string | null>(null);

  // 활성화된 플러그인만 필터링
  const activePlugins = plugins.filter((plugin) => plugin.is_active);

  // 현재 연결된 플러그인 ID 목록
  const connectedPluginIds = pluginInstances.map(instance => instance.plugin_id);

  const handleAttachPlugin = async (pluginId: string) => {
    if (!user) return;

    // 권한 확인
    if (!canManagePlugin) {
      toast({
        title: "권한 없음",
        description: "노트 작성자나 보드 소유자만 플러그인을 추가할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }

    setAttaching(true);
    try {
      // 플러그인 인스턴스 생성
      const { error: instanceError } = await supabase
        .from("plugin_instances")
        .insert([
          {
            plugin_id: pluginId,
            entity_type: "collab_note",
            entity_id: noteId,
            created_by: user.id,
            data: {},
            settings: {},
          },
        ]);

      if (instanceError) throw instanceError;

      toast({
        title: "플러그인 추가 완료",
        description: "노트에 플러그인이 추가되었습니다.",
      });

      onPluginAttached?.();
    } catch (error: any) {
      console.error("플러그인 추가 오류:", error);
      toast({
        title: "플러그인 추가 실패",
        description: error.message || "플러그인을 추가하는 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setAttaching(false);
    }
  };

  const handleDetachPlugin = async (instanceId: string, pluginName: string) => {
    // 권한 확인
    if (!canManagePlugin) {
      toast({
        title: "권한 없음",
        description: "노트 작성자나 보드 소유자만 플러그인을 제거할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }

    if (!confirm(`"${pluginName}" 플러그인을 제거하시겠습니까?`)) {
      return;
    }

    setDetaching(instanceId);
    try {
      // 플러그인 인스턴스 삭제
      const { error: deleteError } = await supabase
        .from("plugin_instances")
        .delete()
        .eq("id", instanceId);

      if (deleteError) throw deleteError;

      toast({
        title: "플러그인 제거 완료",
        description: "노트에서 플러그인이 제거되었습니다.",
      });

      onPluginAttached?.();
    } catch (error: any) {
      console.error("플러그인 제거 오류:", error);
      toast({
        title: "플러그인 제거 실패",
        description: error.message || "플러그인을 제거하는 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setDetaching(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>플러그인 선택</DialogTitle>
          <DialogDescription>
            이 노트에 연결할 플러그인을 선택하세요
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activePlugins.length === 0 ? (
            <div className="text-center py-8">
              <Puzzle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                사용 가능한 플러그인이 없습니다.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activePlugins.map((plugin) => {
                const isConnected = connectedPluginIds.includes(plugin.id);
                const connectedInstance = pluginInstances.find(i => i.plugin_id === plugin.id);
                return (
                  <div
                    key={plugin.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      isConnected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        {plugin.icon ? (
                          <span className="text-xl">{plugin.icon}</span>
                        ) : (
                          <Puzzle className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm">{plugin.name}</h4>
                          {isConnected && (
                            <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          )}
                        </div>
                        {plugin.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {plugin.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isConnected ? (
                        <Button
                          size="sm"
                          onClick={() => handleAttachPlugin(plugin.id)}
                          disabled={attaching || !!detaching || !canManagePlugin}
                          title={!canManagePlugin ? "노트 작성자나 보드 소유자만 플러그인을 추가할 수 있습니다" : undefined}
                        >
                          {attaching && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                          추가
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => connectedInstance && handleDetachPlugin(connectedInstance.id, plugin.name)}
                          disabled={detaching === connectedInstance?.id || !canManagePlugin}
                          title={!canManagePlugin ? "노트 작성자나 보드 소유자만 플러그인을 제거할 수 있습니다" : "플러그인 제거"}
                          className="gap-1.5"
                        >
                          {detaching === connectedInstance?.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {detaching !== connectedInstance?.id && <X className="h-3.5 w-3.5" />}
                          제거
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
