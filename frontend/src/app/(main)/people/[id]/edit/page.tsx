/**
 * @project AncestorTree
 * @file src/app/(main)/people/[id]/edit/page.tsx
 * @description Person edit page
 * @version 1.0.0
 * @updated 2026-02-24
 */

'use client';

import { use } from 'react';
import { usePerson, useUpdatePerson } from '@/hooks/use-people';
import { PersonForm } from '@/components/people/person-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth/auth-provider';
import type { PersonFormData } from '@/lib/validations/person';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditPersonPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isEditor, isLoading: authLoading } = useAuth();
  const { data: person, isLoading, error } = usePerson(id);
  const updateMutation = useUpdatePerson();

  const handleSubmit = async (data: PersonFormData) => {
    if (!user || !isEditor) {
      toast.error('Bạn cần đăng nhập với quyền admin hoặc editor để chỉnh sửa');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id,
        input: { ...data, birth_year: data.birth_year ?? null, death_year: data.death_year ?? null } as typeof data,
      });
      toast.success('Đã cập nhật thành công');
      router.push(`/people/${id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi cập nhật';
      toast.error(msg);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Skeleton className="h-8 w-48 mb-6" />
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user || !isEditor) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Card className="border-orange-200">
          <CardContent className="py-12 text-center">
            <Lock className="h-10 w-10 text-orange-400 mx-auto mb-4" />
            <p className="text-orange-700 font-medium mb-2">Cần quyền chỉnh sửa</p>
            <p className="text-muted-foreground text-sm mb-4">
              {!user ? 'Vui lòng đăng nhập để chỉnh sửa thông tin.' : 'Tài khoản của bạn chưa có quyền admin hoặc editor.'}
            </p>
            <div className="flex gap-2 justify-center">
              {!user && (
                <Button asChild>
                  <Link href={`/login?redirect=/people/${id}/edit`}>Đăng nhập</Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href={`/people/${id}`}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Quay lại
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Card className="border-destructive">
          <CardContent className="py-12 text-center">
            <p className="text-destructive mb-4">
              {error ? `Lỗi: ${error.message}` : 'Không tìm thấy thông tin'}
            </p>
            <Button asChild variant="outline">
              <Link href="/people">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Quay lại
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/people/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Quay lại
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Chỉnh sửa: {person.display_name}</h1>
      </div>

      <PersonForm 
        person={person} 
        onSubmit={handleSubmit} 
        isLoading={updateMutation.isPending} 
      />
    </div>
  );
}
