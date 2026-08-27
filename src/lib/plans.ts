// Every paid feature is gated through one function reading one table. Scatter
// plan checks through the codebase and repackaging becomes a rewrite.

export type Plan = "free" | "lite" | "pro";

/** What the customer is charged on. Not a plan — the same plan has both. */
export type BillingPeriod = "monthly" | "yearly";

export type Feature =
  | "page_analytics"     // per-page dwell heatmap
  | "open_notifications" // the "someone opened it" email
  | "password"
  | "expiry"
  | "block_download"
  | "hide_badge"
  | "versioning";

// Lite and Pro unlock the same shipped features today. The Pro card sells team
// spaces, watermarks, custom domains and an API on top — none of which exist
// yet, so none of them appear here. Naming the shared list once rather than
// copying it into both rows is what stops the two drifting apart the first time
// a feature is added to one of them.
const PAID_FEATURES: Feature[] = [
  "page_analytics", "open_notifications", "password",
  "expiry", "block_download", "hide_badge", "versioning",
];

const LIMITS: Record<Plan, { features: Feature[]; activeLinks: number | null }> = {
  free: {
    // Free is useful on purpose, and note what is NOT listed here: the
    // browser-side tools. Merge, split and rotate are free and unlimited for
    // everyone forever, so they never reach this table at all — putting the
    // acquisition surface behind a paywall would be charging for the thing
    // that brings people in. What free does not get is the answer to "who
    // read it", which is where the paywall belongs. See docs/vision.md.
    features: [],
    activeLinks: 5,
  },
  lite: { features: PAID_FEATURES, activeLinks: null },
  pro: { features: PAID_FEATURES, activeLinks: null },
};

type PlanHolder = { plan?: string | null } | null | undefined;

export function planOf(user: PlanHolder): Plan {
  const plan = user?.plan;
  return plan === "lite" || plan === "pro" ? plan : "free";
}

export function can(user: PlanHolder, feature: Feature): boolean {
  return LIMITS[planOf(user)].features.includes(feature);
}

/** null means unlimited. */
export function activeLinkLimit(user: PlanHolder): number | null {
  return LIMITS[planOf(user)].activeLinks;
}

// Yearly is quoted as a monthly figure because that is the number people
// compare. The note carries the honesty: it is billed once, twelve at a time.
export const PRICING = {
  lite: {
    label: "Lite",
    monthly: { amount: "$3", note: "per month" },
    yearly: { amount: "$2", note: "per month, billed yearly" },
  },
  pro: {
    label: "Pro",
    monthly: { amount: "$12", note: "per month" },
    yearly: { amount: "$8", note: "per month, billed yearly" },
  },
} as const;
