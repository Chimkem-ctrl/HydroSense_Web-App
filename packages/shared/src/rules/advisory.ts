import type { Advisory, AdvisoryRuleSettings, AdvisoryState } from '../types';
import { evaluateEventImpact } from '../activity';

export const DEFAULT_ADVISORY_RULES: AdvisoryRuleSettings = {
  salinityWatchTemperatureC: 31,
  salinityHighTemperatureC: 32,
  ammoniaWatchTemperatureC: 31,
  ammoniaHighPh: 7.8,
};

function advisoryState(
  kind: AdvisoryState['kind'],
  level: Advisory,
  inputs: AdvisoryState['inputs'],
  firedRule: string,
  updatedAt: string,
): AdvisoryState {
  return { kind, level, inputs, firedRule, updatedAt };
}

export function getSalinityAdvisory(
  inputs: { temperatureC: number; rainEvent: boolean; freshwaterDosing: boolean; events?: Array<{ type: string; scope: string }> },
  rules = DEFAULT_ADVISORY_RULES,
  updatedAt = new Date().toISOString(),
): AdvisoryState {
  const eventImpacts = [...new Set((inputs.events ?? [])
    .map(evaluateEventImpact)
    .filter((impact) => impact !== null && impact.targetAdvisory === 'salinity')
    .map((impact) => impact.message))];
  const evidence = {
    temperatureC: inputs.temperatureC,
    recentRainEvent: inputs.rainEvent ? 'yes' : 'no',
    freshwaterDosingLogged: inputs.freshwaterDosing ? 'yes' : 'no',
    ...(eventImpacts.length ? { eventImpacts: eventImpacts.join(' ') } : {}),
  };
  const eventWatch = eventImpacts.length > 0;
  if (inputs.temperatureC >= rules.salinityHighTemperatureC && !inputs.rainEvent && !inputs.freshwaterDosing) {
    return advisoryState('salinity', 'high', evidence, [`Temperature at or above ${rules.salinityHighTemperatureC}°C without a recent dilution event`, ...eventImpacts].join('. '), updatedAt);
  }
  if (inputs.temperatureC >= rules.salinityWatchTemperatureC || inputs.rainEvent || inputs.freshwaterDosing || eventWatch) {
    return advisoryState('salinity', 'watch', evidence, [
      ...(inputs.temperatureC >= rules.salinityWatchTemperatureC || inputs.rainEvent || inputs.freshwaterDosing
        ? [`Temperature at or above ${rules.salinityWatchTemperatureC}°C or a recent water event was logged`]
        : []),
      ...eventImpacts,
    ].join('. '), updatedAt);
  }
  return advisoryState('salinity', 'low', evidence, `No salinity advisory rule fired (temperature below ${rules.salinityWatchTemperatureC}°C; no recent water event)`, updatedAt);
}

export function getAmmoniaAdvisory(
  inputs: { temperatureC: number; ph: number; feedingLoad: 'usual' | 'high'; events?: Array<{ type: string; scope: string }> },
  rules = DEFAULT_ADVISORY_RULES,
  updatedAt = new Date().toISOString(),
): AdvisoryState {
  const eventImpacts = [...new Set((inputs.events ?? [])
    .map(evaluateEventImpact)
    .filter((impact) => impact !== null && impact.targetAdvisory === 'ammonia'))];
  const eventLevel: Advisory = eventImpacts.some((impact) => impact.riskAdjustment === 'High')
    ? 'high'
    : eventImpacts.length ? 'watch' : 'low';
  const eventMessages = eventImpacts.map((impact) => impact.message);
  const evidence = {
    temperatureC: inputs.temperatureC,
    ph: inputs.ph,
    feedingLoad: inputs.feedingLoad,
    ...(eventMessages.length ? { eventImpacts: eventMessages.join(' ') } : {}),
  };
  if ((inputs.ph >= rules.ammoniaHighPh && inputs.feedingLoad === 'high') || eventLevel === 'high') {
    return advisoryState('ammonia', 'high', evidence, [
      ...(inputs.ph >= rules.ammoniaHighPh && inputs.feedingLoad === 'high' ? [`pH at or above ${rules.ammoniaHighPh} with high feeding load`] : []),
      ...eventMessages,
    ].join('. '), updatedAt);
  }
  if (inputs.temperatureC >= rules.ammoniaWatchTemperatureC || inputs.ph >= rules.ammoniaHighPh || inputs.feedingLoad === 'high' || eventLevel === 'watch') {
    return advisoryState('ammonia', 'watch', evidence, [
      ...(inputs.temperatureC >= rules.ammoniaWatchTemperatureC || inputs.ph >= rules.ammoniaHighPh || inputs.feedingLoad === 'high'
        ? [`Temperature at or above ${rules.ammoniaWatchTemperatureC}°C, high pH, or high feeding load`]
        : []),
      ...eventMessages,
    ].join('. '), updatedAt);
  }
  return advisoryState('ammonia', 'low', evidence, `No ammonia advisory rule fired (temperature and pH below configured rules; usual feeding load)`, updatedAt);
}
