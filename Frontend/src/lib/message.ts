/**
 * Compatibility shim that exposes an antd-`message`-shaped API backed by sonner.
 * Lets us replace `import { message } from 'antd'` with this without touching
 * the call-sites' API.
 */
import { toast } from 'sonner';

type Content = React.ReactNode | string;

const wrap =
  (kind: 'success' | 'error' | 'info' | 'warning' | 'loading') =>
  (content: Content, duration?: number) => {
    const opts = typeof duration === 'number' ? { duration: duration * 1000 } : undefined;
    switch (kind) {
      case 'success':
        return toast.success(content as string, opts);
      case 'error':
        return toast.error(content as string, opts);
      case 'warning':
        return toast.warning(content as string, opts);
      case 'loading':
        return toast.loading(content as string, opts);
      case 'info':
      default:
        return toast.info(content as string, opts);
    }
  };

export const message = {
  success: wrap('success'),
  error: wrap('error'),
  info: wrap('info'),
  warning: wrap('warning'),
  warn: wrap('warning'),
  loading: wrap('loading'),
  open: (config: { type?: string; content: Content; duration?: number }) => {
    const kind = (config.type as 'success' | 'error' | 'info' | 'warning' | 'loading') || 'info';
    return wrap(kind)(config.content, config.duration);
  },
  destroy: () => toast.dismiss(),
};

/** sonner-backed analog of antd's `notification` (subset). */
export const notification = {
  success: (config: { message: Content; description?: Content }) =>
    toast.success(config.message as string, { description: config.description as string }),
  error: (config: { message: Content; description?: Content }) =>
    toast.error(config.message as string, { description: config.description as string }),
  info: (config: { message: Content; description?: Content }) =>
    toast.info(config.message as string, { description: config.description as string }),
  warning: (config: { message: Content; description?: Content }) =>
    toast.warning(config.message as string, { description: config.description as string }),
  open: (config: { message: Content; description?: Content; type?: string }) => {
    const kind = (config.type as 'success' | 'error' | 'info' | 'warning') || 'info';
    return notification[kind]({ message: config.message, description: config.description });
  },
};
