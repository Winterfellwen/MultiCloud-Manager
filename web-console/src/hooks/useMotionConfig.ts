import { useReducedMotion } from 'framer-motion';
import { EASE, DURATION, type FadeUpVariants } from '../lib/motion';

/**
 * 集中提供动画偏好的 hook。
 * 当用户启用了 prefers-reduced-motion 时，duration 退化为 0，
 * 缓动也改为最朴素的 linear，避免前庭功能敏感人群不适。
 */
export function useMotionConfig() {
  const reduced = useReducedMotion();
  return {
    reduced: !!reduced,
    duration: reduced ? 0 : DURATION.base,
    pageDuration: reduced ? 0 : DURATION.page,
    fastDuration: reduced ? 0 : DURATION.fast,
    ease: reduced ? ('linear' as const) : EASE.out,
    pageEase: reduced ? ('linear' as const) : EASE.out,
  };
}

/**
 * 根据 reduced 状态返回 fadeUp 变体（带或不带位移/透明度动画）。
 */
export function useFadeUpVariants(): FadeUpVariants | undefined {
  const reduced = useReducedMotion();
  if (reduced) return undefined;
  return {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
  };
}
