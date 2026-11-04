import type { ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { Button, type Variant } from './Button';

/** Controlled confirmation dialog. Focus is trapped and Escape cancels. */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  children,
  confirmLabel,
  confirmVariant = 'danger',
  onConfirm,
  isPending,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmVariant?: Variant;
  onConfirm: () => void;
  isPending?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <Modal className="w-full max-w-md rounded-lg border border-line bg-surface-raised p-5 shadow-xl">
        <Dialog role="alertdialog" className="outline-none">
          <Heading slot="title" className="text-lg font-semibold">
            {title}
          </Heading>
          <div className="mt-2 text-sm text-ink-muted">{children}</div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onPress={() => onOpenChange(false)} autoFocus>
              {t('actions.cancel')}
            </Button>
            <Button variant={confirmVariant} onPress={onConfirm} isDisabled={isPending}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
