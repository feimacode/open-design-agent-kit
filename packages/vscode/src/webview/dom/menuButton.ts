import { icon, type IconName } from './icons';

export interface MenuItem {
  id: string;
  label: string;
  description?: string;
  icon?: IconName;
  onSelect: () => void;
}

export interface MenuSection {
  heading?: string;
  items: MenuItem[];
}

/**
 * A dropdown menu anchored to `trigger` (a menu button, or the chevron half
 * of a split button). The popover is appended to <body> with fixed
 * positioning so the toolbar's overflow never clips it.
 *
 * Closes on Escape, Tab, an outside pointerdown, a resize, or the window
 * losing focus — the last one matters here because a click inside the
 * artifact <iframe> never reaches this document as a pointerdown.
 */
export function attachMenu(trigger: HTMLButtonElement, sections: MenuSection[]): void {
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');

  let menu: HTMLDivElement | null = null;

  const close = (refocus: boolean): void => {
    if (!menu) return;
    menu.remove();
    menu = null;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('blur', onDismiss);
    window.removeEventListener('resize', onDismiss);
    if (refocus) trigger.focus();
  };
  const onDismiss = (): void => close(false);
  const onOutside = (event: PointerEvent): void => {
    const target = event.target as Node;
    if (menu?.contains(target) || trigger.contains(target)) return;
    close(false);
  };

  const items = (): HTMLButtonElement[] => Array.from(menu?.querySelectorAll<HTMLButtonElement>('.od-menu-item') ?? []);
  const focusAt = (index: number): void => {
    const all = items();
    all[(index + all.length) % all.length]?.focus();
  };

  const open = (focusFirst: boolean): void => {
    menu = document.createElement('div');
    menu.className = 'od-menu';
    menu.setAttribute('role', 'menu');
    for (const [i, section] of sections.entries()) {
      if (i > 0) menu.insertAdjacentHTML('beforeend', '<div class="od-menu-sep" role="separator"></div>');
      if (section.heading) {
        const heading = document.createElement('div');
        heading.className = 'od-menu-heading';
        heading.textContent = section.heading;
        menu.appendChild(heading);
      }
      for (const item of section.items) {
        const btn = document.createElement('button');
        btn.className = 'od-menu-item';
        btn.setAttribute('role', 'menuitem');
        btn.dataset.id = item.id;
        btn.innerHTML = `${item.icon ? icon(item.icon) : '<span class="od-icon"></span>'}<span class="od-menu-text"><span class="od-menu-label"></span>${item.description ? '<span class="od-menu-desc"></span>' : ''}</span>`;
        btn.querySelector('.od-menu-label')!.textContent = item.label;
        if (item.description) btn.querySelector('.od-menu-desc')!.textContent = item.description;
        btn.addEventListener('click', () => {
          close(false);
          item.onSelect();
        });
        menu.appendChild(btn);
      }
    }
    menu.addEventListener('keydown', (event) => {
      const index = items().indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown') focusAt(index + 1);
      else if (event.key === 'ArrowUp') focusAt(index - 1);
      else if (event.key === 'Home') focusAt(0);
      else if (event.key === 'End') focusAt(-1);
      else if (event.key === 'Escape') close(true);
      else if (event.key === 'Tab') close(false);
      else return;
      event.preventDefault();
    });
    document.body.appendChild(menu);

    // Right-align to the trigger's group (a split button aligns to its whole
    // pill, not just the chevron), flipping left if it would overflow.
    const anchor = (trigger.closest('.od-split') ?? trigger).getBoundingClientRect();
    const width = menu.offsetWidth;
    const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${anchor.bottom + 6}px`;

    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('blur', onDismiss);
    window.addEventListener('resize', onDismiss);
    if (focusFirst) focusAt(0);
  };

  trigger.addEventListener('click', (event) => {
    if (menu) close(false);
    // detail === 0: activated from the keyboard, so move focus into the menu.
    else open(event.detail === 0);
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' || menu) return;
    event.preventDefault();
    open(true);
  });
}
