// Usa la configuración raíz sin las exclusiones de proyectos, aplicada a los fixtures.
import base from '../../eslint.config.mjs';
import angular from 'angular-eslint';

export default [
  ...base,
  ...angular.configs.templateRecommended.map((c) => ({ ...c, files: ['**/*.html'] })),
];
