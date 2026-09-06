import { useEffect, useRef } from "react";

import type { TaskList } from "@flowforge/api-client";

import { api } from "../../api";
import { useAppContext } from "../../context/AppContext";
import { Icon } from "../icons/IconSprite";

type ListActionMenuProps = {
  listId: number | null;
  anchorEl: HTMLElement | null;
  onClose: () => void;
};

export function ListActionMenu({ listId, anchorEl, onClose }: ListActionMenuProps) {
  const { lists, openEditListModal, setView, loadLists, syncAfterMutation, toast, view } = useAppContext();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listId || !anchorEl || !menuRef.current) return;
    const rect = anchorEl.getBoundingClientRect();
    const menuWidth = 160;
    const menuHeight = 90;
    let left = rect.right + 4;
    if (left + menuWidth > window.innerWidth - 8) left = rect.left - menuWidth - 4;
    let top = rect.top;
    if (top + menuHeight > window.innerHeight - 8) top = Math.max(8, window.innerHeight - menuHeight - 8);
    menuRef.current.style.position = "fixed";
    menuRef.current.style.left = `${Math.max(8, left)}px`;
    menuRef.current.style.top = `${Math.max(8, top)}px`;
    menuRef.current.hidden = false;
  }, [listId, anchorEl]);

  useEffect(() => {
    if (!listId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("#list-action-menu") && !t.closest("[data-list-menu]") && !t.closest("#list-menu-btn")) {
        onClose();
      }
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [listId, onClose]);

  if (!listId) return null;

  const listObj = lists.find((l) => l.id === listId);

  async function onDelete() {
    if (!listObj) return;
    onClose();
    if (!confirm(`Are you sure you want to delete "${listObj.name}"?`)) return;
    try {
      await api.deleteTaskList(listObj.id);
      await loadLists();
      if (view === `list-${listObj.id}`) setView("all");
      await syncAfterMutation();
      toast("List deleted", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  function onEdit() {
    onClose();
    if (listObj) openEditListModal(listObj);
  }

  return (
    <div id="list-action-menu" className="action-dropdown" ref={menuRef} hidden>
      <button type="button" className="action-item" id="menu-edit-list" onClick={onEdit}>
        <Icon name="edit" style={{ width: 15, height: 15 }} />
        <span>Edit list</span>
      </button>
      <button type="button" className="action-item danger" id="menu-delete-list" onClick={() => void onDelete()}>
        <Icon name="trash" style={{ width: 15, height: 15 }} />
        <span>Delete list</span>
      </button>
    </div>
  );
}
