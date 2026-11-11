/**
 * SpacePilot relational schema.
 * Every tenant-owned table carries org_id and is only ever queried with it.
 */
export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  business_type TEXT NOT NULL DEFAULT 'coworking',
  country TEXT NOT NULL DEFAULT 'US',
  currency TEXT NOT NULL DEFAULT 'USD',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  locale TEXT NOT NULL DEFAULT 'en-US',
  website TEXT,
  address TEXT,
  modules TEXT NOT NULL DEFAULT '[]',
  plan TEXT NOT NULL DEFAULT 'starter',
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  verify_token TEXT,
  is_platform_admin INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS org_members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  UNIQUE (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE,
  accepted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_monthly INTEGER NOT NULL DEFAULT 0,
  price_yearly INTEGER NOT NULL DEFAULT 0,
  property_limit INTEGER NOT NULL DEFAULT 1,
  seat_limit INTEGER NOT NULL DEFAULT 3,
  ai_credits INTEGER NOT NULL DEFAULT 50,
  features TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  period TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'active',
  seats INTEGER NOT NULL DEFAULT 3,
  ai_credits INTEGER NOT NULL DEFAULT 50,
  current_period_end TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'coworking',
  description TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  manager_id TEXT,
  image_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  floors_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS floors (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  building_id TEXT,
  floor_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'office',
  area_sqm REAL NOT NULL DEFAULT 0,
  bedrooms INTEGER NOT NULL DEFAULT 0,
  rent_amount INTEGER NOT NULL DEFAULT 0,
  rent_period TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'available',
  description TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS desks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'hot',
  hourly_rate INTEGER NOT NULL DEFAULT 0,
  daily_rate INTEGER NOT NULL DEFAULT 0,
  monthly_rate INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 4,
  hourly_rate INTEGER NOT NULL DEFAULT 0,
  amenities TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS membership_plans (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'monthly',
  description TEXT,
  room_hours INTEGER NOT NULL DEFAULT 0,
  day_passes INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  plan_id TEXT,
  plan_name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'monthly',
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  member_id TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  total_amount INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  kind TEXT NOT NULL DEFAULT 'commercial',
  unit_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leases (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  rent_amount INTEGER NOT NULL DEFAULT 0,
  billing_period TEXT NOT NULL DEFAULT 'monthly',
  deposit INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  document_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  number TEXT NOT NULL,
  counterparty_type TEXT NOT NULL DEFAULT 'tenant',
  counterparty_id TEXT,
  counterparty_name TEXT NOT NULL,
  property_id TEXT,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  subtotal INTEGER NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'sent',
  notes TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (org_id, number)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  invoice_id TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending',
  verified INTEGER NOT NULL DEFAULT 0,
  provider_ref TEXT,
  reference TEXT,
  paid_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trade TEXT,
  email TEXT,
  phone TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  property_id TEXT,
  category TEXT NOT NULL DEFAULT 'operations',
  vendor_id TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  spent_on TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS maintenance_tickets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  property_id TEXT,
  unit_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  assignee_id TEXT,
  vendor_id TEXT,
  cost INTEGER NOT NULL DEFAULT 0,
  document_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL DEFAULT 'website',
  kind TEXT NOT NULL DEFAULT 'buyer',
  owner_id TEXT,
  property_id TEXT,
  notes TEXT,
  next_follow_up TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  lead_id TEXT,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'new',
  value INTEGER NOT NULL DEFAULT 0,
  property_id TEXT,
  owner_id TEXT,
  expected_close TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',
  body TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  start_date TEXT,
  target_date TEXT,
  budget INTEGER NOT NULL DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_units (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'apartment',
  area_sqm REAL NOT NULL DEFAULT 0,
  price INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available',
  buyer_id TEXT,
  milestone_paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS buyers (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  unit_id TEXT,
  booking_status TEXT NOT NULL DEFAULT 'reserved',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT,
  title TEXT NOT NULL,
  body TEXT,
  kind TEXT NOT NULL DEFAULT 'info',
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  user_id TEXT,
  actor TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  meta TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  data BLOB NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS support_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  user_id TEXT,
  subject TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in_app',
  offset_days INTEGER NOT NULL DEFAULT 3,
  enabled INTEGER NOT NULL DEFAULT 1,
  template TEXT,
  last_run_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  automation_id TEXT,
  matched INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_members_org ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_org ON properties(org_id);
CREATE INDEX IF NOT EXISTS idx_buildings_property ON buildings(property_id);
CREATE INDEX IF NOT EXISTS idx_units_property ON units(property_id);
CREATE INDEX IF NOT EXISTS idx_units_org ON units(org_id);
CREATE INDEX IF NOT EXISTS idx_desks_property ON desks(property_id);
CREATE INDEX IF NOT EXISTS idx_rooms_property ON rooms(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_org_time ON bookings(org_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_resource ON bookings(resource_type, resource_id, start_at);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_tenants_org ON tenants(org_id);
CREATE INDEX IF NOT EXISTS idx_leases_org ON leases(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(org_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_org ON expenses(org_id);
CREATE INDEX IF NOT EXISTS idx_tickets_org ON maintenance_tickets(org_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(org_id);
CREATE INDEX IF NOT EXISTS idx_deals_org ON deals(org_id, stage);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_project_units_project ON project_units(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(org_id);
CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entity_type, entity_id);
`;
