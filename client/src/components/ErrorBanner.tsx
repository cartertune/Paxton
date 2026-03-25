interface Props {
  message: string;
  onDismiss?: () => void;
}

export default function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3 flex items-center justify-between">
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-4 text-red-500 hover:text-red-700 font-medium"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
