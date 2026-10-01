import { noTemplateSafeNavigation } from './no-template-safe-navigation.mjs';
import { primengControlsOnly } from './primeng-controls-only.mjs';

/** Plugin ESLint local de AsisteGLT (ver docs/08-convenciones-tipado-poo.md). */
export default {
  meta: { name: 'eslint-plugin-asisteglt', version: '0.1.0' },
  rules: {
    'primeng-controls-only': primengControlsOnly,
    'no-template-safe-navigation': noTemplateSafeNavigation,
  },
};
