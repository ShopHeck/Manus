import * as RadixToast from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { create } from 'zustand';
import styles from './Toast.module.css';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'danger';
}

interface ToastStore {
  toasts: ToastItem[];
  add: (toast: Omit<ToastItem, 'id'>) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: crypto.randomUUID() }],
    })),
  remove: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(title: string, description?: string, variant?: ToastItem['variant']) {
  useToastStore.getState().add({ title, description, variant });
}

export function Toaster() {
  const { toasts, remove } = useToastStore();

  return (
    <RadixToast.Provider swipeDirection="right">
      {toasts.map((t) => (
        <RadixToast.Root
          key={t.id}
          className={`${styles.toast} ${styles[t.variant ?? 'default']}`}
          onOpenChange={(open) => { if (!open) remove(t.id); }}
          defaultOpen
          duration={4000}
        >
          <div className={styles.content}>
            <RadixToast.Title className={styles.title}>{t.title}</RadixToast.Title>
            {t.description && (
              <RadixToast.Description className={styles.description}>
                {t.description}
              </RadixToast.Description>
            )}
          </div>
          <RadixToast.Close className={styles.close}>
            <X size={14} />
          </RadixToast.Close>
        </RadixToast.Root>
      ))}
      <RadixToast.Viewport className={styles.viewport} />
    </RadixToast.Provider>
  );
}
