import { getTemplateParserServices } from '@angular-eslint/utils';

/**
 * Regla de plantillas Angular: los controles interactivos deben ser de PrimeNG.
 * Un elemento nativo solo se acepta si lleva la directiva PrimeNG equivalente.
 */
const REQUIRED_DIRECTIVES = {
  button: ['pButton'],
  input: ['pInputText', 'pPassword'],
  textarea: ['pTextarea', 'pInputTextarea'],
};

const FORBIDDEN_ELEMENTS = {
  select: 'p-select / p-multiselect / p-listbox',
  table: 'p-table / p-treetable',
  dialog: 'p-dialog / p-confirmdialog',
  progress: 'p-progressbar',
  meter: 'p-metergroup',
  details: 'p-accordion / p-panel',
  datalist: 'p-autocomplete',
};

export const primengControlsOnly = {
  meta: {
    type: 'problem',
    docs: { description: 'Los controles interactivos de las plantillas deben ser componentes o directivas de PrimeNG.' },
    schema: [],
    messages: {
      missingDirective: '<{{element}}> nativo sin directiva PrimeNG ({{directives}}). Usa el control de PrimeNG.',
      forbidden: '<{{element}}> nativo no está permitido; usa {{replacement}}.',
    },
  },
  create(context) {
    const parserServices = getTemplateParserServices(context);
    const hasAny = (element, names) =>
      [...element.attributes, ...element.inputs].some((attribute) => names.includes(attribute.name));
    return {
      'Element'(element) {
        const name = element.name.toLowerCase();
        const loc = parserServices.convertNodeSourceSpanToLoc(element.sourceSpan);
        if (Object.prototype.hasOwnProperty.call(FORBIDDEN_ELEMENTS, name)) {
          context.report({ loc, messageId: 'forbidden', data: { element: name, replacement: FORBIDDEN_ELEMENTS[name] } });
          return;
        }
        if (Object.prototype.hasOwnProperty.call(REQUIRED_DIRECTIVES, name)) {
          const directives = REQUIRED_DIRECTIVES[name];
          if (!hasAny(element, directives)) {
            context.report({ loc, messageId: 'missingDirective', data: { element: name, directives: directives.join(', ') } });
          }
        }
      },
    };
  },
};
