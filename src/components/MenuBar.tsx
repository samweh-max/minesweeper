import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { pixelLayers } from '../ui/pixel';

export type MenuEntry =
  | { type: 'separator' }
  | {
      type?: 'item';
      label: string;
      /** Letter to underline, as in the original menus. */
      access?: string;
      shortcut?: string;
      /** When defined, the item shows a check mark and is announced as a checkbox. */
      checked?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    };

export interface MenuDef {
  id: string;
  label: string;
  access: string;
  items: MenuEntry[];
}

function Underlined({ text, access }: { text: string; access?: string }): ReactNode {
  if (!access) return text;
  const i = text.toLowerCase().indexOf(access.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <u>{text[i]}</u>
      {text.slice(i + 1)}
    </>
  );
}

const CHECK = pixelLayers(['......x', '.....xx', 'x...xxx', 'xx.xxx.', 'xxxxx..', '.xxx...', '..x....'], {
  x: 'currentColor',
})[0].d;

export function MenuBar({ menus }: { menus: MenuDef[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusFirst = useRef(false);

  const open = menus.find((m) => m.id === openId) ?? null;

  // Close when clicking anywhere outside the menu bar.
  useEffect(() => {
    if (!openId) return;
    function onDown(e: PointerEvent) {
      if (!barRef.current?.contains(e.target as Node)) setOpenId(null);
    }
    function onEscape(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setOpenId(null);
    }
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onEscape);
    };
  }, [openId]);

  // Alt+letter opens a menu, like Windows.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const menu = menus.find((m) => m.access.toLowerCase() === e.key.toLowerCase());
      if (!menu) return;
      e.preventDefault();
      openMenu(menu.id, true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (openId && focusFirst.current) {
      focusFirst.current = false;
      barRef.current?.querySelector<HTMLElement>('.menu [role^="menuitem"]:not([aria-disabled="true"])')?.focus();
    }
  }, [openId]);

  function openMenu(id: string, withFocus: boolean) {
    focusFirst.current = withFocus;
    setOpenId(id);
    if (withFocus && id === openId) {
      barRef.current?.querySelector<HTMLElement>('.menu [role^="menuitem"]:not([aria-disabled="true"])')?.focus();
    }
  }

  function close(returnFocus: boolean) {
    const id = openId;
    setOpenId(null);
    if (returnFocus && id) buttonRefs.current.get(id)?.focus();
  }

  function sibling(id: string, delta: number): string {
    const i = menus.findIndex((m) => m.id === id);
    return menus[(i + delta + menus.length) % menus.length].id;
  }

  function onBarKey(e: KeyboardEvent, id: string) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu(id, true);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = sibling(id, e.key === 'ArrowRight' ? 1 : -1);
      buttonRefs.current.get(next)?.focus();
      if (openId) openMenu(next, false);
    } else if (e.key === 'Escape' && openId) {
      e.preventDefault();
      close(true);
    }
  }

  function onMenuKey(e: KeyboardEvent) {
    const items = Array.from(
      barRef.current?.querySelectorAll<HTMLElement>('.menu [role^="menuitem"]:not([aria-disabled="true"])') ?? [],
    );
    const i = items.indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        items[(i + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        items[(i - 1 + items.length) % items.length]?.focus();
        break;
      case 'Home':
        e.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case 'ArrowRight':
      case 'ArrowLeft': {
        e.preventDefault();
        const next = sibling(openId!, e.key === 'ArrowRight' ? 1 : -1);
        openMenu(next, true);
        break;
      }
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
    }
  }

  function select(entry: Extract<MenuEntry, { label: string }>) {
    if (entry.disabled) return;
    setOpenId(null);
    entry.onSelect();
  }

  return (
    <div className="menubar" role="menubar" aria-label="Main menu" ref={barRef}>
      {menus.map((menu) => (
        <div className="menubar__slot" key={menu.id}>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openId === menu.id}
            aria-label={menu.label}
            className={'menubar__item' + (openId === menu.id ? ' is-open' : '')}
            ref={(el) => {
              if (el) buttonRefs.current.set(menu.id, el);
              else buttonRefs.current.delete(menu.id);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              if (openId === menu.id) setOpenId(null);
              else openMenu(menu.id, false);
            }}
            onClick={(e) => {
              // Keyboard "click" (Enter/Space) is handled in onBarKey; this covers assistive tech.
              if (e.detail === 0 && openId !== menu.id) openMenu(menu.id, true);
            }}
            onMouseEnter={() => {
              if (openId && openId !== menu.id) openMenu(menu.id, false);
            }}
            onKeyDown={(e) => onBarKey(e, menu.id)}
          >
            <Underlined text={menu.label} access={menu.access} />
          </button>
          {open?.id === menu.id && (
            <div className="menu" role="menu" aria-label={menu.label} onKeyDown={onMenuKey}>
              {menu.items.map((entry, i) =>
                entry.type === 'separator' ? (
                  <div key={i} className="menu__sep" role="separator" />
                ) : (
                  <div
                    key={i}
                    role={entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                    aria-checked={entry.checked === undefined ? undefined : entry.checked}
                    aria-disabled={entry.disabled || undefined}
                    aria-label={entry.label.replace(/\.\.\.$/, '')}
                    tabIndex={-1}
                    className={'menu__item' + (entry.disabled ? ' is-disabled' : '')}
                    onMouseEnter={(e) => e.currentTarget.focus()}
                    onClick={() => select(entry)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        select(entry);
                      }
                    }}
                  >
                    <span className="menu__check">
                      {entry.checked && (
                        <svg width="7" height="7" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
                          <path d={CHECK} fill="currentColor" />
                        </svg>
                      )}
                    </span>
                    <span className="menu__label">
                      <Underlined text={entry.label} access={entry.access} />
                    </span>
                    {entry.shortcut && <span className="menu__shortcut">{entry.shortcut}</span>}
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
