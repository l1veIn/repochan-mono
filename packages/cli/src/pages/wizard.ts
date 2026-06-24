// Backward-compatible module name. The old mixed Wizard/Home screen was split into:
// - GuidedWizardPage: linear onboarding flow until foundation visual anchor exists
// - HomePage: completed-project control center
export { GuidedWizardPage as WizardHost, GuidedWizardPage } from "./guided-wizard.js";
