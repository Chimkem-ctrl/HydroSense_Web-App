import { describe, expect, it } from 'vitest';
import { getAmmoniaAdvisory, getSalinityAdvisory } from './advisory';
import { getParameterStatus } from './status';
import { canAccessRole, validateAcknowledgeNote, validateAdvisoryRules, validateValidationTolerances } from '../validation';
import { evaluateEventImpact } from '../activity';
import { MockApiClient } from '../api/mockClient';
import { getManilaDateString, getRaisingDay } from '../format';

describe('measured status display', () => {
  it('keeps values within the safe range normal and identifies near-limit readings', () => {
    expect(getParameterStatus('temperature', 28).level).toBe('normal');
    expect(getParameterStatus('temperature', 32.2).level).toBe('warning');
    expect(getParameterStatus('do', 3).level).toBe('critical');
    expect(getParameterStatus('ph', 15)).toMatchObject({ label: 'Check probe', icon: 'warning' });
  });

  it.each([
    ['temperature', 26, 32, 25.9, 32.1],
    ['do', 4, 8, 3.9, 8.1],
    ['ph', 7.5, 8.3, 7.4, 8.4],
  ] as const)('uses the default %s bounds inclusively', (parameter, min, max, below, above) => {
    expect(getParameterStatus(parameter, min).distance).toContain('from minimum');
    expect(getParameterStatus(parameter, max).distance).toContain('from maximum');
    expect(getParameterStatus(parameter, below).distance).toContain('below minimum');
    expect(getParameterStatus(parameter, above).distance).toContain('above maximum');
  });
});

describe('advisory rules', () => {
  it.each([
    ['Rainfall', 'salinity', 'Watch'],
    ['Water change / exchange', 'salinity', 'Watch'],
    ['Freshwater dosing (log only)', 'salinity', 'Watch'],
    ['Unusually hot weather', 'ammonia', 'Watch'],
    ['Feeding', 'ammonia', 'Watch'],
    ['Mortality observation', 'ammonia', 'Watch'],
    ['Power interruption', 'ammonia', 'High'],
  ] as const)('maps %s events to %s/%s impacts', (type, targetAdvisory, riskAdjustment) => {
    expect(evaluateEventImpact({ type, scope: 'tank-a' })).toMatchObject({ targetAdvisory, riskAdjustment });
  });

  it('ignores events without an advisory mapping', () => {
    expect(evaluateEventImpact({ type: 'Other environmental event', scope: 'tank-a' })).toBeNull();
  });

  it('reports the fired salinity rule and evidence without treating it as a sensor reading', () => {
    const advisory = getSalinityAdvisory({ temperatureC: 32, rainEvent: false, freshwaterDosing: false });
    expect(advisory).toMatchObject({ kind: 'salinity', level: 'high' });
    expect(advisory.inputs).toMatchObject({ temperatureC: 32, recentRainEvent: 'no' });
    expect(advisory.firedRule).toContain('without a recent dilution event');
  });

  it('raises ammonia to watch when feeding load is high without a high pH', () => {
    expect(getAmmoniaAdvisory({ temperatureC: 29, ph: 7.2, feedingLoad: 'high' }).level).toBe('watch');
  });

  it('applies logged event impacts to salinity and ammonia advisory levels', () => {
    const events = [
      { type: 'Water change / exchange', scope: 'tank-a' },
      { type: 'Power interruption', scope: 'tank-a' },
    ];
    expect(getSalinityAdvisory({ temperatureC: 29, rainEvent: false, freshwaterDosing: false, events }))
      .toMatchObject({ level: 'watch', firedRule: expect.stringContaining('Salinity check recommended') });
    expect(getAmmoniaAdvisory({ temperatureC: 29, ph: 7.2, feedingLoad: 'usual', events }))
      .toMatchObject({ level: 'high', firedRule: expect.stringContaining('Monitor TAN levels') });
  });
});

describe('form validation and role access', () => {
  it('requires a response note and grants routes only to authorized roles', () => {
    expect(validateAcknowledgeNote('  ')).toHaveLength(1);
    expect(validateAcknowledgeNote('Checked the meter')).toHaveLength(0);
  });

  it('only grants routes to an explicitly allowed role', () => {
    expect(canAccessRole('operator', ['operator', 'admin'])).toBe(true);
    expect(canAccessRole('operator', ['admin'])).toBe(false);
    expect(canAccessRole(null, ['admin'])).toBe(false);
  });

  it('rejects invalid advisory rules and negative validation tolerances', () => {
    expect(validateAdvisoryRules({
      salinityWatchTemperatureC: 32,
      salinityHighTemperatureC: 31,
      ammoniaWatchTemperatureC: 31,
      ammoniaHighPh: 8,
    })).toHaveLength(1);
    expect(validateValidationTolerances({ temperature: 0.5, ph: 0.2, do: -1 })).toHaveLength(1);
  });
});

