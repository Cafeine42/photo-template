import { useEffect } from "react";

type ToastProps = {
  message: string;
  onDismiss: () => void;
};

const AUTO_DISMISS_MS = 4000;

const Toast = ({ message, onDismiss }: ToastProps) => {
  const isError = message.includes("Erreur");

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className={`toast ${isError ? "toast-error" : "toast-success"}`} role="status">
      <span className="toast-icon" aria-hidden="true">{isError ? "⚠️" : "✅"}</span>
      <span className="toast-text">{message}</span>
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Fermer le message">
        ×
      </button>
    </div>
  );
};

export default Toast;
