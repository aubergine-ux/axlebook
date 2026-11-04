import type { ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';

/** A sheet on phones, a centered dialog on wider screens. Focus is trapped; Escape closes. */
export function FormDialog({
  isOpen,
  onOpenChange,
  title,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
    >
      <Modal className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-xl bg-surface-raised p-5 shadow-pop sm:rounded-lg">
        <Dialog className="outline-none">
          <Heading slot="title" className="mb-4 text-title font-semibold">
            {title}
          </Heading>
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
