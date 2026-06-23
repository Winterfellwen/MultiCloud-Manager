import type { Variants } from 'framer-motion';

/** 缓动曲线（cubic-bezier 数组） */
export const EASE = {
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  outExpo: [0.19, 1, 0.22, 1] as [number, number, number, number],
  inOut: [0.4, 0, 0.2, 1] as [number, number, number, number],
} as const;

/** 动画时长（秒） */
export const DURATION = {
  fast: 0.15,
  base: 0.2,
  page: 0.25,
} as const;

/** 基础 fade-up 变体：透明度 + translateY 6px */
export const fadeUp: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

/** 缩放淡入变体：scale 0.95 → 1 */
export const fadeScale: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
};

/** 页面转场变体：translateY 10px + 透明度 */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

/** 列表错开变体：子元素间隔 40ms 依次入场 */
export const stagger: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.04,
    },
  },
};

/** 标准 transition：基础时长 + ease-out */
export const baseTransition = {
  duration: DURATION.base,
  ease: EASE.out,
} as const;

/** 页面 transition：稍长时长 + ease-out */
export const pageTransition = {
  duration: DURATION.page,
  ease: EASE.out,
} as const;
