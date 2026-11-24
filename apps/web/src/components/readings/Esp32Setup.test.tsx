import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Esp32Setup } from './Esp32Setup';

afterEach(cleanup);

describe('ESP32 setup', () => {
  it('opens the device setup page without collecting Wi-Fi credentials', () => {
    const { rerender } = render(<Esp32Setup deviceId="HS-001" />);
    expect(screen.getByRole('link', { name: 'Configure ESP32' })).toHaveAttribute('href', 'http://192.168.4.1');
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByLabelText('Wi-Fi password')).not.toBeInTheDocument();
    expect(screen.getByText(/registered tank device ID/)).toHaveTextContent('HS-001');
    rerender(<Esp32Setup deviceId="HS-002" />);
    expect(screen.getByText(/registered tank device ID/)).toHaveTextContent('HS-002');
  });
});
