import * as React from 'react';
import { motion, useReducedMotion, type Transition } from 'motion/react';
import { cn } from '@/lib/utils';

interface StaggerProps {
  className?: string;
  /** Stagger delay between children, in seconds. Default 0.05 (50ms). */
  stagger?: number;
  /** Initial delay before the first child reveals, in seconds. */
  delay?: number;
  /** Per-child duration, in seconds. Default 0.32. */
  duration?: number;
  /** Vertical offset (in px) each child slides up from. Default 8. */
  y?: number;
  /** If true, animate only when the element scrolls into view. */
  whenInView?: boolean;
  /** When whenInView, the % of the element visible before triggering (0-1). */
  amount?: number;
  children: React.ReactNode;
}

/**
 * Reveals each direct child with a small fade + upward slide, staggered.
 *
 * Two trigger modes:
 *   - Default: animates on mount (after route enter).
 *   - `whenInView`: animates when scrolled into view (uses IntersectionObserver
 *     under the hood). Useful for long pages like LandingPage.
 *
 * Honors `prefers-reduced-motion` — children render immediately, no transform.
 *
 * Usage:
 *   <Stagger className="grid grid-cols-3 gap-4">
 *     <Card>…</Card>
 *     <Card>…</Card>
 *     <Card>…</Card>
 *   </Stagger>
 */
export const Stagger: React.FC<StaggerProps> = ({
  className,
  stagger = 0.05,
  delay = 0,
  duration = 0.32,
  y = 8,
  whenInView = false,
  amount = 0.15,
  children,
}) => {
  const reduce = useReducedMotion();
  const items = React.Children.toArray(children);

  const containerProps = whenInView
    ? { initial: 'hidden', whileInView: 'visible', viewport: { once: true, amount } }
    : { initial: 'hidden', animate: 'visible' };

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
      {...containerProps}
    >
      {items.map((child, i) => (
        <motion.div
          key={i}
          variants={{
            hidden: { opacity: 0, y },
            visible: {
              opacity: 1,
              y: 0,
              transition: {
                duration,
                ease: [0.25, 1, 0.5, 1], // --ease-out-quart
              } as Transition,
            },
          }}
          style={{ minWidth: 0 }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
};
