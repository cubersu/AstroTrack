/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '../../test/render';
import { AltitudeChart } from './AltitudeChart';
import {
  ClassBadge,
  ComponentBreakdown,
  ConfidenceBadge,
  ReasonList,
  ScoreRing,
} from './ScoreViews';
import { Field, NumberInput, Segmented } from '../../ui/controls';
import { ASTRO_WEIGHTS } from '../../astro/config';

afterEach(cleanup);

describe('score views', () => {
  it('renders translated reasons with polarity and localized numbers', () => {
    renderWithI18n(
      <ReasonList
        reasons={[
          {
            code: 'moon.bright',
            polarity: 'negative',
            weight: 1,
            params: { illum: 92, sep: 31, delta: 2.345 },
          },
          { code: 'framing.excellent', polarity: 'positive', weight: 1, params: { focal: 200 } },
        ]}
      />,
    );
    expect(
      screen.getByText(/Bright Moon: 92% lit, 31° away — sky brightened by 2.3 mag/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Excellent framing at ~200 mm/)).toBeInTheDocument();
  });
  it('renders in Turkish', () => {
    renderWithI18n(<ClassBadge cls="worth-trying" />, 'tr');
    expect(screen.getByText('Denemeye Değer')).toBeInTheDocument();
  });
  it('exposes the score accessibly', () => {
    renderWithI18n(<ScoreRing score={86} cls="recommended" label="Astro Score" />);
    expect(screen.getByRole('img', { name: 'Astro Score: 86' })).toBeInTheDocument();
  });
  it('shows confidence and component breakdown', () => {
    const comps = Object.fromEntries(
      Object.keys(ASTRO_WEIGHTS).map((k) => [k, { score: 50, weight: 0.1 }]),
    ) as never;
    renderWithI18n(
      <>
        <ConfidenceBadge level="low" factors={['sbAssumed']} />
        <ComponentBreakdown components={comps} />
      </>,
    );
    expect(screen.getByText('Confidence: Low')).toBeInTheDocument();
    expect(screen.getByText('Moon impact')).toBeInTheDocument();
  });
});

describe('altitude chart', () => {
  it('draws target, moon and darkness', () => {
    const times = Array.from({ length: 10 }, (_, i) => Date.UTC(2026, 9, 10, 17 + i));
    const { container } = renderWithI18n(
      <AltitudeChart
        times={times}
        targetAlt={times.map((_, i) => 10 + i * 8)}
        moonAlt={times.map(() => -5)}
        dark={times.map((_, i) => (i > 2 && i < 8 ? 1 : 0))}
        minAltDeg={25}
      />,
    );
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('img', { name: 'Altitude during the night' })).toBeInTheDocument();
  });
});

describe('form controls', () => {
  it('number input parses values and clears to null', () => {
    const onChange = vi.fn();
    function Harness() {
      const [v, setV] = useState<number | null>(null);
      return (
        <Field label="Focal">
          {(id) => (
            <NumberInput
              id={id}
              value={v}
              onChange={(x) => {
                setV(x);
                onChange(x);
              }}
            />
          )}
        </Field>
      );
    }
    renderWithI18n(<Harness />);
    const input = screen.getByLabelText('Focal');
    fireEvent.change(input, { target: { value: '5.6' } });
    expect(onChange).toHaveBeenLastCalledWith(5.6);
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
  it('segmented control reports selection and pressed state', () => {
    const onChange = vi.fn();
    renderWithI18n(
      <Segmented
        label="Mode"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
