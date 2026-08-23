// Every paid feature is gated through one function reading one table. Scatter
// plan checks through the codebase and repackaging becomes a rewrite.

export type Plan = "free" | "pro" | "business";

export type Feature =
  | "page_analytics"     // per-page dwell heatmap
  | "open_notifications" // the "someone opened it" email
  | "password"
  | "expiry"
  | "block_download"
  | "hide_badge"
  | "versioning"
  | "unlimited_links";

const LIMITS: Record<Plan, { features: Feature[]; activeLinks: number | null }> = {
  free: {
    // Free is useful on purpose: a link nobody can open is not a funnel.
    features: [],
    activeLinks: 5,
  },
  pro: {
    features: [
      "page_analytics", "open_notifications", "password",
      "expiry", "block_download", "hide_badge", "versioning", "unlimited_links",
    ],
    activeLinks: null,
  },
  business: {
    features: [
      "page_analytics", "open_notifications", "password",
      "expiry", "block_download", "hide_badge", "versioning", "unlimited_links",
    ],
    activeLinks: null,
  },
};

type PlanHolder = { plan?: string | null } | null | undefined;

export function planOf(user: PlanHolder): Plan {
  const plan = user?.plan;
  return plan === "pro" || plan === "business" ? plan : "free";
}

export function can(user: PlanHolder, feature: Feature): boolean {
  return LIMITS[planOf(user)].features.includes(feature);
}

/** null means unlimited. */
export function activeLinkLimit(user: PlanHolder): number | null {
  return LIMITS[planOf(user)].activeLinks;
}

export const PRICING = {
  pro: { label: "Pro", price: "$12", period: "per month" },
  business: { label: "Business", price: "$32", period: "per user, per month" },
} as const;
