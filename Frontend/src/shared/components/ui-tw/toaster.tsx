import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from '@/lib/use-theme';

export const Toaster = () => {
  const theme = useTheme();
  return (
    <SonnerToaster
      theme={theme}
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
        },
      }}
    />
  );
};
