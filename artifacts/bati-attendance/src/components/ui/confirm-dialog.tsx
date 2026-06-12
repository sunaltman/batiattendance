// Lightweight confirmation modal — same visual language as the leave form modal.
// Replaces native confirm(), which looks broken inside the PWA.
type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open, title, description,
  confirmLabel = "យល់ព្រម", cancelLabel = "បោះបង់",
  destructive = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 font-khmer mb-1">{title}</h2>
        {description && <p className="text-sm font-khmer text-gray-500 mb-4">{description}</p>}
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold font-khmer min-h-[48px]">
            {cancelLabel}
          </button>
          <button onClick={onConfirm}
            className={`flex-1 py-3 rounded-xl text-white font-bold font-khmer min-h-[48px] ${
              destructive ? "bg-red-600" : "bg-[#5E8B73]"
            }`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
