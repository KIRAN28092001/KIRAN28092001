-- =====================================================================
-- Tool Connected App — demo seed data
-- Runs automatically with `supabase db reset`, or paste into the SQL editor
-- of a hosted project AFTER applying the migrations.
--
-- Every demo account uses the password:  ToolConnect#2026
-- Workflow data (requests, checkouts, transfers, returns, maintenance) is
-- produced by calling the real workflow functions as each user, so audit
-- logs, notifications and statuses are all consistent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Users (auth.users + identities; profiles are created by trigger)
-- ---------------------------------------------------------------------
create temporary table seed_users (id uuid, email text, full_name text, role text, code text, title text, phone text);
insert into seed_users values
  ('a0000000-0000-4000-8000-000000000001', 'admin@toolconnected.demo',     'Alex Morgan',      'admin',             'ADM-001',  'Operations Director', '555-0100'),
  ('a0000000-0000-4000-8000-000000000002', 'inventory@toolconnected.demo', 'Dana Whitfield',   'inventory_manager', 'INV-001',  'Tool Crib Manager',   '555-0101'),
  ('a0000000-0000-4000-8000-000000000011', 'lead.a@toolconnected.demo',    'Lead A',           'project_lead',      'LD-201',   'Superintendent',      '555-0111'),
  ('a0000000-0000-4000-8000-000000000012', 'lead.b@toolconnected.demo',    'Lead B',           'project_lead',      'LD-202',   'Superintendent',      '555-0112'),
  ('a0000000-0000-4000-8000-000000000013', 'lead.c@toolconnected.demo',    'Lead C',           'project_lead',      'LD-203',   'Superintendent',      '555-0113'),
  ('a0000000-0000-4000-8000-000000000014', 'lead.d@toolconnected.demo',    'Lead D',           'project_lead',      'LD-204',   'Superintendent',      '555-0114'),
  ('a0000000-0000-4000-8000-000000000101', 'marcus.reed@toolconnected.demo',    'Marcus Reed',      'labor', 'EMP-1001', 'Carpenter',         '555-0201'),
  ('a0000000-0000-4000-8000-000000000102', 'sofia.alvarez@toolconnected.demo',  'Sofia Alvarez',    'labor', 'EMP-1002', 'Electrician',       '555-0202'),
  ('a0000000-0000-4000-8000-000000000103', 'jamal.carter@toolconnected.demo',   'Jamal Carter',     'labor', 'EMP-1003', 'Concrete Finisher', '555-0203'),
  ('a0000000-0000-4000-8000-000000000104', 'emily.nguyen@toolconnected.demo',   'Emily Nguyen',     'labor', 'EMP-1004', 'Ironworker',        '555-0204'),
  ('a0000000-0000-4000-8000-000000000105', 'tyler.brooks@toolconnected.demo',   'Tyler Brooks',     'labor', 'EMP-1005', 'Laborer',           '555-0205'),
  ('a0000000-0000-4000-8000-000000000106', 'priya.shah@toolconnected.demo',     'Priya Shah',       'labor', 'EMP-1006', 'Surveyor',          '555-0206'),
  ('a0000000-0000-4000-8000-000000000107', 'diego.morales@toolconnected.demo',  'Diego Morales',    'labor', 'EMP-1007', 'Welder',            '555-0207'),
  ('a0000000-0000-4000-8000-000000000108', 'hannah.kim@toolconnected.demo',     'Hannah Kim',       'labor', 'EMP-1008', 'Drywall Installer', '555-0208'),
  ('a0000000-0000-4000-8000-000000000109', 'owen.patel@toolconnected.demo',     'Owen Patel',       'labor', 'EMP-1009', 'Plumber',           '555-0209'),
  ('a0000000-0000-4000-8000-000000000110', 'grace.thompson@toolconnected.demo', 'Grace Thompson',   'labor', 'EMP-1010', 'Framer',            '555-0210'),
  ('a0000000-0000-4000-8000-000000000111', 'luis.ortega@toolconnected.demo',    'Luis Ortega',      'labor', 'EMP-1011', 'Equipment Operator','555-0211'),
  ('a0000000-0000-4000-8000-000000000112', 'aisha.bello@toolconnected.demo',    'Aisha Bello',      'labor', 'EMP-1012', 'Mason',             '555-0212'),
  ('a0000000-0000-4000-8000-000000000113', 'ryan.oconnor@toolconnected.demo',   'Ryan O''Connor',   'labor', 'EMP-1013', 'Roofer',            '555-0213'),
  ('a0000000-0000-4000-8000-000000000114', 'mei.chen@toolconnected.demo',       'Mei Chen',         'labor', 'EMP-1014', 'Safety Technician', '555-0214'),
  ('a0000000-0000-4000-8000-000000000115', 'caleb.foster@toolconnected.demo',   'Caleb Foster',     'labor', 'EMP-1015', 'Carpenter',         '555-0215'),
  ('a0000000-0000-4000-8000-000000000116', 'nora.ibrahim@toolconnected.demo',   'Nora Ibrahim',     'labor', 'EMP-1016', 'Electrician',       '555-0216');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('ToolConnect#2026', extensions.gen_salt('bf')), now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', role, 'employee_code', code),
  jsonb_build_object('full_name', full_name, 'job_title', title, 'phone', phone),
  now() - interval '120 days', now(), '', '', '', ''
