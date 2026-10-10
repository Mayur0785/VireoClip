/**
 * VIREO PHASE 27 — STATISTICAL CALCULATION ENGINE
 * Pure mathematical, deterministic module for A/B experiment evaluation.
 * No external dependencies, no mock data, no platform side-effects.
 */

import {
  ABVariant,
  ABVariantStatistics,
  ABVariantPerformanceStatus,
} from '../../types/index.js';

export interface SampleSizeParameters {
  baselineRate: number; // e.g. 0.05 (5%)
  relativeMDE: number; // e.g. 0.20 (20% relative lift -> target 0.06)
  alpha?: number; // default 0.05 (two-tailed 95% confidence)
  power?: number; // default 0.80 (80% statistical power)
}

export interface TwoProportionZTestResult {
  controlRate: number;
  challengerRate: number;
  relativeLift: number;
  pooledProportion: number;
  standardError: number;
  zScore: number;
  pValue: number;
  successFailureConditionMet: boolean;
}

export interface ExperimentEvaluationParams {
  variants: ABVariant[];
  requiredSampleSize: number;
  confidenceThreshold?: number; // default 0.95
  minPracticalLift?: number; // default 0.05 (5% relative lift)
}

/**
 * High-precision complementary error function (erfc) using
 * Abramowitz and Stegun approximation (formula 7.1.26).
 * Maximum absolute error < 1.5e-7.
 */
export function erfc(x: number): number {
  if (x < 0) return 2 - erfc(-x);
  const t = 1.0 / (1.0 + 0.3275911 * x);
  const poly =
    t *
    (0.254829592 +
      t *
        (-0.284496736 +
          t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return poly * Math.exp(-x * x);
}

/**
 * Standard Normal Cumulative Distribution Function Phi(z).
 */
export function normalCdf(z: number): number {
  return 0.5 * (1 + (z < 0 ? -1 : 1) * (1 - erfc(Math.abs(z) / Math.SQRT2)));
}

/**
 * Quantile function (inverse normal CDF) approximation (Acklam's formula).
 */
export function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) throw new Error('p must be strictly between 0 and 1 exclusive');

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];

  const LOW = 0.02425;
  const HIGH = 1 - LOW;

  if (p < LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  } else if (p <= HIGH) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
}

