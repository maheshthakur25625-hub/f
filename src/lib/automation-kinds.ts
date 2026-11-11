/** Automation trigger kinds. Kept outside the "use server" action module,
 *  which may only export async functions. */
export const AUTOMATION_KINDS = [
  'rent_due',
  'membership_expiry',
  'lease_renewal',
  'booking_confirmation',
  'booking_cancellation',
  'payment_receipt',
  'maintenance_notice',
  'new_lead',
  'follow_up',
] as const;

export type AutomationKind = (typeof AUTOMATION_KINDS)[number];
