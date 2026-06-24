import { motion, useReducedMotion } from 'framer-motion';

interface StaggerListProps {
  children: React.ReactNode;
  className?: string;
  /** 错开间隔（秒），默认 0.04 */
  staggerSeconds?: number;
}

/**
 * 包裹列表的错开入场容器。子元素需使用 motion 组件并设置 variants={fadeUp}。
 */
export function StaggerList({ children, className, staggerSeconds = 0.04 }: StaggerListProps) {
  const reduced = useReducedMotion();
  const staggerVariants = reduced
    ? undefined
    : {
        animate: {
          transition: { staggerChildren: staggerSeconds },
        },
      };

  return (
    <motion.div
      className={className}
      initial={reduced ? false : 'initial'}
      animate="animate"
      variants={staggerVariants}
    >
      {children}
    </motion.div>
  );
}
