import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../i18n/i18n';
import type { Language } from '../i18n/i18n';

export function renderWithI18n(ui: ReactElement, lang: Language = 'en') {
  return render(
    <I18nProvider lang={lang} timeZone="Europe/Istanbul">
      {ui}
    </I18nProvider>,
  );
}
