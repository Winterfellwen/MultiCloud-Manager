import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <p className="text-lg text-muted-foreground">页面不存在</p>
        <Button asChild>
          <Link to="/dashboard">返回首页</Link>
        </Button>
      </div>
    </div>
  );
}
