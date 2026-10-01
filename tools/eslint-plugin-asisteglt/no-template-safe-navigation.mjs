import { getTemplateParserServices } from '@angular-eslint/utils';

/** Prohíbe `?.` en plantillas Angular: produce `undefined` (docs/08). Usar `@if (x; as y)`. */
export const noTemplateSafeNavigation = {
  meta: {
    type: 'problem',
    docs: { description: 'Sin encadenamiento opcional (?.) en plantillas.' },
    schema: [],
    messages: { forbidden: 'Sin ?. en plantillas (produce undefined); usa @if (valor; as alias).' },
  },
  create(context) {
    const parserServices = getTemplateParserServices(context);
    const report = (node) =>
      context.report({ loc: parserServices.convertNodeSourceSpanToLoc(node.sourceSpan), messageId: 'forbidden' });
    return {
      SafePropertyRead: report,
      SafeKeyedRead: report,
      SafeCall: report,
    };
  },
};
