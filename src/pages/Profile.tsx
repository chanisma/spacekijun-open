import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { ProfileCard } from '@/components/profile/ProfileCard';
import { ProfileEditDialog } from '@/components/profile/ProfileEditDialog';
import { PersonalDeviceCard } from '@/components/profile/PersonalDeviceCard';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUnifiedAuth } from '@/services/unifiedAuth';
import { useResourceTagAssignments } from '@/hooks/useResourceTags';
import { Skeleton } from '@/components/ui/skeleton';
import { accountsAsMeta, fetchResourceAccounts } from '@/services/resourceAccountsService';

export default function Profile() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading, updating, updateProfile } = useProfile();
  const { user: authUser } = useUnifiedAuth();
  const resourceId = authUser?.primaryResource?.id;
  const { data: tagAssignments } = useResourceTagAssignments(
    resourceId ? [resourceId] : undefined
  );
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const resourceMeta = authUser?.primaryResource?.meta;
  const resourceType = authUser?.primaryResource?.type;

  // «내 계정» — resource.meta 가 아니라 resource_accounts 표(본인·관리자만 읽는다, 2026-10-13).
  const { data: myAccounts } = useQuery({
    queryKey: ['resource-accounts', resourceId],
    queryFn: async () => (await fetchResourceAccounts([resourceId!])).get(resourceId!) ?? null,
    enabled: !!resourceId && resourceType !== 'student',
  });
  const tags = resourceId ? tagAssignments?.get(resourceId) || [] : [];

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (!profile) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">프로필을 불러올 수 없습니다.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <ProfileCard
          profile={profile}
          onEdit={() => setEditDialogOpen(true)}
          resourceMeta={resourceMeta}
          accountsMeta={accountsAsMeta(myAccounts)}
          resourceType={resourceType}
          tags={tags}
        />

        <PersonalDeviceCard />

        <ProfileEditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          profile={profile}
          onSave={updateProfile}
          updating={updating}
        />
      </div>
    </Layout>
  );
}
