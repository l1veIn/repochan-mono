import { describe, expect, it } from "vitest";

import { classifyOnboardingProgress } from "../src/lib/onboarding.js";

describe("onboarding progress", () => {
  it("continues to analysis when no protocol artifact exists", () => {
    const progress = classifyOnboardingProgress({
      hasProtocol: false,
      hasAnalysis: false,
      hasPersona: false,
      hasFoundationOrder: false,
      hasFoundationResult: false,
      orderCount: 0,
      resultCount: 0,
    });

    expect(progress.complete).toBe(false);
    expect(progress.currentStep).toBe("analysis");
  });

  it("is not complete until a foundation visual result exists", () => {
    const progress = classifyOnboardingProgress({
      hasProtocol: true,
      hasAnalysis: true,
      hasPersona: true,
      hasFoundationOrder: true,
      hasFoundationResult: false,
      orderCount: 1,
      resultCount: 0,
    });

    expect(progress.complete).toBe(false);
    expect(progress.currentStep).toBe("foundation-paint");
  });

  it("is complete once the foundation result exists", () => {
    const progress = classifyOnboardingProgress({
      hasProtocol: true,
      hasAnalysis: true,
      hasPersona: true,
      hasFoundationOrder: true,
      hasFoundationResult: true,
      orderCount: 1,
      resultCount: 1,
    });

    expect(progress.complete).toBe(true);
    expect(progress.currentStep).toBe("complete");
  });
});
