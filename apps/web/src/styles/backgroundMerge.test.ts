import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const shellStyles = readFileSync(resolve('src/styles/glass-shell.css'), 'utf8');
const themeStyles = readFileSync(resolve('src/styles/glass-theme.css'), 'utf8');

afterEach(() => {
  document.head.querySelectorAll('[data-background-test]').forEach((style) => style.remove());
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
});

describe('merged dashboard backgrounds', () => {
  it.each(['admin', 'manager', 'operator'] as const)(
    'keeps the %s role image visible through the page canvas in both themes',
    (role) => {
      expect(shellStyles).toContain(`/assets/images/${role}%20bg.png`);

      for (const css of [shellStyles.replace('var(--role-background-image)', `url("/assets/images/${role}%20bg.png")`), themeStyles]) {
        const style = document.createElement('style');
        style.dataset.backgroundTest = '';
        style.textContent = css;
        document.head.append(style);
      }

      document.body.innerHTML = `<div class="app-shell glass-shell" data-role="${role}"><aside class="sidebar"></aside><main class="page-content glass-screen"><div class="page-controls"></div><div class="card"></div></main></div>`;
      const shell = document.querySelector<HTMLElement>('.glass-shell')!;
      const main = document.querySelector<HTMLElement>('.page-content')!;

      for (const theme of ['light', 'dark']) {
        document.documentElement.dataset.theme = theme;
        expect(getComputedStyle(shell).backgroundImage).toContain(`${role}%20bg.png`);
        expect(getComputedStyle(main).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        for (const selector of ['.sidebar', '.page-controls', '.card']) {
          expect(getComputedStyle(document.querySelector<HTMLElement>(selector)!).backgroundColor).toBe('rgba(0, 0, 0, 0.45)');
        }
      }
    },
  );
});
