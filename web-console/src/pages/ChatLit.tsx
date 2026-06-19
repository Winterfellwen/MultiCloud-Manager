import { Card, CardContent } from '@/components/ui/card';

export default function ChatLit() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">AI 对话（Lit 版）</h1>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            AI 对话 Lit 版将在 Phase 5.5 实现
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
