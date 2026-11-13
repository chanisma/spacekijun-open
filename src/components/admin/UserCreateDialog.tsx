import React, { useState } from 'react';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { UserPlus, Loader2 } from 'lucide-react';

const userSchema = z.object({
  email: z.string().email('유효한 이메일을 입력해주세요.'),
  password: z.string().min(6, '비밀번호는 최소 6자 이상이어야 합니다.'),
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다.'),
  nickname: z.string().min(2, '닉네임은 최소 2자 이상이어야 합니다.'),
  role: z.enum(['admin', 'teacher'], {
    required_error: '역할을 선택해주세요.',
  }),
});

type UserFormData = z.infer<typeof userSchema>;

interface UserCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const UserCreateDialog: React.FC<UserCreateDialogProps> = ({
  open,
  onOpenChange,
  onSuccess
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      email: '',
      password: '',
      name: '',
      nickname: '',
      role: 'teacher',
    },
  });

  const roleValue = form.watch('role');

  const onSubmit = async (data: UserFormData) => {
    setLoading(true);
    try {
      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: {
          nickname: data.nickname,
        }
      });

      if (authError) {
        toast({
          title: '오류',
          description: authError.message,
          variant: 'destructive',
        });
        return;
      }

      if (!authData.user) {
        toast({
          title: '오류',
          description: '사용자 생성에 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }

      // Create profile record
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: data.email,
          nickname: data.nickname,
          role: data.role,
        });

      if (profileError) {
        console.error('프로필 생성 오류:', profileError);
        toast({
          title: '경고',
          description: '사용자는 생성되었지만 프로필 정보 저장에 실패했습니다.',
          variant: 'destructive',
        });
      }

      // Add user role for admin
      if (data.role === 'admin') {
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: authData.user.id,
            role: 'admin' as const,
          });

        if (roleError) {
          console.error('역할 설정 오류:', roleError);
        }
      }

      // Create teacher resource record (all users are teachers in this system)
      const resourceData = {
        type: 'teacher' as const,
        name: data.name,
        meta: {
          email: data.email,
        }
      };

      const { error: resourceError } = await supabase
        .from('resource')
        .insert([resourceData]);

      if (resourceError) {
        console.error('교사 리소스 생성 오류:', resourceError);
      }


      form.reset();
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('사용자 생성 오류:', error);
      toast({
        title: '오류',
        description: '사용자 생성 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            새 교사 추가
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>이메일</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="user@example.com" 
                      type="email"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>이름</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="홍길동"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>임시 비밀번호</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="최소 6자"
                      type="password"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nickname"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>닉네임</FormLabel>
                  <FormControl>
                    <Input placeholder="사용자 이름" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>역할</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="역할을 선택하세요" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="teacher">교사</SelectItem>
                      <SelectItem value="admin">관리자</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                취소
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                사용자 생성
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
