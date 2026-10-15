import {
  MAX_AMOUNT_CENTS,
  centsToNumpadDigits,
  centsToPesos,
  formatMoney,
  formatMoneyCompact,
  formatMoneyDelta,
  parseAmountToCents,
  parseNumpadDigits,
  pesosToCents,
  ratio,
  splitEvenly,
  sumMoney,
  usageRatio,
  validateAmount,
} from '../src/lib/money';

const THIN = '\u2009';

describe('parseAmountToCents', () => {
  it('parses plain peso strings without floating point drift', () => {
    expect(parseAmountToCents('85.50')).toBe(8550);
    expect(parseAmountToCents('85.5')).toBe(8550);
    expect(parseAmountToCents('85')).toBe(8500);
    expect(parseAmountToCents('0.07')).toBe(7);
    expect(parseAmountToCents('₱1,234.56')).toBe(123456);
    expect(parseAmountToCents('  7 ')).toBe(700);
  });

  it('rounds sub-centavo input down without float artefacts', () => {
    expect(parseAmountToCents('85.509')).toBe(8550);
    expect(parseAmountToCents('1.005')).toBe(100);
  });

  it('rejects junk', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('.')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('12abc')).toBeNull();
    expect(parseAmountToCents('-')).toBeNull();
  });

  it('handles negatives explicitly', () => {
    expect(parseAmountToCents('-12.34')).toBe(-1234);
  });
});

describe('numpad digits', () => {
  it('treats every digit as a centavo, like a money keypad', () => {
    expect(parseNumpadDigits('8550')).toBe(8550);
    expect(parseNumpadDigits('85')).toBe(85);
    expect(parseNumpadDigits('5')).toBe(5);
    expect(parseNumpadDigits('5.')).toBe(5);
    expect(formatMoney(parseNumpadDigits('8550')!)).toBe('₱85.50');
  });

  it('round-trips through centsToNumpadDigits', () => {
    expect(centsToNumpadDigits(parseNumpadDigits('8550')!)).toBe('8550');
    expect(centsToNumpadDigits(8550)).toBe('8550');
  });

  it('rejects empty input and absurd amounts', () => {
    expect(parseNumpadDigits('')).toBeNull();
    expect(parseNumpadDigits('99999999999')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formats the brief example', () => {
    expect(formatMoney(8550)).toBe('₱85.50');
    expect(formatMoney(880)).toBe('₱8.80');
    expect(formatMoney(0)).toBe('₱0.00');
  });

  it('groups thousands with thin spaces', () => {
    expect(formatMoney(123456789)).toBe(`₱1${THIN}234${THIN}567.89`);
    expect(formatMoney(123456789, { groupThousands: false })).toBe('₱1234567.89');
  });

  it('handles negatives with a true minus sign', () => {
    expect(formatMoney(-500)).toBe('−₱5.00');
  });

  it('can hide .00 for whole pesos', () => {
    expect(formatMoney(50000, { compactZeroDecimals: true })).toBe('₱500');
  });

  it('honours a custom currency symbol', () => {
    expect(formatMoney(500, { symbol: '$' })).toBe('$5.00');
  });

  it('never prints NaN or Infinity', () => {
    expect(formatMoney(Number.NaN)).toBe('₱0.00');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('₱0.00');
  });
});

describe('formatMoneyCompact', () => {
  it('shortens thousands and millions', () => {
    expect(formatMoneyCompact(8550)).toBe('₱85');
    expect(formatMoneyCompact(120000)).toBe('₱1.2k');
    expect(formatMoneyCompact(1000000)).toBe('₱10k');
    expect(formatMoneyCompact(123456789)).toBe('₱1.2M');
  });
});

describe('formatMoneyDelta', () => {
  it('signs only positive deltas', () => {
    expect(formatMoneyDelta(12000)).toBe(`+₱120`);
    expect(formatMoneyDelta(-12000)).toBe('−₱120');
  });
});

describe('conversion helpers', () => {
  it('round-trips pesos and cents', () => {
    expect(centsToPesos(8550)).toBe(85.5);
    expect(pesosToCents(85.5)).toBe(8550);
  });

  it('sums integer centavos exactly', () => {
    expect(sumMoney([8550, 12000, 195])).toBe(20745);
    expect(sumMoney([])).toBe(0);
  });
});

describe('validateAmount', () => {
  it('accepts 1 centavo up to ₱10,000,000', () => {
    expect(validateAmount(1).ok).toBe(true);
    expect(validateAmount(MAX_AMOUNT_CENTS).ok).toBe(true);
  });

  it('rejects zero, negatives, fractions and absurd values', () => {
    expect(validateAmount(0).ok).toBe(false);
    expect(validateAmount(-1).ok).toBe(false);
    expect(validateAmount(85.5).ok).toBe(false);
    expect(validateAmount(MAX_AMOUNT_CENTS + 1).ok).toBe(false);
  });
});

describe('ratios', () => {
  it('clamps the display ratio to 0..1', () => {
    expect(ratio(80, 100)).toBeCloseTo(0.8);
    expect(ratio(140, 100)).toBe(1);
    expect(ratio(-5, 100)).toBe(0);
    expect(ratio(10, 0)).toBe(0);
  });

  it('keeps overspend visible for the usage label', () => {
    expect(usageRatio(1120, 1000)).toBeCloseTo(1.12);
  });
});

describe('splitEvenly', () => {
  it('splits without losing or inventing centavos', () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEvenly(1000, 3).reduce((a, b) => a + b, 0)).toBe(1000);
  });
});