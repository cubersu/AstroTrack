/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserDb, setUserDbForTests } from '../../db/userDb';

vi.mock('../../app/catalogClient', () => ({
  initCatalogue: () => new Promise(() => {}),
  catalogApi: () => ({}),
  catalogWithProgress: () => () => new Promise(() => {}),
  reloadCatalogue: async () => ({}),
}));

import { AppStateProvider } from '../../app/AppState';
import { I18nProvider } from '../../i18n/i18n';
import { ToastProvider } from '../../ui/toast';
import { PlanDetailPage } from '../plans/PlanDetailPage';
import { SessionPage } from './SessionPage';

afterEach(cleanup);
beforeEach(() => setUserDbForTests(new UserDb(`session-${Math.random()}`)));

function ui(children: React.ReactNode) {
  return render(
    <AppStateProvider>
      <I18nProvider lang="en">
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </AppStateProvider>,
  );
}

describe('empty states backed by single-row live queries', () => {
  it('shows the "no active session" state when there is no session row', async () => {
    ui(<SessionPage />);
    expect(
      await screen.findByText('No active session. Start one from a target or plan.'),
    ).toBeInTheDocument();
  });
  it('reports a missing plan instead of loading forever', async () => {
    ui(<PlanDetailPage id="does-not-exist" />);
    expect(await screen.findByText('Plan not found.')).toBeInTheDocument();
  });
});
