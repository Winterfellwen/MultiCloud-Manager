import { Card, CardContent } from '@/components/ui/card';

export default function ChatReact() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">AI 对话（React 版）</h1>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            AI 对话 React 版将在 Phase 5.4 实现
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
