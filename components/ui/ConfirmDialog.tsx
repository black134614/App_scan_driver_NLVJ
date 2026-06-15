"use client";

import Button from "./Button";
import Modal from "./Modal";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} maxWidth="max-w-md">
      <h3 className="text-lg font-bold text-slate-800">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant}
          onClick={onConfirm}
          loading={loading}
          loadingText={confirmLabel}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
