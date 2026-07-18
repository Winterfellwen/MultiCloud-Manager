import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus } from 'lucide-react';

interface TagEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: Record<string, string>;
  onTagsChange: (tags: Record<string, string>) => void;
  onSave: () => void;
  saving: boolean;
}

export function TagEditorDialog({ open, onOpenChange, tags, onTagsChange, onSave, saving }: TagEditorDialogProps) {
  const { t } = useTranslation();
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const addTag = () => {
    if (!newKey.trim()) {
      toast.error(t('instances.tagKeyRequired', '标签键不能为空'));
      return;
    }
    onTagsChange({ ...tags, [newKey.trim()]: newValue.trim() });
    setNewKey('');
    setNewValue('');
  };

  const removeTag = (key: string) => {
    const updated = { ...tags };
    delete updated[key];
    onTagsChange(updated);
  };

  const updateValue = (key: string, value: string) => {
    onTagsChange({ ...tags, [key]: value });
  };

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={t('instances.editTags', '编辑标签')}
      className="sm:max-w-md"
    >
      <div className="space-y-3">
        {Object.entries(tags).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <Input
              value={key}
              disabled
              className="w-32 text-xs"
            />
            <Input
              value={value}
              onChange={(e) => updateValue(key, e.target.value)}
              className="flex-1 text-xs"
              placeholder={t('instances.tagValue', '标签值')}
            />
            <Button variant="ghost" size="icon" onClick={() => removeTag(key)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={t('instances.tagKey', '标签键')}
            className="w-32 text-xs"
          />
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={t('instances.tagValue', '标签值')}
            className="flex-1 text-xs"
          />
          <Button variant="outline" size="icon" onClick={addTag}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t('common.cancel')}
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? t('common.saving', '保存中...') : t('common.save', '保存')}
        </Button>
      </div>
    </Dialog>
  );
}
