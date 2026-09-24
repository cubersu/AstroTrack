import type { I18n } from '../../i18n/i18n';

/** Localised names for the optional sample equipment preset (ordinary, editable user data). */
export function sampleNames(t: I18n['t']) {
  return {
    camera: t('equipment.sample.camera'),
    prime: '50 mm f/1.8',
    kit: '18–55 mm f/3.5–5.6',
    zoom: '18–200 mm f/3.5–6.3',
    mount: t('equipment.sample.mount'),
    rig: t('equipment.sample.rig'),
  };
}
