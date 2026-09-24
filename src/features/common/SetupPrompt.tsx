import { useApp } from '../../app/AppState';
import { createSampleEquipment } from '../../app/rig';
import { Link } from '../../app/router';
import { useI18n } from '../../i18n/i18n';
import { useToast } from '../../ui/toast';
import { sampleNames } from '../common/sampleNames';

export function SetupPrompt() {
  const { t } = useI18n();
  const app = useApp();
  const toast = useToast();
  if (app.location && app.rigInput) return null;
  return (
    <section className="card notice">
      <h2>{t('tonight.setupTitle')}</h2>
      <p className="small">{t('tonight.setupBody')}</p>
      <div className="row">
        {!app.location && (
          <Link to="/locations?new=1" className="btn primary">
            {t('tonight.setupLocation')}
          </Link>
        )}
        {!app.rigInput && (
          <>
            <Link to="/equipment" className="btn">
              {t('tonight.setupRig')}
            </Link>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await createSampleEquipment({
                  ...sampleNames(t),
                });
                toast(t('equipment.sampleLoaded'));
              }}
            >
              {t('tonight.sampleEquipment')}
            </button>
          </>
        )}
      </div>
      {!app.rigInput && (
        <p className="tiny faint" style={{ marginTop: '0.5rem' }}>
          {t('tonight.sampleEquipmentHint')}
        </p>
      )}
    </section>
  );
}
