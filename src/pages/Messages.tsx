import { Layout } from "@/components/layout/Layout";
import { MessageThreadList } from "@/components/messages/MessageThreadList";
import { MessageView } from "@/components/messages/MessageView";
import { useState } from "react";

const Messages = () => {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  return (
    <Layout>
      <div className="flex h-[calc(100vh-4rem)] gap-4">
        <div className="w-1/3">
          <MessageThreadList 
            onSelectThread={setSelectedThreadId} 
            selectedThreadId={selectedThreadId}
          />
        </div>
        <div className="flex-1">
          <MessageView threadId={selectedThreadId} />
        </div>
      </div>
    </Layout>
  );
};

export default Messages;