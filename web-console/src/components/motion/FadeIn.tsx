import { motion, useReducedMotion } from 'framer-motion';
import { fadeUp, baseTransition } from '@/lib/motion';

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export function FadeIn({ children, delay = 0, className }: FadeInProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={reduced ? { duration: 0 } : { ...baseTransition, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
