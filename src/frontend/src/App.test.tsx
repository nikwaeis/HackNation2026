import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

vi.mock('./pages/HomePage', () => ({ HomePage: () => <div>home page</div> }));
vi.mock('./pages/ReportPage', () => ({ ReportPage: () => <div>report page</div> }));

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => window.localStorage.clear());

describe('Header accessibility controls', () => {
  it('has no "Większy tekst" button any more', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: /Większy tekst/i })).not.toBeInTheDocument();
    expect(document.documentElement.dataset.textScale).toBeUndefined();
  });

  it('"Kontrast" switches the whole app to the dark theme and back', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole('button', { name: /Kontrast/ });

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark'); // native date picker / scrollbars
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('wodoplon-theme')).toBe('dark');

    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('wodoplon-theme')).toBe('light');
  });

  it('remembers the dark theme after a reload', () => {
    window.localStorage.setItem('wodoplon-theme', 'dark');
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('migrates the old "high contrast" preference to the dark theme', () => {
    window.localStorage.setItem('wodoplon-contrast', 'high');
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
