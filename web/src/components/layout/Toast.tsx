import { useAppContext } from "../../context/AppContext";

export function Toast() {
  const { toastMessage } = useAppContext();
  if (!toastMessage) return null;
  return (
    <p className={`toast ${toastMessage.kind}`.trim()} id="toast" role="status">
      <span>{toastMessage.message}</span>
      {toastMessage.action && (
        <button type="button" className="toast-action" onClick={toastMessage.action.onClick}>
          {toastMessage.action.label}
        </button>
      )}
    </p>
  );
}
