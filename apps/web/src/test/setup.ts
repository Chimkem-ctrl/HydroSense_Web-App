import '@testing-library/jest-dom/vitest';

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class implements ResizeObserver {
    constructor(_callback: ResizeObserverCallback) {}
    observe(_target: Element) {}
    unobserve(_target: Element) {}
    disconnect() {}
  };
}
