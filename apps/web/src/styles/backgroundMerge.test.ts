import { existsSync, readFileSync } from 'node:fs';
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
      expect(shellStyles).toContain('var(--role-background-image)');
      for (const css of [shellStyles, themeStyles]) {
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
        const image = theme === 'light' ? `${role}%20bg%20light%20web.png` : `${role}%20bg.png`;
        expect(getComputedStyle(shell).getPropertyValue('--role-background-image')).toContain(image);
        expect(existsSync(resolve('public/assets/images', decodeURIComponent(image)))).toBe(true);
        expect(getComputedStyle(main).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        expect(getComputedStyle(document.querySelector<HTMLElement>('.sidebar')!).backgroundColor).toBe('rgba(0, 0, 0, 0.45)');
        expect(getComputedStyle(document.querySelector<HTMLElement>('.page-controls')!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        expect(getComputedStyle(document.querySelector<HTMLElement>('.card')!).backgroundColor).toBe('rgba(255, 255, 255, 0.04)');
      }
    },
  );

  it('prevents viewport overscroll only while the dashboard is mounted', () => {
    const style = document.createElement('style');
    style.dataset.backgroundTest = '';
    style.textContent = shellStyles;
    document.head.append(style);

    document.body.innerHTML = '<div class="glass-shell"></div>';
    expect(getComputedStyle(document.documentElement).getPropertyValue('overscroll-behavior')).toBe('none');

    document.body.innerHTML = '';
    expect(getComputedStyle(document.documentElement).getPropertyValue('overscroll-behavior')).toBe('');
  });

  it('uses neutral frosted surfaces for cards and transparent nested cards', () => {
    for (const css of [shellStyles, themeStyles]) {
      const style = document.createElement('style');
      style.dataset.backgroundTest = '';
      style.textContent = css;
      document.head.append(style);
    }

    const classes = ['card', 'glass-panel', 'dashboard-card', 'alert-card', 'advisory-card',
      'summary-card', 'parameter-card', 'trend-card', 'notification-panel', 'dashboard-modal',
      'tank-management-card', 'state-box', 'device-card'];
    document.body.innerHTML = `<div class="glass-shell"><main class="glass-screen">${classes.map((name) => `<div class="${name}"></div>`).join('')}<div class="state-box state-error"></div><div class="state-box state-stale"></div><div class="dialog card"></div><div class="card outer"><div class="card inner"></div><div class="popover inner-popover"></div></div><div class="card live-panel"><div class="glass-advisories"><div class="card inner-live"></div></div></div></main></div>`;

    for (const name of [...classes, 'state-error', 'state-stale']) {
      const style = getComputedStyle(document.querySelector<HTMLElement>(`.${name}`)!);
      expect(style.backgroundColor, name).toBe('rgba(255, 255, 255, 0.04)');
      expect(style.borderTopColor, name).toBe('rgba(255, 255, 255, 0.15)');
      expect(style.boxShadow, name).toBe('0 8px 32px rgba(0, 0, 0, 0.25)');
    }
    expect(getComputedStyle(document.querySelector<HTMLElement>('.dialog.card')!).backgroundColor).toBe('rgba(255, 255, 255, 0.04)');
    for (const name of ['inner', 'inner-popover', 'inner-live']) {
      const style = getComputedStyle(document.querySelector<HTMLElement>(`.${name}`)!);
      expect(style.backgroundColor, name).toBe('rgba(0, 0, 0, 0)');
      expect(style.boxShadow, name).toBe('none');
    }
    expect(themeStyles).toContain('backdrop-filter: blur(20px) saturate(120%)');
  });
});
