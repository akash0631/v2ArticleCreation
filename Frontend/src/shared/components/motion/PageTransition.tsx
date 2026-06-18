import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface PageTransitionProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * Fade + small upward slide on route enter / exit.
 *
 * - Keys off `location.pathname` so each route gets its own enter animation.
 * - Honors `prefers-reduced-motion` — no transform / opacity work in that case.
 * - Wraps in AnimatePresence with `mode="wait"` so the outgoing page completes
 *   before the incoming one starts; prevents simultaneous double-paint.
 *
 * Keep at the page-shell level (MainLayout). Do NOT nest inside individual
 * pages — the AnimatePresence parent must own the route key.
 */
export const PageTransition: React.FC<PageTransitionProps> = ({ className, children }) => {
  const location = useLocation();
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        className={cn(className)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{
          duration: 0.22,
          ease: [0.25, 1, 0.5, 1], // matches --ease-out-quart
        }}
        style={{ height: '100%', minHeight: 0 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};
