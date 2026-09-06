import { Icon } from "../icons/IconSprite";

type KeyboardHelpModalProps = {
  open: boolean;
  onClose: () => void;
};

const SHORTCUTS = [
  { keys: "n", desc: "New task or event" },
  { keys: "t", desc: "Go to today" },
  { keys: "← / →", desc: "Previous / next range" },
  { keys: "?", desc: "Show keyboard shortcuts" },
  { keys: "Esc", desc: "Close popovers, composer, or settings" },
];

export function KeyboardHelpModal({ open, onClose }: KeyboardHelpModalProps) {
  if (!open) return null;
  return (
    <div className="backdrop open" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("backdrop")) onClose(); }}>
      <div className="card keyboard-help-card" onClick={(e) => e.stopPropagation()}>
        <div className="keyboard-help-head">
          <h3>Keyboard shortcuts</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <ul className="keyboard-help-list">
          {SHORTCUTS.map((s) => (
            <li key={s.keys}>
              <kbd>{s.keys}</kbd>
              <span>{s.desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