from seed_users
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email', now(), now(), now()
from seed_users
where not exists (select 1 from auth.identities i where i.user_id = seed_users.id);

-- ---------------------------------------------------------------------
-- 2. Projects and membership
-- ---------------------------------------------------------------------
insert into public.projects (id, code, name, description, location, status, start_date, end_date, created_by) values
  ('b0000000-0000-4000-8000-00000000000a', 'PRJ-A', 'Project A', 'Riverside Medical Center — 4-storey steel frame hospital wing', '1200 Riverside Dr, Austin, TX', 'active', current_date - 210, current_date + 300, 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-00000000000b', 'PRJ-B', 'Project B', 'Northgate Logistics Hub — tilt-up concrete warehouse', '88 Northgate Pkwy, Round Rock, TX', 'active', current_date - 150, current_date + 200, 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-00000000000c', 'PRJ-C', 'Project C', 'Lakeview Apartments — 120-unit wood-frame residential', '450 Lakeview Blvd, Cedar Park, TX', 'active', current_date - 90, current_date + 400, 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-00000000000d', 'PRJ-D', 'Project D', 'Highway 71 Bridge Rehabilitation — deck and bearing replacement', 'SH-71 at Colorado River, Bastrop, TX', 'active', current_date - 60, current_date + 180, 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-00000000000e', 'PRJ-E', 'Project E', 'Westfield School Renovation — interior fit-out and MEP upgrades', '17 Westfield Ave, Georgetown, TX', 'planning', current_date - 10, current_date + 240, 'a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.project_members (project_id, user_id, member_role) values
  -- leads
  ('b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000011', 'lead'),
  ('b0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000012', 'lead'),
  ('b0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000013', 'lead'),
  ('b0000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-000000000014', 'lead'),
  ('b0000000-0000-4000-8000-00000000000e', 'a0000000-0000-4000-8000-000000000014', 'lead'),
  -- Project A crew
  ('b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000101', 'member'),
  ('b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000102', 'member'),
  ('b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000104', 'member'),
  ('b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000107', 'member'),
  ('b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000114', 'member'),
  -- Project B crew
  ('b0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000103', 'member'),
  ('b0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000105', 'member'),
  ('b0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000111', 'member'),
  ('b0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000112', 'member'),
  ('b0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000101', 'member'),
  -- Project C crew
  ('b0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000108', 'member'),
  ('b0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000110', 'member'),
  ('b0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000113', 'member'),
  ('b0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000115', 'member'),
  ('b0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000109', 'member'),
  -- Project D crew
  ('b0000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-000000000106', 'member'),
  ('b0000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-000000000107', 'member'),
  ('b0000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-000000000111', 'member'),
  ('b0000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-000000000103', 'member'),
  ('b0000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-000000000114', 'member'),
  -- Project E crew
  ('b0000000-0000-4000-8000-00000000000e', 'a0000000-0000-4000-8000-000000000109', 'member'),
  ('b0000000-0000-4000-8000-00000000000e', 'a0000000-0000-4000-8000-000000000116', 'member'),
  ('b0000000-0000-4000-8000-00000000000e', 'a0000000-0000-4000-8000-000000000102', 'member'),
  ('b0000000-0000-4000-8000-00000000000e', 'a0000000-0000-4000-8000-000000000114', 'member'),
  ('b0000000-0000-4000-8000-00000000000e', 'a0000000-0000-4000-8000-000000000108', 'member')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. Categories
-- ---------------------------------------------------------------------
insert into public.tool_categories (name, code, description, image_url) values
  ('Drills',            'DRL', 'Cordless drill/drivers and hammer drills',          '/tools/drill.svg'),
  ('Impact Drivers',    'IMP', 'Impact drivers and impact wrenches',               '/tools/impact.svg'),
  ('Saws',              'SAW', 'Circular, reciprocating, miter, cut-off saws',      '/tools/saw.svg'),
  ('Grinders',          'GRD', 'Angle grinders and surface grinders',               '/tools/grinder.svg'),
  ('Ladders',           'LAD', 'Step, extension and multi-position ladders',        '/tools/ladder.svg'),
  ('Generators',        'GEN', 'Portable and inverter generators',                  '/tools/generator.svg'),
  ('Laser Levels',      'LSR', 'Line, rotary and point lasers',                     '/tools/laser.svg'),
  ('Welders',           'WLD', 'MIG, stick and engine-drive welders',               '/tools/welder.svg'),
  ('Compressors',       'CMP', 'Air compressors',                                   '/tools/compressor.svg'),
  ('Nail Guns',         'NLG', 'Framing, finish and brad nailers',                  '/tools/nailer.svg'),
  ('Concrete Mixers',   'MIX', 'Cement and mortar mixers',                          '/tools/mixer.svg'),
  ('Extension Cords',   'CRD', 'Heavy-duty extension cords and spider boxes',      '/tools/cord.svg'),
  ('Safety Equipment',  'SAF', 'Fall protection, respiratory and gas detection',    '/tools/safety.svg'),
  ('Measuring Tools',   'MSR', 'Tapes, laser measures, levels and wheels',          '/tools/measure.svg')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- 4. Workflow helpers (session-only)
-- ---------------------------------------------------------------------
create or replace function pg_temp.act(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_user::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create or replace function pg_temp.u(p_email_prefix text) returns uuid language sql as $$
  select id from public.profiles where email = p_email_prefix || '@toolconnected.demo'
$$;
create or replace function pg_temp.prj(p_letter text) returns uuid language sql as $$
  select id from public.projects where code = 'PRJ-' || upper(p_letter)
$$;
create or replace function pg_temp.tool(p_name text) returns uuid language sql as $$
  select id from public.parent_tools where name = p_name
$$;
create or replace function pg_temp.lead_of(p_project uuid) returns uuid language sql as $$
  select user_id from public.project_members where project_id = p_project and member_role = 'lead' limit 1
$$;

-- request -> approve -> collect, then backdate
create or replace function pg_temp.flow_checkout(p_emp text, p_tool text, p_proj text, p_reason text,
  p_days_ago int, p_due_in int) returns uuid language plpgsql as $$
declare v jsonb; v_req uuid; v_unit uuid; v_co uuid; v_lead uuid := pg_temp.lead_of(pg_temp.prj(p_proj));
begin
  perform pg_temp.act(pg_temp.u(p_emp));
  v := public.submit_tool_request(pg_temp.tool(p_tool), pg_temp.prj(p_proj), p_reason, current_date + 30, null, null);
  v_req := (v ->> 'id')::uuid;
  perform pg_temp.act(v_lead);
  perform public.decide_tool_request(v_req, true, 'Approved');
  select reserved_unit_id into v_unit from public.tool_requests where id = v_req;
  -- warehouse picks the tool (pick ticket)
  perform pg_temp.act('a0000000-0000-4000-8000-000000000002');
  perform public.pick_ticket_pick((select id from public.pick_tickets where request_id = v_req and status = 'open'),
    (select unit_code from public.tool_units where id = v_unit), null);
  perform pg_temp.act(pg_temp.u(p_emp));
  v := public.checkout_scan((select unit_code from public.tool_units where id = v_unit), null);
  v_co := (v ->> 'checkout_id')::uuid;
  update public.tool_requests set created_at = now() - make_interval(days => p_days_ago, hours => 3),
         decided_at = now() - make_interval(days => p_days_ago, hours => 2),
         fulfilled_at = now() - make_interval(days => p_days_ago, hours => 1),
         expected_return_date = current_date + p_due_in where id = v_req;
  update public.checkouts set checked_out_at = now() - make_interval(days => p_days_ago, hours => 1),
         expected_return_date = current_date + p_due_in where id = v_co;
  update public.audit_logs set created_at = now() - make_interval(days => p_days_ago, hours => 2)
   where entity_id = v_req or entity_id = v_co or (unit_id = v_unit and action in ('held_for_request'));
  update public.notifications set created_at = now() - make_interval(days => p_days_ago, hours => 2),
         is_read = p_days_ago > 2, read_at = case when p_days_ago > 2 then now() end
   where entity_id = v_req;
  return v_unit;
end $$;

-- ---------------------------------------------------------------------
-- 5. Inventory (50 parent tools) created through create_parent_tool()
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_admin uuid := 'a0000000-0000-4000-8000-000000000001';
  v_im uuid := 'a0000000-0000-4000-8000-000000000002';
begin
  perform pg_temp.act(v_im);
  for r in
    select * from (values
      -- name, brand, category, model, qty, value, supplier, home project, maint days, location
      ('M18 FUEL 1/2" Drill/Driver',        'Milwaukee',      'Drills',           '2903-20',     5,  229.00, 'Home Depot Pro',      'A', 180, 'Tool Crib A — Shelf 1'),
      ('20V MAX XR Brushless Drill',         'DeWalt',         'Drills',           'DCD791D2',    4,  199.00, 'Lowe''s Pro',          'B', 180, 'Conex B-1'),
      ('18V LXT Hammer Drill',               'Makita',         'Drills',           'XPH12Z',      3,  179.00, 'Ferguson',            'C', 180, 'Site Trailer C'),
      ('18V Brushless Hammer Drill',         'Bosch',          'Drills',           'GSB18V-535C', 2,  219.00, 'Grainger',            'D', 180, 'Main Yard — Bay 2'),
      ('M18 FUEL 1/4" Hex Impact Driver',    'Milwaukee',      'Impact Drivers',   '2953-20',     4,  169.00, 'Home Depot Pro',      'A', 180, 'Tool Crib A — Shelf 1'),
      ('ATOMIC 20V 1/2" Impact Wrench',      'DeWalt',         'Impact Drivers',   'DCF921B',     3,  189.00, 'Lowe''s Pro',          'B', 180, 'Conex B-1'),
      ('18V LXT 1/2" Impact Wrench',         'Makita',         'Impact Drivers',   'XWT08Z',      2,  259.00, 'Ferguson',            'D', 180, 'Main Yard — Bay 2'),
      ('ONE+ HP Brushless Impact Driver',    'Ryobi',          'Impact Drivers',   'PBLID02B',    3,  119.00, 'Home Depot Pro',      'C', 180, 'Site Trailer C'),
      ('FLEXVOLT 7-1/4" Circular Saw',       'DeWalt',         'Saws',             'DCS578B',     3,  249.00, 'Lowe''s Pro',          'C', 120, 'Site Trailer C'),
      ('M18 FUEL SAWZALL',                   'Milwaukee',      'Saws',             '2821-20',     3,  229.00, 'Home Depot Pro',      'A', 120, 'Tool Crib A — Shelf 2'),
      ('10" Compound Miter Saw',             'Makita',         'Saws',             'LS1040',      1,  289.00, 'Ferguson',            'C', 120, 'Site Trailer C'),
      ('14" Cut-Off Machine',                'Stihl',          'Saws',             'TS 420',      2, 1199.00, 'Stihl Dealer',        'B',  90, 'Conex B-2'),
      ('Barrel-Grip Jigsaw',                 'Bosch',          'Saws',             'JS572EBK',    2,  199.00, 'Grainger',            'E', 120, 'Westfield Storage'),
      ('Power Cutter 14" Concrete Saw',      'Husqvarna',      'Saws',             'K 770',       1, 1349.00, 'Sunbelt Rentals',     'D',  90, 'Main Yard — Bay 3'),
      ('18V LXT 4-1/2" Angle Grinder',       'Makita',         'Grinders',         'XAG04Z',      4,  149.00, 'Ferguson',            'A', 120, 'Tool Crib A — Shelf 2'),
      ('7" Large Angle Grinder',             'DeWalt',         'Grinders',         'DWE4597',     2,  189.00, 'Lowe''s Pro',          'D', 120, 'Main Yard — Bay 2'),
      ('4-1/2" Disc Grinder',                'Metabo HPT',     'Grinders',         'G12SR4',      2,   79.00, 'Grainger',            'B', 120, 'Conex B-1'),
      ('DG 150 Diamond Grinder',             'Hilti',          'Grinders',         'DG 150',      1, 1899.00, 'Hilti Center',        'B',  90, 'Conex B-2'),
      ('6'' Fiberglass Step Ladder',          'Werner',         'Ladders',          'FS106',       4,  159.00, 'Home Depot Pro',      'A', 365, 'Tool Crib A — Ladder Rack'),
      ('22'' Multi-Position Ladder',          'Little Giant',   'Ladders',          'Velocity 22', 2,  329.00, 'Grainger',            'C', 365, 'Site Trailer C'),
      ('28'' Fiberglass Extension Ladder',    'Werner',         'Ladders',          'D6228-2',     2,  389.00, 'Home Depot Pro',      'D', 365, 'Main Yard — Ladder Rack'),
      ('10'' Fiberglass Step Ladder',         'Louisville',     'Ladders',          'FS1510',      2,  239.00, 'Lowe''s Pro',          'E', 365, 'Westfield Storage'),
      ('EU2200i Inverter Generator',         'Honda',          'Generators',       'EU2200ITAN',  2, 1199.00, 'Honda Power Equip.',  'C',  90, 'Site Trailer C'),
      ('GP8000E Portable Generator',         'Generac',        'Generators',       'GP8000E',     1, 1099.00, 'Sunbelt Rentals',     'B',  90, 'Conex B-2'),
      ('4500W Dual Fuel Inverter',           'Champion',       'Generators',       '100961',      2,  899.00, 'Tractor Supply',      'D',  90, 'Main Yard — Bay 3'),
      ('3x360 Green Line Laser',             'DeWalt',         'Laser Levels',     'DW089LG',     2,  549.00, 'Lowe''s Pro',          'A', 180, 'Tool Crib A — Locked Cabinet'),
      ('REVOLVE4000 Rotary Laser',           'Bosch',          'Laser Levels',     'GRL4000-80CH',1, 1799.00, 'Grainger',            'B', 180, 'Conex B-2'),
      ('LL300N Laser Level',                 'Spectra',        'Laser Levels',     'LL300N',      1, 1599.00, 'Trimble Dealer',      'D', 180, 'Main Yard — Locked Cabinet'),
      ('PM 40-MG Multi-Line Laser',          'Hilti',          'Laser Levels',     'PM 40-MG',    1,  899.00, 'Hilti Center',        'C', 180, 'Site Trailer C'),
      ('POWER MIG 210 MP Welder',            'Lincoln Electric','Welders',         'K4195-1',     1, 1599.00, 'Airgas',              'A', 180, 'Tool Crib A — Weld Bay'),
      ('Bobcat 260 Engine Drive Welder',     'Miller',         'Welders',          '907500',      1, 6499.00, 'Airgas',              'D', 120, 'Main Yard — Bay 4'),
      ('Handler 210 MVP MIG Welder',         'Hobart',         'Welders',          '500553',      1,  999.00, 'Airgas',              'B', 180, 'Conex B-2'),
      ('8010 Ultra Quiet Air Compressor',    'California Air Tools','Compressors', '8010',        2,  329.00, 'Home Depot Pro',      'C', 180, 'Site Trailer C'),
      ('6 Gal Pancake Compressor',           'DeWalt',         'Compressors',      'DWFP55126',   2,  199.00, 'Lowe''s Pro',          'A', 180, 'Tool Crib A — Shelf 3'),
      ('Quiet Series 2.5 HP Compressor',     'Makita',         'Compressors',      'MAC2400',     1,  299.00, 'Ferguson',            'E', 180, 'Westfield Storage'),
      ('CF325XP Cordless Framing Nailer',    'Paslode',        'Nail Guns',        '905600',      3,  449.00, 'Fastenal',            'C', 180, 'Site Trailer C'),
      ('21° Plastic Collated Framing Nailer','Metabo HPT',     'Nail Guns',        'NR90AES1',    2,  229.00, 'Grainger',            'C', 180, 'Site Trailer C'),
      ('20V MAX XR 18GA Brad Nailer',        'DeWalt',         'Nail Guns',        'DCN680B',     2,  259.00, 'Lowe''s Pro',          'E', 180, 'Westfield Storage'),
      ('600DD Cement Mixer',                 'Kushlan',        'Concrete Mixers',  '600DD',       1,  899.00, 'Northern Tool',       'B', 120, 'Conex B-Yard'),
      ('Mortarman 360 Mixer',                'IMER',           'Concrete Mixers',  '1107135',     1, 3299.00, 'Sunbelt Rentals',     'D', 120, 'Main Yard — Bay 4'),
      ('100'' 12/3 SJTW Extension Cord',      'Southwire',      'Extension Cords',  '2549SW8803',  8,   89.00, 'Home Depot Pro',      'A', 365, 'Tool Crib A — Cord Rack'),
      ('50'' 10/3 Heavy Duty Cord',           'Coleman Cable',  'Extension Cords',  '02807',       6,   79.00, 'Grainger',            'B', 365, 'Conex B-1'),
      ('ExoFit NEX Fall Protection Harness', '3M',             'Safety Equipment', '1113014',    10,  329.00, 'Fastenal',            'A', 180, 'Safety Locker A'),
      ('V-Gard Full Brim Hard Hat',          'MSA',            'Safety Equipment', '475369',     12,   39.00, 'Fastenal',            'C', 365, 'Safety Locker C'),
      ('Versaflo TR-600 PAPR Kit',           '3M',             'Safety Equipment', 'TR-600-HIK',  2, 1349.00, 'Grainger',            'B', 90,  'Safety Locker B'),
      ('GasAlertMicroClip XL 4-Gas Detector','BW Technologies','Safety Equipment', 'MCXL-XWHM',   3,  699.00, 'Grainger',            'D', 30,  'Main Yard — Locked Cabinet'),
      ('FatMax 25'' Tape Measure',            'Stanley',        'Measuring Tools',  'FMHT33265',  10,   29.00, 'Home Depot Pro',      'C', null,'Site Trailer C'),
      ('DISTO D2 Laser Distance Meter',      'Leica',          'Measuring Tools',  '838725',      3,  219.00, 'Trimble Dealer',      'A', 365, 'Tool Crib A — Locked Cabinet'),
      ('48" Type 196-2 Level',               'Stabila',        'Measuring Tools',  '37448',       4,  119.00, 'Fastenal',            'C', null,'Site Trailer C'),
      ('RR300 Measuring Wheel',              'Keson',          'Measuring Tools',  'RR300N',      2,   89.00, 'Grainger',            'D', null,'Main Yard — Bay 2')
    ) as t(name, brand, cat, model, qty, val, supplier, proj, maint, loc)
  loop
    perform public.create_parent_tool(jsonb_build_object(
      'name', r.name, 'brand', r.brand,
      'category_id', (select id from public.tool_categories where name = r.cat),
      'model_number', r.model, 'quantity', r.qty, 'purchase_value', r.val,
      'purchase_date', (current_date - (200 + (r.qty * 37) % 400))::text,
      'supplier', r.supplier, 'min_stock_threshold', greatest(1, r.qty / 3),
      'maintenance_interval_days', r.maint, 'home_project_id', pg_temp.prj(r.proj),
      'storage_location', r.loc,
      'image_url', (select image_url from public.tool_categories where name = r.cat),
      'description', r.brand || ' ' || r.name || ' (' || r.model || ')'));
  end loop;

  -- serial numbers for every unit
  update public.tool_units u set serial_number = upper(left(regexp_replace(pt.brand, '[^A-Za-z]', '', 'g'), 2))
         || '-' || to_char(1000000 + abs(hashtext(u.unit_code)) % 8999999, 'FM0000000')
    from public.parent_tools pt where pt.id = u.parent_tool_id;

  -- spread creation dates over the last few months
  update public.parent_tools set created_at = now() - make_interval(days => 30 + (abs(hashtext(parent_code)) % 150));
  update public.tool_units u set created_at = pt.created_at from public.parent_tools pt where pt.id = u.parent_tool_id;
  update public.audit_logs a set created_at = u.created_at from public.tool_units u
   where a.unit_id = u.id and a.action = 'unit_created';
  update public.audit_logs a set created_at = pt.created_at from public.parent_tools pt
   where a.entity_id = pt.id and a.entity_type = 'parent_tools';
end $$;

-- ---------------------------------------------------------------------
-- 6. Workflow history
-- ---------------------------------------------------------------------
do $$
declare
  v jsonb;
  v_req uuid;
  v_unit uuid;
  v_t uuid;
  v_m uuid;
  v_code text;
begin
  -- Active checkouts (employee, tool, project, reason, days ago, due in days; negative = overdue)
  perform pg_temp.flow_checkout('marcus.reed',    'M18 FUEL 1/2" Drill/Driver',        'A', 'Install unistrut hangers level 2', 6, 8);
  perform pg_temp.flow_checkout('sofia.alvarez',  'M18 FUEL 1/2" Drill/Driver',        'A', 'Conduit strap mounting, east wing', 4, 10);
  perform pg_temp.flow_checkout('emily.nguyen',   'M18 FUEL 1/4" Hex Impact Driver',   'A', 'Deck fastening at grid C-4', 9, 5);
  perform pg_temp.flow_checkout('diego.morales',  'POWER MIG 210 MP Welder',           'A', 'Embed plate welding, stair 2', 12, -3);
  perform pg_temp.flow_checkout('mei.chen',       'GasAlertMicroClip XL 4-Gas Detector','D', 'Confined space entry monitoring', 3, 4);
  perform pg_temp.flow_checkout('emily.nguyen',   'ExoFit NEX Fall Protection Harness','A', 'Steel erection — leading edge work', 20, 40);
  perform pg_temp.flow_checkout('diego.morales',  'ExoFit NEX Fall Protection Harness','A', 'Welding at roof level', 20, 40);
  perform pg_temp.flow_checkout('marcus.reed',    '3x360 Green Line Laser',            'A', 'Layout of partition walls, level 3', 2, 5);
  perform pg_temp.flow_checkout('jamal.carter',   'DG 150 Diamond Grinder',            'B', 'Grind slab high spots before sealer', 15, -6);
  perform pg_temp.flow_checkout('tyler.brooks',   '600DD Cement Mixer',                'B', 'Grout for column base plates', 5, 2);
  perform pg_temp.flow_checkout('aisha.bello',    '14" Cut-Off Machine',               'B', 'Cut CMU for door openings', 8, -1);
  perform pg_temp.flow_checkout('luis.ortega',    '50'' 10/3 Heavy Duty Cord',          'B', 'Temp power for dock lights', 11, 20);
  perform pg_temp.flow_checkout('marcus.reed',    'ATOMIC 20V 1/2" Impact Wrench',     'B', 'Anchor bolt torqueing', 7, 7);
  perform pg_temp.flow_checkout('grace.thompson', 'CF325XP Cordless Framing Nailer',   'C', 'Framing building 2 second floor', 10, 4);
  perform pg_temp.flow_checkout('caleb.foster',   'CF325XP Cordless Framing Nailer',   'C', 'Shear wall nailing', 10, 4);
  perform pg_temp.flow_checkout('ryan.oconnor',   'CF325XP Cordless Framing Nailer',   'C', 'Roof sheathing', 6, 6);
  perform pg_temp.flow_checkout('hannah.kim',     '22'' Multi-Position Ladder',         'C', 'Stairwell drywall', 3, 9);
  perform pg_temp.flow_checkout('owen.patel',     'FLEXVOLT 7-1/4" Circular Saw',      'C', 'Blocking for plumbing walls', 14, -4);
  perform pg_temp.flow_checkout('caleb.foster',   'EU2200i Inverter Generator',        'C', 'Power for remote building pad', 4, 3);
  perform pg_temp.flow_checkout('priya.shah',     'LL300N Laser Level',                'D', 'Bridge deck grade checks', 9, 12);
  perform pg_temp.flow_checkout('luis.ortega',    'Bobcat 260 Engine Drive Welder',    'D', 'Bearing plate repairs', 18, -2);
  perform pg_temp.flow_checkout('jamal.carter',   'Power Cutter 14" Concrete Saw',     'D', 'Deck joint saw cutting', 2, 3);
  perform pg_temp.flow_checkout('owen.patel',     'Quiet Series 2.5 HP Compressor',    'E', 'Blowing out water lines', 1, 6);
  perform pg_temp.flow_checkout('nora.ibrahim',   '20V MAX XR 18GA Brad Nailer',       'E', 'Classroom trim install', 2, 12);
  perform pg_temp.flow_checkout('sofia.alvarez',  'DISTO D2 Laser Distance Meter',     'A', 'Measure cable tray runs', 5, 9);

  -- Single-unit tool fully out -> next request is approved but waitlisted
  perform pg_temp.act(pg_temp.u('marcus.reed'));
  v := public.submit_tool_request(pg_temp.tool('POWER MIG 210 MP Welder'), pg_temp.prj('A'),
         'Fabricate guardrail brackets', current_date + 5, 'Need it once Diego is done', null);
  perform pg_temp.act(pg_temp.u('lead.a'));
  perform public.decide_tool_request((v ->> 'id')::uuid, true, 'OK — you are next in line');

  -- Queued pending request (no unit free)
  perform pg_temp.act(pg_temp.u('ryan.oconnor'));
  v := public.submit_tool_request(pg_temp.tool('Power Cutter 14" Concrete Saw'), pg_temp.prj('C'),
         'Cut sidewalk control joints', current_date + 3, null, null);

  -- Pending approvals (unit held while waiting)
  perform pg_temp.act(pg_temp.u('sofia.alvarez'));
  perform public.submit_tool_request(pg_temp.tool('18V LXT 4-1/2" Angle Grinder'), pg_temp.prj('A'),
         'Cut threaded rod for trapeze hangers', current_date + 4, null, null);
  perform pg_temp.act(pg_temp.u('mei.chen'));
  perform public.submit_tool_request(pg_temp.tool('6'' Fiberglass Step Ladder'), pg_temp.prj('A'),
         'Inspect sprinkler heads, level 1', current_date + 2, null, null);
  perform pg_temp.act(pg_temp.u('tyler.brooks'));
  perform public.submit_tool_request(pg_temp.tool('Versaflo TR-600 PAPR Kit'), pg_temp.prj('B'),
         'Silica dust — slab grinding support', current_date + 7, 'Need medium/large hood', null);
  perform pg_temp.act(pg_temp.u('hannah.kim'));
  perform public.submit_tool_request(pg_temp.tool('8010 Ultra Quiet Air Compressor'), pg_temp.prj('C'),
         'Finish nailer for corner bead', current_date + 6, null, null);
  perform pg_temp.act(pg_temp.u('priya.shah'));
  perform public.submit_tool_request(pg_temp.tool('RR300 Measuring Wheel'), pg_temp.prj('D'),
         'Measure approach slab lengths', current_date + 1, null, null);
  perform pg_temp.act(pg_temp.u('nora.ibrahim'));
  perform public.submit_tool_request(pg_temp.tool('Barrel-Grip Jigsaw'), pg_temp.prj('E'),
         'Cut openings for floor boxes', current_date + 3, null, null);

  -- Approved: one picked & ready for pickup, one still waiting on the warehouse pick
  perform pg_temp.act(pg_temp.u('jamal.carter'));
  v := public.submit_tool_request(pg_temp.tool('18V Brushless Hammer Drill'), pg_temp.prj('D'),
         'Drill anchors for barrier rail', current_date + 5, null, null);
  perform pg_temp.act(pg_temp.u('lead.d'));
  perform public.decide_tool_request((v ->> 'id')::uuid, true, 'Pick up at Main Yard Bay 2');
  perform pg_temp.act(pg_temp.u('inventory'));
  perform public.pick_ticket_pick((select id from public.pick_tickets where request_id = (v ->> 'id')::uuid and status = 'open'),
    (select u.unit_code from public.tool_units u join public.tool_requests r on r.reserved_unit_id = u.id where r.id = (v ->> 'id')::uuid),
    'Staged on the Bay 2 pickup shelf');
  perform pg_temp.act(pg_temp.u('grace.thompson'));
  v := public.submit_tool_request(pg_temp.tool('48" Type 196-2 Level'), pg_temp.prj('C'),
         'Window rough opening checks', current_date + 3, null, null);
  perform pg_temp.act(pg_temp.u('lead.c'));
  perform public.decide_tool_request((v ->> 'id')::uuid, true, null);

  -- Rejected
  perform pg_temp.act(pg_temp.u('tyler.brooks'));
  v := public.submit_tool_request(pg_temp.tool('REVOLVE4000 Rotary Laser'), pg_temp.prj('B'),
         'Check slab flatness', current_date + 10, null, null);
  perform pg_temp.act(pg_temp.u('lead.b'));
  perform public.decide_tool_request((v ->> 'id')::uuid, false, 'Surveyor is handling flatness checks this week — use the 4 ft level.');

  -- Completed + reviewed transfer
  v_unit := pg_temp.flow_checkout('marcus.reed', 'M18 FUEL SAWZALL', 'A', 'Demo of temporary walls', 8, 6);
  select unit_code into v_code from public.tool_units where id = v_unit;
  perform pg_temp.act(pg_temp.u('marcus.reed'));
  v := public.initiate_transfer(v_code, pg_temp.u('emily.nguyen'), pg_temp.prj('A'), 'Emily needs it for metal stud cuts', 'good', 'Blade is new', '{}');
  v_t := (v ->> 'id')::uuid;
  perform pg_temp.act(pg_temp.u('emily.nguyen'));
  perform public.acknowledge_transfer(v_t, true, v_code, 'Received at gang box 3');
  perform pg_temp.act(pg_temp.u('lead.a'));
  perform public.review_transfer(v_t, 'approved', 'Good handoff');
  update public.transfers set created_at = now() - interval '2 days', completed_at = now() - interval '2 days' + interval '20 minutes' where id = v_t;

  -- Pending transfer awaiting acknowledgment
  select u.unit_code into v_code from public.tool_units u join public.parent_tools p on p.id = u.parent_tool_id
   where p.name = 'CF325XP Cordless Framing Nailer' and u.current_holder_id = pg_temp.u('grace.thompson');
  perform pg_temp.act(pg_temp.u('grace.thompson'));
  perform public.initiate_transfer(v_code, pg_temp.u('hannah.kim'), pg_temp.prj('C'), 'Hannah taking over blocking on level 2', 'fair', 'Depth adjuster sticks slightly', '{}');

  -- Flagged transfer
  select u.unit_code into v_code from public.tool_units u join public.parent_tools p on p.id = u.parent_tool_id
   where p.name = '50'' 10/3 Heavy Duty Cord' and u.current_holder_id = pg_temp.u('luis.ortega');
  perform pg_temp.act(pg_temp.u('luis.ortega'));
  v := public.initiate_transfer(v_code, pg_temp.u('jamal.carter'), pg_temp.prj('B'), 'Shift change', 'damaged', 'Outer jacket nicked near female end', '{}');
  v_t := (v ->> 'id')::uuid;
  perform pg_temp.act(pg_temp.u('jamal.carter'));
  perform public.acknowledge_transfer(v_t, true, null, 'Confirmed in app');
  perform pg_temp.act(pg_temp.u('lead.b'));
  perform public.review_transfer(v_t, 'flagged', 'Damaged cord should have gone back to the crib, not to another worker.');

  -- Returns: good, damaged, needs maintenance
  v_unit := pg_temp.flow_checkout('tyler.brooks', '4-1/2" Disc Grinder', 'B', 'Clean rebar ends', 12, 0);
  perform pg_temp.act(pg_temp.u('tyler.brooks'));
  perform public.return_tool((select unit_code from public.tool_units where id = v_unit), 'good', 'All good', '{}');

  v_unit := pg_temp.flow_checkout('hannah.kim', 'Barrel-Grip Jigsaw', 'E', 'Access panel cutouts', 9, 0);
  perform pg_temp.act(pg_temp.u('hannah.kim'));
  perform public.return_tool((select unit_code from public.tool_units where id = v_unit), 'damaged',
    'Base plate bent after fall from scaffold', '{}');

  v_unit := pg_temp.flow_checkout('aisha.bello', 'GP8000E Portable Generator', 'B', 'Power for mixer and lights', 10, 0);
  perform pg_temp.act(pg_temp.u('aisha.bello'));
  perform public.return_tool((select unit_code from public.tool_units where id = v_unit), 'needs_maintenance',
    'Hard to start; recoil cord fraying', '{}');

  -- Missing unit reported by inventory manager
  perform pg_temp.act(pg_temp.u('inventory'));
  select u.id into v_unit from public.tool_units u join public.parent_tools p on p.id = u.parent_tool_id
   where p.name = 'FatMax 25'' Tape Measure' and u.status = 'available' order by u.unit_number desc limit 1;
  perform public.set_unit_status(v_unit, 'missing', 'Not found during weekly tool crib audit');

  -- Completed maintenance history
  select u.id into v_unit from public.tool_units u join public.parent_tools p on p.id = u.parent_tool_id
   where p.name = 'EU2200i Inverter Generator' and u.status = 'available' limit 1;
  v_m := public.open_maintenance(v_unit, 'scheduled', '100-hour service: oil change, spark plug, air filter', 'Honda Power Equip.');
  perform public.complete_maintenance(v_m, 'Oil changed, plug replaced, filter cleaned. Load tested OK.', 85.00, true);
  update public.maintenance_records set opened_at = now() - interval '21 days', completed_at = now() - interval '19 days' where id = v_m;

  -- Scheduled maintenance currently open
  select u.id into v_unit from public.tool_units u join public.parent_tools p on p.id = u.parent_tool_id
   where p.name = 'Mortarman 360 Mixer' and u.status = 'available' limit 1;
  perform public.open_maintenance(v_unit, 'repair', 'Drum bearing noise — replace bearings', 'IMER Service');

  -- Maintenance coming due (feeds alerts)
  update public.tool_units u set next_maintenance_due = current_date - 2
    from public.parent_tools p where p.id = u.parent_tool_id and p.name = 'GasAlertMicroClip XL 4-Gas Detector'
     and u.status = 'available';
  update public.tool_units u set next_maintenance_due = current_date + 5
    from public.parent_tools p where p.id = u.parent_tool_id and p.name = '14" Cut-Off Machine';

  -- Raise overdue + maintenance-due notifications now
  perform pg_temp.act('a0000000-0000-4000-8000-000000000001');
  perform public.run_housekeeping();

  -- Seed-generated e-mail notifications should not be sent on first deploy
  update public.notifications set email_status = 'skipped' where email_status = 'pending';
end $$;

select 'Seed complete: ' || (select count(*) from public.parent_tools) || ' tools, '
  || (select count(*) from public.tool_units) || ' units, '
  || (select count(*) from public.profiles) || ' users' as result;
