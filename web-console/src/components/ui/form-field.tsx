import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { HelpCircle } from 'lucide-react';

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  tooltip?: string;
  children: React.ReactNode;
  htmlFor?: string;
}

export function FormField({
  label,
  error,
  required = false,
  tooltip,
  children,
  htmlFor,
}: FormFieldProps) {
  const generatedId = useId();
  const id = htmlFor || generatedId;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className={error ? 'text-destructive' : ''}>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
        {tooltip && (
          <span title={tooltip}>
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </span>
        )}
      </div>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}