describe('mock tank administration', () => {
  it('registers a hardware-linked tank and prevents deleting the last tank', async () => {
    const api = new MockApiClient();
    const tank = await api.createTank({
      name: 'Larval Tank C',
      site: 'Sagay Hatchery',
      rearingStartDate: '2025-01-01',
      deviceId: 'HS-MF-003',
    }, 'Admin');
    expect((await api.listTanks()).some((item) => item.id === tank.id)).toBe(true);
    expect((await api.listDeviceStatuses()).some((item) => item.deviceId === tank.deviceId && item.online)).toBe(true);
    expect(await api.getLatestReading(tank.id)).toMatchObject({ tankId: tank.id, temperature: 30 });
    expect(await api.listAdvisories(tank.id)).toHaveLength(2);
    await api.deleteTank(tank.id, 'Admin');
    expect((await api.listTanks()).some((item) => item.id === tank.id)).toBe(false);
    await api.deleteTank('tank-b', 'Admin');
    await expect(api.deleteTank('tank-a', 'Admin')).rejects.toThrow('At least one tank must remain registered.');
  });

  it('creates corresponding legacy measurement records for advisory consumers', async () => {
    const api = new MockApiClient();
    await api.createActivityLog({
      tankId: 'tank-a',
      kind: 'OPERATION',
      type: 'Manual water quality check',
      operator: 'Operator',
      notes: 'Manual water test',
      manualReadings: { salinity: 30.2, ammonia: 0.1 },
    });
    const entries = await api.listManualEntries('tank-a');
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'refractometer_salinity', value: 30.2 }),
      expect.objectContaining({ type: 'ammonia_test_kit', value: 0.1 }),
    ]));
  });

  it('updates rule-based advisories when activity log events or rules change', async () => {
    const api = new MockApiClient();
    expect((await api.listAdvisories('tank-a')).find((item) => item.kind === 'salinity')?.level).toBe('low');
    await api.createActivityLog({
      tankId: 'tank-a',
      kind: 'ENVIRONMENT',
      type: 'Rainfall',
      operator: 'Operator',
      notes: 'Heavy rain reported',
    });
    expect((await api.listAdvisories('tank-a')).find((item) => item.kind === 'salinity')?.level).toBe('watch');
    await api.updateAdvisorySettings({
      salinityWatchTemperatureC: 29,
      salinityHighTemperatureC: 31,
      ammoniaWatchTemperatureC: 31,
      ammoniaHighPh: 7.8,
    }, 'Manager');
    expect((await api.listAdvisories('tank-a')).find((item) => item.kind === 'salinity')?.firedRule).toContain('recent water event');
  });

  it('uses activity event impacts when refreshing mock advisories', async () => {
    const api = new MockApiClient();
    await api.createActivityLog({
      tankId: 'tank-a',
      kind: 'OPERATION',
      type: 'Water change / exchange',
      operator: 'Operator',
      notes: 'Completed planned water exchange.',
      waterChangePercent: 20,
    });
    await api.createActivityLog({
      tankId: 'tank-a',
      kind: 'ENVIRONMENT',
      type: 'Power interruption',
      operator: 'Operator',
      notes: 'Power outage reported.',
    });
    const advisories = await api.listAdvisories('tank-a');
    expect(advisories.find((item) => item.kind === 'salinity')).toMatchObject({ level: 'watch' });
    expect(advisories.find((item) => item.kind === 'ammonia')).toMatchObject({ level: 'high' });
  });
});

describe('Asia/Manila date helpers', () => {
  it('uses the Manila calendar day near UTC midnight', () => {
    const at = new Date('2025-02-01T16:30:00.000Z');
    expect(getManilaDateString(at)).toBe('2025-02-02');
    expect(getRaisingDay('2025-02-02', at)).toBe(0);
  });

  it('filters mock readings by timestamp instants across UTC and Manila offsets', async () => {
    const api = new MockApiClient();
    const previousDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const from = `${getManilaDateString(previousDay)}T00:00:00+08:00`;
    const readings = await api.listReadings({ tankId: 'tank-a', from });
    expect(readings.length).toBeGreaterThan(0);
    expect(readings.every((reading) => Date.parse(reading.timestamp) >= Date.parse(from))).toBe(true);
    expect(readings.some((reading) => reading.timestamp.slice(0, 10) !== from.slice(0, 10))).toBe(true);
  });
});
