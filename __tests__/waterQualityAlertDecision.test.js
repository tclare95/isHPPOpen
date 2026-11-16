import { assessmentMarker, decideWaterQualityRule, summariseWaterQualityDecisions } from '../libs/alerts/waterQualityAlertDecision';

const V1 = 'hpp-upstream-activity/v1';
const risk = (lowest, highest = lowest) => ({ lowest, highest, at: '2026-11-16T18:00:00.000Z' });
const existing = (extra = {}) => ({ alertKey: 'k', riskLevel: 'amber', lastConditionState: 'armed', lastEvaluatedAt: '2026-11-16T17:45:00.000Z', ...extra });
const marked = (marker, extra = {}) => existing({ ...extra, wqAssessment: { version: V1, state: extra.lastConditionState ?? 'armed', transitionId: extra.lastTransitionId ?? null, suppressUntilClear: false, ...marker } });

describe('water-quality alert decisions (RDP assessment)', () => {
  test('unavailable evidence never triggers or re-arms', () => {
    expect(decideWaterQualityRule(marked({}), null, V1)).toEqual({ kind: 'skip', reason: 'unavailable' });
    expect(decideWaterQualityRule(marked({}, { lastConditionState: 'triggered', lastTransitionId: 't' }), null, V1).kind).toBe('skip');
    expect(decideWaterQualityRule(existing({ riskLevel: 'purple' }), risk('red'), V1).kind).toBe('skip');
  });

  describe('switching an existing rule to the new assessment sends nothing', () => {
    test('armed and already met: enrolled and held until the new assessment clears once', () => {
      expect(decideWaterQualityRule(existing(), risk('amber'), V1)).toEqual({ kind: 'enrol', reason: 'assessment_changed', suppressUntilClear: true });
      // Undetermined (could be amber) is also held.
      expect(decideWaterQualityRule(existing(), risk('green', 'amber'), V1)).toMatchObject({ kind: 'enrol', suppressUntilClear: true });
      const held = marked({ suppressUntilClear: true });
      expect(decideWaterQualityRule(held, risk('red'), V1)).toEqual({ kind: 'unchanged', reason: 'baseline_held' });
      expect(decideWaterQualityRule(held, risk('green'), V1)).toEqual({ kind: 'advance', reason: 'baseline_cleared', suppressUntilClear: false });
      // After clearing, the next real rise notifies.
      expect(decideWaterQualityRule(marked({ suppressUntilClear: false }), risk('amber'), V1)).toMatchObject({ kind: 'trigger', value: 'amber' });
    });

    test('armed and clear: enrolled without suppression', () => {
      expect(decideWaterQualityRule(existing(), risk('green'), V1)).toEqual({ kind: 'enrol', reason: 'assessment_changed', suppressUntilClear: false });
    });

    test('triggered: enrolled, then re-armed only when the new assessment rules the level out', () => {
      const triggered = { lastConditionState: 'triggered', lastTransitionId: 't1' };
      expect(decideWaterQualityRule(existing(triggered), risk('green'), V1)).toMatchObject({ kind: 'enrol', suppressUntilClear: false });
      expect(decideWaterQualityRule(marked({}, triggered), risk('green', 'amber'), V1)).toEqual({ kind: 'unchanged' });
      expect(decideWaterQualityRule(marked({}, triggered), risk('green'), V1)).toMatchObject({ kind: 'rearm' });
    });

    test('a marker for another version or a detached marker re-enrols', () => {
      expect(decideWaterQualityRule(marked({ version: 'sewage-map-density/2026-08-31' }), risk('amber'), V1).kind).toBe('enrol');
      // Legacy evaluation triggered the rule after the marker was written: detached.
      const detached = marked({}, {});
      detached.lastConditionState = 'triggered';
      detached.lastTransitionId = 'legacy';
      expect(assessmentMarker(detached, V1)).toBeNull();
      expect(decideWaterQualityRule(detached, risk('amber'), V1).kind).toBe('enrol');
    });
  });

  test('a rule created under the new assessment behaves like any armed rule', () => {
    const fresh = { alertKey: 'k', riskLevel: 'red', lastConditionState: 'armed' };
    expect(decideWaterQualityRule(fresh, risk('red'), V1)).toMatchObject({ kind: 'trigger', value: 'red' });
    expect(decideWaterQualityRule(fresh, risk('amber', 'red'), V1)).toMatchObject({ kind: 'enrol', reason: 'new_rule' });
  });

  test('triggers on proven evidence only', () => {
    expect(decideWaterQualityRule(marked({}), risk('green', 'red'), V1)).toEqual({ kind: 'unchanged' });
    expect(decideWaterQualityRule(marked({}), risk('red'), V1)).toMatchObject({ kind: 'trigger', value: 'red' });
  });

  test('shadow summary counts decisions without changing rules', () => {
    const rules = [existing(), marked({}), marked({ suppressUntilClear: true })];
    const before = JSON.parse(JSON.stringify(rules));
    expect(summariseWaterQualityDecisions(rules, risk('amber'), V1)).toEqual({ 'enrol:assessment_changed': 1, trigger: 1, 'unchanged:baseline_held': 1 });
    expect(rules).toEqual(before);
  });
});
