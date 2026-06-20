import { useEffect } from "react";
import "./Toast.css";

export default function Toast({ message, onDismiss }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, 3200);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className="toast">
      <span className="toast-dot" />
      {message}
    </div>
  );
}
