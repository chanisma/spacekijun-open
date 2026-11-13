import React, { useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Layout } from '@/components/layout/Layout';
import { useNotifications, useNotificationMutations } from '@/hooks/useNotifications';
import { NotificationHeader } from '@/components/notifications/NotificationHeader';
import { NotificationCreateDialog } from '@/components/notifications/NotificationCreateDialog';
import { NotificationList } from '@/components/notifications/NotificationList';

const Notifications = () => {
  const { user } = useAuth();

  // TanStack Query hooks
  const { data: notifications = [], isLoading: loading, error, refetch } = useNotifications();
  const { markAsRead, markAllAsRead, deleteNotification } = useNotificationMutations();

  // Local UI state
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Handle read status mutation
  const handleMarkAsRead = (notificationId: string) => {
    markAsRead.mutate(notificationId);
  };

  // Handle delete mutation
  const handleDelete = (notificationId: string) => {
    deleteNotification.mutate(notificationId);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <NotificationHeader
          onCreateClick={() => setShowCreateDialog(true)}
        />

        <NotificationCreateDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
        />

        <NotificationList
          notifications={notifications}
          loading={loading}
          error={error}
          onMarkAsRead={handleMarkAsRead}
          onDelete={handleDelete}
          onMarkAllAsRead={() => markAllAsRead.mutate()}
          markAsReadLoading={markAsRead.isPending}
          markAllAsReadLoading={markAllAsRead.isPending}
          deleteLoading={deleteNotification.isPending}
        />
      </div>
    </Layout>
  );
};

export default Notifications;