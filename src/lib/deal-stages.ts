/** CRM deal pipeline stages. Kept outside the "use server" action module,
 *  which may only export async functions. */
export const DEAL_STAGES = ['new', 'contacted', 'qualified', 'viewing', 'proposal', 'negotiation', 'won', 'lost'] as const;

export type DealStage = (typeof DEAL_STAGES)[number];