export class ABStatisticalEngine {
  /**
   * Calculates required sample size per variant using standard two-proportion
   * pooled formula (Evan Miller / Cochran standard).
   *
   * @param params Sample size parameters
   * @returns Required exposures per variant (integer)
   */
  public static calculateSampleSize(params: SampleSizeParameters): number {
    const { baselineRate: p1, relativeMDE, alpha = 0.05, power = 0.8 } = params;

    if (p1 <= 0 || p1 >= 1) {
      throw new Error('Baseline conversion rate must be between 0 and 1 exclusive');
    }
    if (relativeMDE <= 0) {
      throw new Error('Relative MDE must be strictly greater than 0');
    }

    const p2 = p1 * (1 + relativeMDE);
    if (p2 >= 1) {
      throw new Error('Target conversion rate exceeds 100%');
    }

    const delta = p2 - p1;
    const pBar = (p1 + p2) / 2;

    const zAlpha = Math.abs(normalQuantile(alpha / 2)); // 1.95996 for alpha=0.05
    const zBeta = Math.abs(normalQuantile(1 - power)); // 0.84162 for power=0.80

    const numerator = Math.pow(
      zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) +
        zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)),
      2
    );
    const denominator = Math.pow(delta, 2);

    return Math.ceil(numerator / denominator);
  }

  /**
   * Calculates the 95% Wilson Score Interval for descriptive uncertainty estimation.
   * Asymmetric interval bounded in [0, 1].
   */
  public static calculateWilsonInterval(
    successes: number,
    trials: number,
    confidenceLevel = 0.95
  ): [number, number] {
    if (trials <= 0) return [0, 0];
    const x = Math.max(0, successes);
    const n = trials;
    const p = x / n;

    const z = Math.abs(normalQuantile((1 - confidenceLevel) / 2));
    const z2 = z * z;

    const denom = 1 + z2 / n;
    const center = (p + z2 / (2 * n)) / denom;
    const margin =
      (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;

    const lower = Math.max(0, center - margin);
    const upper = Math.min(1, center + margin);

    return [Number(lower.toFixed(6)), Number(upper.toFixed(6))];
  }

  /**
   * Evaluates Two-Proportion Z-Test between Control and Challenger.
   */
  public static evaluateTwoProportionZTest(
    xControl: number,
    nControl: number,
    xChallenger: number,
    nChallenger: number
  ): TwoProportionZTestResult {
    if (nControl <= 0 || nChallenger <= 0) {
      return {
        controlRate: 0,
        challengerRate: 0,
        relativeLift: 0,
        pooledProportion: 0,
        standardError: 0,
        zScore: 0,
        pValue: 1.0,
        successFailureConditionMet: false,
      };
    }

    const pA = xControl / nControl;
    const pB = xChallenger / nChallenger;
    const relativeLift = pA > 0 ? (pB - pA) / pA : 0;

    // Success-Failure Condition (Rule of Thumb: np >= 5 and n(1-p) >= 5)
    const sfA = xControl >= 5 && nControl - xControl >= 5;
    const sfB = xChallenger >= 5 && nChallenger - xChallenger >= 5;
    const successFailureConditionMet = sfA && sfB;

    const pooled = (xControl + xChallenger) / (nControl + nChallenger);
    const standardError = Math.sqrt(
      pooled * (1 - pooled) * (1 / nControl + 1 / nChallenger)
    );

    if (standardError === 0) {
      return {
        controlRate: pA,
        challengerRate: pB,
        relativeLift,
        pooledProportion: pooled,
        standardError: 0,
        zScore: 0,
        pValue: 1.0,
        successFailureConditionMet,
      };
    }

    const zScore = (pB - pA) / standardError;
    // Two-tailed p-value
    const pValue = erfc(Math.abs(zScore) / Math.SQRT2);

    return {
      controlRate: Number(pA.toFixed(6)),
      challengerRate: Number(pB.toFixed(6)),
      relativeLift: Number(relativeLift.toFixed(6)),
      pooledProportion: Number(pooled.toFixed(6)),
      standardError: Number(standardError.toFixed(6)),
      zScore: Number(zScore.toFixed(4)),
      pValue: Number(Math.min(1.0, Math.max(0.0, pValue)).toFixed(6)),
      successFailureConditionMet,
    };
  }

  /**
   * Evaluates all variants in an experiment, applying:
   * 1. Multiple-comparison correction (Bonferroni)
   * 2. Sample size threshold enforcement
   * 3. Two-proportion Z-test formal decision rule
   * 4. Minimum practical lift threshold
   * 5. Wilson score descriptive intervals
   */
  public static evaluateExperiment(
    params: ExperimentEvaluationParams
  ): {
    variants: ABVariant[];
    recommendedWinnerId: string | null;
    decisionRationale: string;
  } {
    const {
      variants,
      requiredSampleSize,
      confidenceThreshold = 0.95,
      minPracticalLift = 0.05,
    } = params;

    const control = variants.find((v) => v.is_control) || variants[0];
    const challengers = variants.filter((v) => v.id !== control.id);

    // Alpha and Bonferroni correction: alpha_adjusted = alpha / k
    const alpha = 1 - confidenceThreshold;
    const k = Math.max(1, challengers.length);
    const adjustedAlpha = Number((alpha / k).toFixed(6));

    const nControl = control.observations.impressions || control.observations.views || 0;
    const xControl = control.observations.conversions || 0;
    const pControl = nControl > 0 ? xControl / nControl : 0;
    const controlCI = this.calculateWilsonInterval(xControl, nControl, confidenceThreshold);

    // Populate control stats
    const updatedControl: ABVariant = {
      ...control,
      observations: {
        ...control.observations,
        rate: Number(pControl.toFixed(6)),
      },
      statistical_metrics: {
        conversion_rate: Number(pControl.toFixed(6)),
        standard_error: 0,
        relative_lift: 0,
        z_score: 0,
        p_value: 1.0,
        adjusted_alpha: adjustedAlpha,
        is_statistically_significant: false,
        has_practical_significance: false,
        confidence_interval_95: controlCI,
        sample_size_met: nControl >= requiredSampleSize,
        success_failure_condition_met: xControl >= 5 && nControl - xControl >= 5,
      },
      performance_status: 'CONTROL',
    };

    let bestWinnerId: string | null = null;
    let maxLift = -Infinity;
    let rationale = 'Experiment in progress.';

    const updatedChallengers: ABVariant[] = challengers.map((challenger) => {
      const nChallenger =
        challenger.observations.impressions || challenger.observations.views || 0;
      const xChallenger = challenger.observations.conversions || 0;
      const pChallenger = nChallenger > 0 ? xChallenger / nChallenger : 0;
      const challengerCI = this.calculateWilsonInterval(
        xChallenger,
        nChallenger,
        confidenceThreshold
      );

      const zTest = this.evaluateTwoProportionZTest(
        xControl,
        nControl,
        xChallenger,
        nChallenger
      );

      const sampleSizeMet =
        nControl >= requiredSampleSize && nChallenger >= requiredSampleSize;
      const isStatSignificant = zTest.pValue < adjustedAlpha;
      const hasPracticalSig = zTest.relativeLift >= minPracticalLift;

      let status: ABVariantPerformanceStatus = 'INCONCLUSIVE';

      if (!sampleSizeMet || !zTest.successFailureConditionMet) {
        status = 'INSUFFICIENT_DATA';
      } else if (isStatSignificant && hasPracticalSig && zTest.zScore > 0) {
        status = 'STATISTICALLY_SIGNIFICANT_WINNER';
        if (zTest.relativeLift > maxLift) {
          maxLift = zTest.relativeLift;
          bestWinnerId = challenger.id;
          rationale = `Challenger "${challenger.name}" achieved statistically significant lift (+${(
            zTest.relativeLift * 100
          ).toFixed(1)}%, p=${zTest.pValue.toFixed(4)} < alpha=${adjustedAlpha}) with adequate sample size.`;
        }
      } else if (isStatSignificant && zTest.zScore < 0) {
        status = 'UNDERPERFORMING';
      } else if (zTest.relativeLift > 0) {
        status = 'LEADER';
      } else {
        status = 'INCONCLUSIVE';
      }

      const metrics: ABVariantStatistics = {
        conversion_rate: Number(pChallenger.toFixed(6)),
        standard_error: zTest.standardError,
        relative_lift: zTest.relativeLift,
        z_score: zTest.zScore,
        p_value: zTest.pValue,
        adjusted_alpha: adjustedAlpha,
        is_statistically_significant: isStatSignificant,
        has_practical_significance: hasPracticalSig,
        confidence_interval_95: challengerCI,
        sample_size_met: sampleSizeMet,
        success_failure_condition_met: zTest.successFailureConditionMet,
      };

      return {
        ...challenger,
        observations: {
          ...challenger.observations,
          rate: Number(pChallenger.toFixed(6)),
        },
        statistical_metrics: metrics,
        performance_status: status,
      };
    });

    if (!bestWinnerId) {
      const anyInsufficient = updatedChallengers.some(
        (c) => c.performance_status === 'INSUFFICIENT_DATA'
      );
      if (anyInsufficient || nControl < requiredSampleSize) {
        rationale = `Insufficient sample size. Required: ${requiredSampleSize.toLocaleString()} per variant. Current: Control (${nControl.toLocaleString()}).`;
      } else {
        rationale = `Observations reached sample size requirement, but no challenger achieved statistical significance at adjusted alpha ${adjustedAlpha} with practical lift >= ${(
          minPracticalLift * 100
        ).toFixed(1)}%. Result is inconclusive.`;
      }
    }

    return {
      variants: [updatedControl, ...updatedChallengers],
      recommendedWinnerId: bestWinnerId,
      decisionRationale: rationale,
    };
  }
}
