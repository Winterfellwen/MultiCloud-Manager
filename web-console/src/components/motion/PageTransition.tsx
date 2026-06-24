import { motion, useReducedMotion } from 'framer-motion';
import { pageVariants, pageTransition } from '@/lib/motion';

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={reduced ? { duration: 0 } : pageTransition}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
