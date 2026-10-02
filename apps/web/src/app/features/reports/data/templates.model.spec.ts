import { NegativeStyle, NumberFormatDto, NumberScale } from '@asisteglt/shared-contracts';
import { NumberFormatter } from './templates.model';

describe('NumberFormatter', () => {
  const base: NumberFormatDto = NumberFormatter.standard();

  it('agrupa miles y redondea con los decimales pedidos', () => {
    expect(NumberFormatter.format('1234567.005', base).text).toBe('1,234,567.01');
    expect(NumberFormatter.format('12.3', { ...base, decimals: 0, thousands: false }).text).toBe('12');
  });

  it('aplica escala, prefijo y sufijo', () => {
    const thousands: NumberFormatDto = {
      ...base,
      scale: NumberScale.THOUSANDS,
      decimals: 1,
      prefix: 'Q ',
      suffix: ' mil',
    };
    expect(NumberFormatter.format('15600', thousands).text).toBe('Q 15.6 mil');
  });

  it('muestra negativos con signo o entre paréntesis y avisa para pintarlos', () => {
    expect(NumberFormatter.format('-980', base)).toEqual({ text: '-980.00', negative: true });
    expect(NumberFormatter.format('-980', { ...base, negative: NegativeStyle.PARENTHESES }).text).toBe(
      '(980.00)',
    );
    expect(NumberFormatter.format(null, base).text).toBe('—');
  });
});
