/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserDb, setUserDbForTests, userDb } from '../../db/userDb';

vi.mock('../../app/catalogClient', () => ({
  initCatalogue: () => new Promise(() => {}),
  catalogApi: () => ({}),
  catalogWithProgress: () => () => new Promise(() => {}),
  reloadCatalogue: async () => ({}),
}));

import { AppStateProvider } from '../../app/AppState';
import { DEFAULT_SETTINGS } from '../../db/settings';
import { I18nProvider } from '../../i18n/i18n';
import { OpticsPicker } from './OpticsPicker';
import type { OpticsSelection } from './opticsSelection';

afterEach(cleanup);

const ts = { createdAt: 1, updatedAt: 1 };
beforeEach(async () => {
  setUserDbForTests(new UserDb(`picker-${Math.random()}`));
  const db = userDb();
  await db.cameras.put({
    id: 'cam',
    name: 'Cam',
    sensorWidthMm: 22.3,
    sensorHeightMm: 14.9,
    resolutionX: 6000,
    resolutionY: 4000,
    pixelPitchUm: null,
    color: 'color',
    kind: 'dslr',
    modification: 'stock',
    advanced: null,
    ...ts,
  });
  const lens = { apertureMm: null, preferredFNumber: 'auto' as const, multiplier: null, ...ts };
  await db.optics.bulkPut([
    {
      id: 'zoom',
      name: 'Zoom 18–200',
      kind: 'lens',
      focalLengthMm: 18,
      focalLengthMaxMm: 200,
      fNumber: 3.5,
      fNumberAtMax: 6.3,
      ...lens,
    },
    {
      id: 'prime',
      name: 'Prime 50',
      kind: 'lens',
      focalLengthMm: 50,
      focalLengthMaxMm: null,
      fNumber: 1.8,
      fNumberAtMax: null,
      ...lens,
    },
  ]);
  await db.rigs.put({
    id: 'rig',
    name: 'Rig',
    cameraId: 'cam',
    opticsIds: ['zoom', 'prime'],
    mountId: null,
    filterIds: [],
    ...ts,
  });
  await db.settings.put({ ...DEFAULT_SETTINGS, activeRigId: 'rig', onboardingDone: true });
});

function Harness({ log }: { log: Array<OpticsSelection | null> }) {
  const [sel, setSel] = useState<OpticsSelection | null>(null);
  return (
    <OpticsPicker
      selection={sel}
      onChange={(s) => {
        log.push(s);
        setSel(s);
      }}
      current={null}
      auto={null}
    />
  );
}

function ui(log: Array<OpticsSelection | null>) {
  return render(
    <AppStateProvider>
      <I18nProvider lang="en">
        <Harness log={log} />
      </I18nProvider>
    </AppStateProvider>,
  );
}

describe('OpticsPicker', () => {
  it('lets the user pick a lens, a focal length within its zoom range and an aperture', async () => {
    const log: Array<OpticsSelection | null> = [];
    ui(log);
    const select = await screen.findByLabelText('Optics');
    expect(screen.getByRole('option', { name: 'Automatic (recommended)' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'zoom' } });
    expect(log.at(-1)).toEqual({ opticsId: 'zoom', focalLengthMm: null, fNumber: null });

    const slider = screen.getByLabelText('Focal length: 18 mm');
    expect(slider).toHaveAttribute('min', '18');
    expect(slider).toHaveAttribute('max', '200');
    fireEvent.change(slider, { target: { value: '135' } });
    expect(log.at(-1)).toEqual({ opticsId: 'zoom', focalLengthMm: 135, fNumber: null });

    // At 135 mm this variable-aperture zoom opens to ≈ f/5.8, so f/5.6 is not offered.
    const aperture = screen.getByLabelText('Aperture');
    const values = [...aperture.querySelectorAll('option')].map((o) => o.textContent);
    expect(values).not.toContain('f/5.6');
    expect(values).toContain('f/8');
    fireEvent.change(aperture, { target: { value: '8' } });
    expect(log.at(-1)).toEqual({ opticsId: 'zoom', focalLengthMm: 135, fNumber: 8 });

    fireEvent.change(select, { target: { value: '' } });
    expect(log.at(-1)).toBeNull();
    expect(screen.queryByLabelText(/Focal length/)).toBeNull();
  });

  it('shows no focal slider for a prime lens', async () => {
    const log: Array<OpticsSelection | null> = [];
    ui(log);
    fireEvent.change(await screen.findByLabelText('Optics'), { target: { value: 'prime' } });
    expect(screen.queryByLabelText(/Focal length/)).toBeNull();
    expect(screen.getByLabelText('Aperture')).toBeInTheDocument();
  });
});
