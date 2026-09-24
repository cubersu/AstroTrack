/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { UserDb, setUserDbForTests, userDb } from '../../db/userDb';

vi.mock('../../app/catalogClient', () => ({
  initCatalogue: () => new Promise(() => {}),
  catalogApi: () => ({}),
  catalogWithProgress: () => () => new Promise(() => {}),
  reloadCatalogue: async () => ({}),
}));

import { AppStateProvider } from '../../app/AppState';
import { I18nProvider } from '../../i18n/i18n';
import { ToastProvider } from '../../ui/toast';
import { EquipmentPage } from './EquipmentPage';

afterEach(cleanup);
beforeEach(() => setUserDbForTests(new UserDb(`eq-${Math.random()}`)));

function ui() {
  return render(
    <AppStateProvider>
      <I18nProvider lang="en">
        <ToastProvider>
          <EquipmentPage />
        </ToastProvider>
      </I18nProvider>
    </AppStateProvider>,
  );
}

describe('Equipment page', () => {
  it('creates a camera with derived pixel pitch and persists it', async () => {
    ui();
    fireEvent.click(screen.getByRole('tab', { name: 'Cameras' }));
    fireEvent.click(screen.getByRole('button', { name: 'New camera' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test cam' } });
    fireEvent.change(screen.getByLabelText('Sensor width (mm)'), { target: { value: '22.3' } });
    fireEvent.change(screen.getByLabelText('Sensor height (mm)'), { target: { value: '14.9' } });
    fireEvent.change(screen.getByLabelText('Horizontal resolution (px)'), {
      target: { value: '6000' },
    });
    fireEvent.change(screen.getByLabelText('Vertical resolution (px)'), {
      target: { value: '4000' },
    });
    expect(dialog).toHaveTextContent('Derived pixel pitch: 3.72 µm');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect(await userDb().cameras.count()).toBe(1));
    const cam = (await userDb().cameras.toArray())[0];
    expect(cam.name).toBe('Test cam');
    expect(cam.pixelPitchUm).toBeNull();
    await screen.findByText('Test cam');
  });
  it('shows validation errors instead of saving invalid data', async () => {
    ui();
    fireEvent.click(screen.getByRole('tab', { name: 'Optics' }));
    fireEvent.click(screen.getByRole('button', { name: 'New optics' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Focal length is required.')).toBeInTheDocument();
    expect(await userDb().optics.count()).toBe(0);
  });
  it('loads the sample equipment preset as ordinary editable profiles', async () => {
    ui();
    fireEvent.click(screen.getByRole('button', { name: 'Load sample equipment' }));
    await screen.findByText('APS-C + lenses (sample)');
    expect(await userDb().optics.count()).toBe(3);
    expect((await userDb().settings.get('app'))?.activeRigId).toBeTruthy();
  });
});
