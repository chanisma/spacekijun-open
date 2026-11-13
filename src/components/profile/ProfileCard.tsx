import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Edit, Mail, FileText, Stamp, BookOpen, Tag } from 'lucide-react';
import { Profile } from '@/hooks/useProfile';
import { ResourceTag } from '@/hooks/useResourceTags';
import { AccountsSection } from './AccountsSection';

interface ProfileCardProps {
  profile: Profile;
  onEdit: () => void;
  resourceMeta?: Record<string, any>;
  /** `{ accounts }` — 계정은 resource_accounts 표에서 따로 읽는다(resource.meta 에 없다). */
  accountsMeta?: unknown;
  resourceType?: string;
  tags?: ResourceTag[];
}

export const ProfileCard = ({ profile, onEdit, resourceMeta, accountsMeta, resourceType, tags }: ProfileCardProps) => {
  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'destructive';
      case 'teacher':
        return 'default';
      case 'student':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return '관리자';
      case 'teacher':
        return '교사';
      case 'student':
        return '학생';
      default:
        return role;
    }
  };

  // resource meta에서 담임 정보 추출
  const homeroom = resourceMeta?.grade && resourceMeta?.class_number
    ? `${resourceMeta.grade}학년 ${resourceMeta.class_number}반 담임`
    : null;

  // section에서 담당 과목 추출 (중복 제거)
  const subjects = resourceMeta?.section
    ? [...new Set(
        Object.keys(resourceMeta.section).map(key => key.replace(/\s+\d+-\d+$/, ''))
      )]
    : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">
                {profile.name || profile.nickname || '성명 없음'}
              </h3>
              <Badge variant={getRoleBadgeVariant(profile.role)}>
                {getRoleLabel(profile.role)}
              </Badge>
            </div>
            {homeroom && (
              <p className="text-sm text-muted-foreground mt-0.5">{homeroom}</p>
            )}
          </div>
        </div>
        <Button onClick={onEdit} variant="outline" size="sm">
          <Edit className="h-4 w-4 mr-2" />
          편집
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* 기본 정보 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center space-x-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{profile.email}</span>
          </div>

        </div>

        {/* 담당 과목 (교사만) */}
        {subjects.length > 0 && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">담당 과목</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {subjects.map((subject) => (
                <Badge key={subject} variant="outline" className="text-xs">
                  {subject}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* 태그 */}
        {tags && tags.length > 0 && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">태그</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="text-xs"
                  style={{
                    backgroundColor: tag.color ? `${tag.color}20` : undefined,
                    color: tag.color || undefined,
                    borderColor: tag.color ? `${tag.color}40` : undefined,
                    borderWidth: '1px',
                  }}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* 내 계정 (교사만) */}
        {resourceType !== 'student' && <AccountsSection resourceMeta={accountsMeta} />}

        {/* 서명 & 인장 */}
        <div className="pt-3 border-t">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium">서명</span>
                {profile.signature ? (
                  <div className="w-16 h-10 border border-gray-200 rounded bg-white flex items-center justify-center overflow-hidden">
                    <img src={profile.signature} alt="서명" className="max-w-full max-h-full object-contain" />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">없음</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Stamp className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium">인장</span>
                {profile.stamp ? (
                  <div className="w-10 h-10 border border-gray-200 rounded bg-white flex items-center justify-center overflow-hidden">
                    <img src={profile.stamp} alt="인장" className="max-w-full max-h-full object-contain" />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">없음</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
