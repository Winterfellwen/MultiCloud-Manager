import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-[200px] text-sm">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}