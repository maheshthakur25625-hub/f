'use server';

import { revalidatePath } from 'next/cache';
import { audit, one, run } from '../db';
import { allowed, requireWorkspace } from '../auth';
import { id as newId } from '../ids';
import { notify } from '../notify';
import type { ActionState } from '@/components/form';

function str(fd: FormData, k: string, fallback = ''): string {
  const v = fd.get(k);
  return v === null ? fallback : String(v).trim();
}
function cents(fd: FormData, k: string): number {
  return Math.max(0, Math.round(Number(str(fd, k) || 0) * 100));
}

export const DEAL_STAGES = ['new', 'contacted', 'qualified', 'viewing', 'proposal', 'negotiation', 'won', 'lost'] as const;

export async function createLeadAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'crm.write')) return { error: 'Your role cannot manage the CRM.' };
  const orgId = session.orgId!;
  const name = str(fd, 'name');
  const email = str(fd, 'email').toLowerCase();
  if (name.length < 2) return { error: 'Enter the lead name.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter a valid email address.' };

  const leadId = newId('led_');
  run(
    `INSERT INTO leads (id, org_id, name, email, phone, source, kind, owner_id, property_id, notes, next_follow_up, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      leadId,
      orgId,
      name,
      email,
      str(fd, 'phone') || null,
      str(fd, 'source', 'website'),
      str(fd, 'kind', 'buyer'),
      str(fd, 'owner_id') || session.userId,
      str(fd, 'property_id') || null,
      str(fd, 'notes') || null,
      str(fd, 'next_follow_up') || null,
      new Date().toISOString(),
    ],
  );
  const owner = str(fd, 'owner_id') || session.userId;
  notify({
    orgId,
    userId: owner,
    title: 'New lead assigned',
    body: `${name} (${str(fd, 'kind', 'buyer')}) came in from ${str(fd, 'source', 'website')}.`,
    kind: 'info',
    link: '/app/crm',
  });
  audit({ orgId, userId: session.userId, actor: session.name, action: 'lead.created', entityType: 'lead', entityId: leadId });
  revalidatePath('/app/crm');
  return { ok: true, message: 'Lead captured and assigned.' };
}

export async function updateLeadAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'crm.write')) return { error: 'Your role cannot manage the CRM.' };
  const id = str(fd, 'id');
  if (!one(`SELECT id FROM leads WHERE id = ? AND org_id = ?`, [id, session.orgId])) return { error: 'Lead not found.' };
  run(
    `UPDATE leads SET name = ?, email = ?, phone = ?, source = ?, kind = ?, owner_id = ?, next_follow_up = ?, notes = ? WHERE id = ? AND org_id = ?`,
    [
      str(fd, 'name'),
      str(fd, 'email').toLowerCase(),
      str(fd, 'phone') || null,
      str(fd, 'source', 'website'),
      str(fd, 'kind', 'buyer'),
      str(fd, 'owner_id') || null,
      str(fd, 'next_follow_up') || null,
      str(fd, 'notes') || null,
      id,
      session.orgId,
    ],
  );
  revalidatePath('/app/crm');
  return { ok: true, message: 'Lead updated.' };
}

export async function logActivityAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'crm.write')) return { error: 'Your role cannot manage the CRM.' };
  const entityType = str(fd, 'entity_type', 'lead');
  const entityId = str(fd, 'entity_id');
  const body = str(fd, 'body');
  if (!body) return { error: 'Write what happened before saving.' };
  const table = entityType === 'deal' ? 'deals' : 'leads';
  if (!one(`SELECT id FROM ${table} WHERE id = ? AND org_id = ?`, [entityId, session.orgId])) {
    return { error: 'Record not found.' };
  }
  run(
    `INSERT INTO activities (id, org_id, entity_type, entity_id, kind, body, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId('act_'), session.orgId, entityType, entityId, str(fd, 'kind', 'note'), body, session.userId, new Date().toISOString()],
  );
  revalidatePath('/app/crm');
  return { ok: true, message: 'Interaction logged.' };
}

