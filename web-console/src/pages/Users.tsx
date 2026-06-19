import { Card, CardContent } from '@/components/ui/card';

export default function Users() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">用户管理</h1>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            用户管理页将在 Phase 5.6 实现
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
