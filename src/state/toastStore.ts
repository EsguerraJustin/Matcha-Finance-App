/**
 * Toast store — UI state only. The root layout renders one `<Toast />` and any
 * screen can raise a message with an undo action.
 */

import { create } from 'zustand';

import { HIDDEN_TOAST, type ToastState } from '../components/ui/Toast';

interface ToastStore extends ToastState {
  show: (toast: Omit<ToastState, 'visible'>) => void;
  hide: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  ...HIDDEN_TOAST,
  show: (toast) => set({ ...toast, visible: true }),
  hide: () => set({ ...HIDDEN_TOAST }),
}));

export const showToast = (toast: Omit<ToastState, 'visible'>) => useToastStore.getState().show(toast);
export const hideToast = () => useToastStore.getState().hide();