import { Card, CardContent } from '@/components/ui/card';

export default function Instances() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">云资源管理</h1>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            云资源管理页将在 Phase 5.3 实现
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
