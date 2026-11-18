import { Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
  disabled: boolean;
}

export interface SelectChangeEvent {
  target: { value: string };
  currentTarget: { value: string };
}

export interface SelectProps {
  value: string | number;
  onChange?: (event: SelectChangeEvent) => void;
  children?: ReactNode;
  id?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  clearable?: boolean;
  'aria-label'?: string;
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

function readOptions(children: ReactNode) {
  const options: SelectOption[] = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement(child)) return;
    const element = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
    const label = textOf(element.props.children);
    options.push({
      value: String(element.props.value ?? label),
      label,
      disabled: Boolean(element.props.disabled),
    });
  });
  return options;
}

/**
 * Glass dropdown that lists real choices only. An `<option value="">` child is never listed;
 * its label is shown as the placeholder while nothing is selected.
 */
export function Select({ value, onChange, children, id, className = '', disabled, required, placeholder, clearable, 'aria-label': ariaLabel }: SelectProps) {
  const generatedId = useId();
  const buttonId = id ?? generatedId;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const all = useMemo(() => readOptions(children), [children]);
  const choices = useMemo(() => all.filter((option) => option.value !== ''), [all]);
  const current = String(value ?? '');
  const selected = choices.find((option) => option.value === current);
  const emptyLabel = all.find((option) => option.value === '')?.label;
  const shownPlaceholder = placeholder ?? emptyLabel ?? 'Select';

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);

  const choose = useCallback((option: SelectOption) => {
    if (option.disabled) return;
    const next = clearable && option.value === current ? '' : option.value;
    if (next !== current) onChange?.({ target: { value: next }, currentTarget: { value: next } });
    close();
    triggerRef.current?.focus();
  }, [clearable, close, current, onChange]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = Math.min(280, choices.length * 40 + 12);
    const above = window.innerHeight - rect.bottom < menuHeight + 12 && rect.top > menuHeight + 12;
    setPosition({ top: above ? rect.top - 6 : rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 160), above });
  }, [open, choices.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const onViewportChange = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, close]);

  useEffect(() => {
    if (open && active >= 0) menuRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  function openMenu() {
    if (disabled || !choices.length) return;
    setActive(Math.max(0, choices.findIndex((option) => option.value === current)));
    setOpen(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => (index + step + choices.length) % choices.length);
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      if (choices[active]) choose(choices[active]);
    } else if (event.key === 'Tab' && open) {
      close();
    }
  }

  const portalRoot = typeof document === 'undefined' ? null
    : triggerRef.current?.closest('.glass-shell, .auth-background') ?? document.body;

  return (
    <span className={`hs-select${open ? ' is-open' : ''} ${className}`.trim()}>
      <button
        ref={triggerRef}
        id={buttonId}
        type="button"
        role="combobox"
        className="hs-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${buttonId}-list` : undefined}
        disabled={disabled}
        data-placeholder={selected ? undefined : 'true'}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="hs-select-value">{selected?.label ?? shownPlaceholder}</span>
        <ChevronDown size={16} aria-hidden="true" className="hs-select-chevron" />
      </button>
      {required && <input className="hs-select-required" tabIndex={-1} aria-hidden="true" required value={current} onChange={() => undefined} />}
      {open && position && portalRoot && createPortal(
        <ul
          ref={menuRef}
          id={`${buttonId}-list`}
          role="listbox"
          className="hs-select-menu"
          aria-label={ariaLabel}
          style={{ left: position.left, minWidth: position.width, ...(position.above ? { bottom: window.innerHeight - position.top } : { top: position.top }) }}
        >
          {choices.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === current}
              aria-disabled={option.disabled || undefined}
              className={`hs-select-option${index === active ? ' is-active' : ''}${option.value === current ? ' is-selected' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {option.value === current && <Check size={15} aria-hidden="true" />}
            </li>
          ))}
        </ul>,
        portalRoot,
      )}
    </span>
  );
}
