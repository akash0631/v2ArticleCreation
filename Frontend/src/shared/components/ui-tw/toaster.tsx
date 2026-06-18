import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from '@/lib/use-theme';

/**
 * Branded global toaster.
 *
 * - Slate brand surface (matches header strips on Approver / Admin / Profile)
 * - Coral accent ribbon on the left edge of each toast (subtle, picks up the
 *   primary brand colour)
 * - Display font (Fraunces) for titles; body font for descriptions
 * - Wider shadow stack so toasts sit visually above page content
 * - Custom radius tied to --radius-card so it matches modals
 */
export const Toaster = () => {
  const theme = useTheme();
  return (
    <SonnerToaster
      theme={theme}
      position="top-right"
      richColors={false}
      closeButton
      visibleToasts={4}
      gap={10}
      offset={20}
      toastOptions={{
        duration: 4200,
        unstyled: false,
        classNames: {
          toast: [
            'group toast pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden',
            'rounded-[var(--radius-card)] border border-white/10 bg-[#1f2937] text-white',
            'pl-4 pr-9 py-3.5 shadow-[var(--shadow-pop)] backdrop-blur',
            // coral accent ribbon
            'before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-[var(--color-primary)]',
          ].join(' '),
          title: 'font-display text-[15px] font-semibold leading-tight tracking-tight text-white',
          description: 'text-[13px] leading-snug text-white/70',
          actionButton: [
            'inline-flex h-8 items-center justify-center rounded-[var(--radius-control)] px-3',
            'bg-[var(--color-primary)] text-sm font-medium text-white',
            'transition hover:bg-[var(--color-primary)]/90',
          ].join(' '),
          cancelButton: [
            'inline-flex h-8 items-center justify-center rounded-[var(--radius-control)] px-3',
            'bg-white/10 text-sm font-medium text-white/90',
            'transition hover:bg-white/20',
          ].join(' '),
          closeButton: [
            '!absolute !right-2 !top-2 !left-auto !translate-x-0 !translate-y-0',
            '!flex !h-6 !w-6 !items-center !justify-center !rounded-full',
            '!border-0 !bg-white/10 !text-white/80 hover:!bg-white/20 hover:!text-white',
          ].join(' '),
          // Status tints — keep the slate body, change only the ribbon colour
          success:
            'before:!bg-emerald-400 [&_[data-icon]>svg]:!text-emerald-300',
          error:
            'before:!bg-rose-400 [&_[data-icon]>svg]:!text-rose-300',
          warning:
            'before:!bg-amber-400 [&_[data-icon]>svg]:!text-amber-300',
          info:
            'before:!bg-sky-400 [&_[data-icon]>svg]:!text-sky-300',
          loading: '[&_[data-icon]>svg]:!text-[var(--color-primary)]',
          icon: 'shrink-0 mt-0.5',
        },
      }}
    />
  );
};
