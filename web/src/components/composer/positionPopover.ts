export function positionPopover(pop: HTMLElement, anchorEl: HTMLElement | null): void {
  pop.hidden = false;
  pop.style.display = pop.classList.contains("time-picker-popover") ? "flex" : "block";

  let rect: DOMRect | { left: number; top: number; bottom: number; width: number; height: number } | null = null;
  if (anchorEl) {
    const r = anchorEl.getBoundingClientRect();
    if (r.width > 0 || r.height > 0 || r.top > 0 || r.left > 0) {
      rect = r;
    }
  }

  if (!rect) {
    const composerCard = document.querySelector(".composer-card") || document.querySelector("#composer");
    if (composerCard) {
      const cr = composerCard.getBoundingClientRect();
      rect = {
        left: cr.left + 24,
        top: cr.top + 80,
        bottom: cr.top + 104,
        width: 120,
        height: 24,
      };
    }
  }

  const popWidth = Math.max(180, pop.offsetWidth || 260);
  const popHeight = Math.max(180, pop.offsetHeight || 280);

  let left = rect ? rect.left : 20;
  let top = rect ? rect.bottom + 6 : 80;

  if (rect && top + popHeight > window.innerHeight - 10) {
    top = Math.max(10, rect.top - popHeight - 6);
  }
  if (left + popWidth > window.innerWidth - 10) {
    left = Math.max(10, window.innerWidth - popWidth - 10);
  }
  if (left < 10) left = 10;
  if (top < 10) top = 10;

  pop.style.position = "fixed";
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}
