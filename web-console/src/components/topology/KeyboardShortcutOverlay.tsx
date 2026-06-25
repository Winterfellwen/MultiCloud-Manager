import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['←', '→', '↑', '↓'], description: 'Navigate between nodes' },
  { keys: ['Enter'], description: 'Drill into node / Open modal' },
  { keys: ['Esc'], description: 'Go back one level' },
  { keys: ['?'], description: 'Toggle this overlay' },
];

export function KeyboardShortcutOverlay({ open, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">{t('topology.shortcuts.title', 'Keyboard Shortcuts')}</h3>
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-3">
                {SHORTCUTS.map((s) => (
                  <div key={s.description} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{s.description}</span>
                    <div className="flex gap-1">
                      {s.keys.map((k) => (
                        <kbd key={k} className="px-2 py-0.5 text-xs font-mono bg-gray-100 border rounded">
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