export async function convertLeadAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'crm.write')) return { error: 'Your role cannot manage the CRM.' };
  const orgId = session.orgId!;
  const leadId = str(fd, 'id');
  const lead = one<{ name: string; owner_id: string; property_id: string | null }>(
    `SELECT name, owner_id, property_id FROM leads WHERE id = ? AND org_id = ?`,
    [leadId, orgId],
  );
  if (!lead) return { error: 'Lead not found.' };
  const existing = one(`SELECT id FROM deals WHERE lead_id = ? AND org_id = ?`, [leadId, orgId]);
  if (existing) return { error: 'This lead already has a deal in the pipeline.' };

  const dealId = newId('dl_');
  run(
    `INSERT INTO deals (id, org_id, lead_id, title, stage, value, property_id, owner_id, expected_close, created_at)
     VALUES (?, ?, ?, ?, 'qualified', ?, ?, ?, ?, ?)`,
    [
      dealId,
      orgId,
      leadId,
      `${lead.name} — opportunity`,
      cents(fd, 'value'),
      lead.property_id,
      lead.owner_id,
      str(fd, 'expected_close') || null,
      new Date().toISOString(),
    ],
  );
  run(
    `INSERT INTO activities (id, org_id, entity_type, entity_id, kind, body, user_id, created_at)
     VALUES (?, ?, 'deal', ?, 'stage', ?, ?, ?)`,
    [newId('act_'), orgId, dealId, 'Deal created from lead', session.userId, new Date().toISOString()],
  );
  audit({ orgId, userId: session.userId, actor: session.name, action: 'lead.converted', entityType: 'deal', entityId: dealId });
  revalidatePath('/app/crm');
  return { ok: true, message: 'Lead converted into a pipeline deal.' };
}

export async function setDealStageAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'crm.write')) return { error: 'Your role cannot manage the CRM.' };
  const orgId = session.orgId!;
  const id = str(fd, 'id');
  const stage = str(fd, 'stage');
  if (!DEAL_STAGES.includes(stage as (typeof DEAL_STAGES)[number])) return { error: 'Unknown deal stage.' };
  const deal = one<{ title: string; owner_id: string; stage: string }>(
    `SELECT title, owner_id, stage FROM deals WHERE id = ? AND org_id = ?`,
    [id, orgId],
  );
  if (!deal) return { error: 'Deal not found.' };
  run(`UPDATE deals SET stage = ? WHERE id = ? AND org_id = ?`, [stage, id, orgId]);
  run(
    `INSERT INTO activities (id, org_id, entity_type, entity_id, kind, body, user_id, created_at)
     VALUES (?, ?, 'deal', ?, 'stage', ?, ?, ?)`,
    [newId('act_'), orgId, id, `Stage moved ${deal.stage} → ${stage}`, session.userId, new Date().toISOString()],
  );
  if (stage === 'won') {
    notify({
      orgId,
      userId: deal.owner_id,
      title: 'Deal won',
      body: `${deal.title} was marked won.`,
      kind: 'success',
      link: '/app/crm',
    });
  }
  revalidatePath('/app/crm');
  return { ok: true, message: `Deal moved to ${stage}.` };
}

export async function createDealAction(_s: ActionState, fd: FormData): Promise<ActionState> {
  const session = await requireWorkspace();
  if (!allowed(session, 'crm.write')) return { error: 'Your role cannot manage the CRM.' };
  const title = str(fd, 'title');
  if (title.length < 2) return { error: 'Give the deal a title.' };
  const dealId = newId('dl_');
  run(
    `INSERT INTO deals (id, org_id, lead_id, title, stage, value, property_id, owner_id, expected_close, created_at)
     VALUES (?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)`,
    [
      dealId,
      session.orgId,
      str(fd, 'lead_id') || null,
      title,
      cents(fd, 'value'),
      str(fd, 'property_id') || null,
      str(fd, 'owner_id') || session.userId,
      str(fd, 'expected_close') || null,
      new Date().toISOString(),
    ],
  );
  revalidatePath('/app/crm');
  return { ok: true, message: 'Deal added to the pipeline.' };
}
