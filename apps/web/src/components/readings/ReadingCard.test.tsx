import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReadingCard } from './ReadingCard';

afterEach(cleanup);

const reading = {
  id: 'reading-1',
  tankId: 'tank-a',
  timestamp: '2025-01-01T00:00:00Z',
  temperature: 29.8,
  doMgL: 6,
  ph: 7.2,
};

describe('ReadingCard', () => {
  it('shows a labeled status, reading value, distance and configured safe range', () => {
    render(<ReadingCard parameter="temperature" reading={reading} threshold={{ parameter: 'temperature', min: 30, max: 32 }} />);
    const card = screen.getByRole('article', { name: 'Temperature reading' });
    expect(card).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(card.querySelector('.reading-number')).toHaveTextContent('29.8 °C');
    expect(screen.getByText('Safe 30–32 °C')).toBeInTheDocument();
  });

  it('shows one short status line and moves the scale note into an info tooltip', () => {
    const { container } = render(<ReadingCard parameter="temperature" reading={reading} threshold={{ parameter: 'temperature', min: 30, max: 32 }} showRangeMeter />);
    expect(screen.getByText('0.2 °C below min')).toBeInTheDocument();
    expect(screen.queryByText(/Display scale/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Display scale 29–33 °C' })).toHaveAttribute('title', 'Display scale 29–33 °C');
    expect(screen.getByRole('img', { name: /Safe 30–32 °C/ })).toBeInTheDocument();
    expect(container.querySelector('.reading-scale-labels')).toHaveTextContent('3032');
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText(/Updated .* PHT/)).toBeInTheDocument();
  });

  it('places the marker inside the padded scale and keeps minimum-only DO thresholds distinct', () => {
    const { container } = render(<ReadingCard parameter="temperature" reading={reading} threshold={{ parameter: 'temperature', min: 30, max: 32 }} showRangeMeter />);
    expect(parseFloat((container.querySelector('.reading-scale-track > span') as HTMLElement).style.left)).toBeCloseTo(20, 5);
    cleanup();
    const { container: doCard } = render(<ReadingCard parameter="do" reading={reading} threshold={{ parameter: 'do', min: 4 }} showRangeMeter />);
    expect(screen.getByRole('img', { name: /Safe ≥4 mg\/L/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Display scale 0–8 mg/L' })).toBeInTheDocument();
    expect(doCard.querySelector('.reading-scale-track')).toHaveClass('reading-scale-track-minimum-only');
  });

  it('shows both bounds for the default DO range', () => {
    render(<ReadingCard parameter="do" reading={reading} showRangeMeter />);
    expect(screen.getByRole('img', { name: /Safe 4–8 mg\/L/ })).toBeInTheDocument();
  });

  it('aligns a threshold label at the edge of the scale', () => {
    render(<ReadingCard parameter="do" reading={reading} threshold={{ parameter: 'do', min: 0 }} showRangeMeter />);
    expect(screen.getByText('0')).toHaveClass('reading-scale-label-start');
  });

  it('shows stale readings neutrally and invalid values as probe issues', () => {
    const { rerender } = render(<ReadingCard parameter="temperature" reading={{ ...reading, temperature: 40 }} showRangeMeter stale />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.queryByText('Critical')).not.toBeInTheDocument();
    rerender(<ReadingCard parameter="temperature" reading={{ ...reading, temperature: 126 }} showRangeMeter />);
    expect(screen.getByText('Check probe')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('Critical')).not.toBeInTheDocument();
  });

  it('shows unavailable measurements without formatting missing values', () => {
    render(<ReadingCard parameter="temperature" reading={{ ...reading, temperature: undefined as unknown as number }} showRangeMeter />);
    expect(screen.getByText('Check probe')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
