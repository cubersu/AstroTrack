import { useRef, useState } from 'react';
import { useApp } from '../../app/AppState';
import type { MoonTolerance, ScoringSettings, WeatherSensitivity } from '../../astro/config';
import { DEFAULT_SCORING_SETTINGS, SETTINGS_LIMITS } from '../../astro/config';
import type { TrailingTolerance } from '../../astro/npf';
import { listPackStates } from '../../data/packs';
import { downloadText, exportBackup, importBackup } from '../../db/backup';
import type { ThemeName } from '../../db/types';
import type { Language } from '../../i18n/i18n';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import { Checkbox, Field, NumberInput, Segmented } from '../../ui/controls';
import { useToast } from '../../ui/toast';

export function SettingsPage() {
  const { t } = useI18n();
  const app = useApp();
  const toast = useToast();
  const s = app.settings;
  const sc = s.scoring;
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'replace' | 'merge'>('merge');
  const [srcUrl, setSrcUrl] = useState(s.dataSourceUrl ?? '');
  const setScoring = (patch: Partial<ScoringSettings>) =>
    void app.update({ scoring: { ...sc, ...patch } });
  const numField = (
    label: TKey,
    key: 'minAltitudeDeg' | 'preferredAltitudeDeg' | 'minTargetPx' | 'extinctionK',
    lim: readonly [number, number],
    step: number,
  ) => (
    <Field label={t(label)} hint={`${lim[0]}–${lim[1]}`}>
      {(id) => (
        <NumberInput
          id={id}
          value={sc[key]}
          min={lim[0]}
          max={lim[1]}
          step={step}
          onChange={(v) => v !== null && setScoring({ [key]: v } as Partial<ScoringSettings>)}
        />
      )}
    </Field>
  );
  return (
    <div>
      <div className="page-header">
        <h1>{t('settings.title')}</h1>
      </div>
      <section className="card">
        <h2>{t('settings.general')}</h2>
        <div className="form-grid">
          <Field label={t('lang.label')}>
            {(id) => (
              <select
                id={id}
                value={s.language ?? ''}
                onChange={(e) =>
                  void app.update({ language: (e.target.value || null) as Language | null })
                }
              >
                <option value="">{t('lang.auto')}</option>
                <option value="en">{t('lang.en')}</option>
                <option value="tr">{t('lang.tr')}</option>
              </select>
            )}
          </Field>
          <div className="field">
            <span className="label">{t('theme.label')}</span>
            <Segmented<ThemeName>
              label={t('theme.label')}
              value={s.theme}
              onChange={(v) => void app.update({ theme: v })}
              options={(['light', 'dark', 'night'] as const).map((v) => ({
                value: v,
                label: t(`theme.${v}` as TKey),
              }))}
            />
            <span className="hint">{t('theme.nightHint')}</span>
          </div>
          <Checkbox
            checked={s.nightVisionSuggest}
            onChange={(v) => void app.update({ nightVisionSuggest: v })}
          >
            {t('session.nightVisionSuggest')}
          </Checkbox>
        </div>
      </section>
      <section className="card">
        <h2>{t('settings.privacy')}</h2>
        <div className="stack">
          <Checkbox
            checked={s.weatherEnabled === true}
            onChange={(v) => void app.update({ weatherEnabled: v })}
          >
            {t('settings.weatherEnabled')}
          </Checkbox>
          <p className="tiny faint">{t('weather.askBody')}</p>
          <Checkbox
            checked={s.previewsEnabled}
            onChange={(v) => void app.update({ previewsEnabled: v })}
          >
            {t('settings.previewsEnabled')}
          </Checkbox>
          <p className="tiny faint">{t('settings.previewsHint')}</p>
        </div>
      </section>
      <section className="card">
        <h2>{t('settings.advanced')}</h2>
        <p className="tiny faint">{t('settings.advancedHint')}</p>
        <div className="form-grid">
          {numField('settings.minAlt', 'minAltitudeDeg', SETTINGS_LIMITS.minAltitudeDeg, 1)}
          {numField(
            'settings.prefAlt',
            'preferredAltitudeDeg',
            SETTINGS_LIMITS.preferredAltitudeDeg,
            1,
          )}
          <Field
            label={t('settings.minFill')}
            hint={`${SETTINGS_LIMITS.minFrameFill[0] * 100}–${SETTINGS_LIMITS.minFrameFill[1] * 100}`}
          >
            {(id) => (
              <NumberInput
                id={id}
                value={Math.round(sc.minFrameFill * 1000) / 10}
                step={0.1}
                onChange={(v) => v !== null && setScoring({ minFrameFill: v / 100 })}
              />
            )}
          </Field>
          {numField('settings.minPx', 'minTargetPx', SETTINGS_LIMITS.minTargetPx, 1)}
          <div className="field">
            <span className="label">{t('settings.moonTolerance')}</span>
            <Segmented<MoonTolerance>
              label={t('settings.moonTolerance')}
              value={sc.moonTolerance}
              onChange={(v) => setScoring({ moonTolerance: v })}
              options={[
                { value: 'strict', label: t('settings.tolStrict') },
                { value: 'normal', label: t('settings.tolNormal') },
                { value: 'relaxed', label: t('settings.tolRelaxed') },
              ]}
            />
          </div>
          <div className="field">
            <span className="label">{t('settings.weatherSensitivity')}</span>
            <Segmented<WeatherSensitivity>
              label={t('settings.weatherSensitivity')}
              value={sc.weatherSensitivity}
              onChange={(v) => setScoring({ weatherSensitivity: v })}
              options={[
                { value: 'strict', label: t('settings.tolStrict') },
                { value: 'normal', label: t('settings.tolNormal') },
                { value: 'relaxed', label: t('settings.tolRelaxed') },
              ]}
            />
          </div>
          <div className="field">
            <span className="label">{t('settings.trailing')}</span>
            <Segmented<TrailingTolerance>
              label={t('settings.trailing')}
              value={sc.trailingTolerance}
              onChange={(v) => setScoring({ trailingTolerance: v })}
              options={(['safe', 'balanced', 'aggressive'] as const).map((v) => ({
                value: v,
                label: t(`recipe.tolerance.${v}` as TKey),
              }))}
            />
          </div>
          {numField('settings.extinction', 'extinctionK', SETTINGS_LIMITS.extinctionK, 0.01)}
          <fieldset className="full" style={{ border: 'none', padding: 0 }}>
            <legend className="small muted">{t('settings.thresholds')}</legend>
            <div className="row">
              {(
                [
                  ['recommended', 'settings.thRecommended'],
                  ['worthTrying', 'settings.thWorth'],
                  ['difficult', 'settings.thDifficult'],
                ] as const
              ).map(([k, label]) => (
                <Field key={k} label={t(label)}>
                  {(id) => (
                    <NumberInput
                      id={id}
                      value={sc.classThresholds[k]}
                      min={1}
                      max={100}
                      step={1}
                      onChange={(v) =>
                        v !== null &&
                        setScoring({ classThresholds: { ...sc.classThresholds, [k]: v } })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
          </fieldset>
        </div>
        <button
          type="button"
          className="btn"
          style={{ marginTop: '0.5rem' }}
          onClick={() => void app.update({ scoring: DEFAULT_SCORING_SETTINGS })}
        >
          {t('settings.resetAdvanced')}
        </button>
      </section>
      <section className="card">
        <h2>{t('settings.backup')}</h2>
        <p className="small muted">{t('settings.backupHint')}</p>
        <div className="row">
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              const packs = (await listPackStates()).map((p) => ({
                id: p.id,
                version: p.activeVersion,
                installedAt: p.installedAt,
              }));
              const b = await exportBackup(packs, __APP_VERSION__);
              downloadText(
                `astrotrack-backup-${new Date().toISOString().slice(0, 10)}.json`,
                JSON.stringify(b, null, 1),
              );
            }}
          >
            {t('settings.exportBackup')}
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            {t('settings.importBackup')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const res = await importBackup(JSON.parse(await f.text()), mode);
                const count = Object.values(res.counts).reduce((a, b) => a + (b ?? 0), 0);
                toast(t('settings.importDone', { count }));
              } catch (err) {
                toast(t('settings.importFailed', { error: (err as Error).message }));
              }
            }}
          />
        </div>
        <div className="field" style={{ marginTop: '0.5rem' }}>
          <span className="label">{t('settings.importMode')}</span>
          <Segmented<'replace' | 'merge'>
            label={t('settings.importMode')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'merge', label: t('settings.importMerge') },
              { value: 'replace', label: t('settings.importReplace') },
            ]}
          />
        </div>
      </section>
      <section className="card">
        <h2>{t('settings.dataSource')}</h2>
        <p className="tiny faint">{t('settings.dataSourceHint')}</p>
        <div className="row">
          <input
            type="url"
            value={srcUrl}
            placeholder="https://…/data/"
            onChange={(e) => setSrcUrl(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => void app.update({ dataSourceUrl: srcUrl.trim() || null })}
          >
            {t('common.save')}
          </button>
        </div>
      </section>
      <section className="card">
        <h2>{t('settings.about')}</h2>
        <p className="small">{t('settings.aboutBody')}</p>
        <p className="tiny faint">{t('settings.version', { version: __APP_VERSION__ })}</p>
      </section>
    </div>
  );
}
