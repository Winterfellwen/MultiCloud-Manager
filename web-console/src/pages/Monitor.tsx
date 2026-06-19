import { Card, CardContent } from '@/components/ui/card';

export default function Monitor() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">监控告警</h1>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            监控告警页将在 Phase 5.3 实现
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
