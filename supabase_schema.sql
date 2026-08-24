-- ==============================================================================
-- TBS Leave Buddy - Supabase Database Schema & Real 31 Employees Migration
-- Copy and paste this whole SQL script into Supabase SQL Editor & click RUN!
-- ==============================================================================

-- 1. Create Employees Table
CREATE TABLE IF NOT EXISTS public.employees (
    id TEXT PRIMARY KEY,
    emp_code TEXT NOT NULL,
    name TEXT NOT NULL,
    nickname TEXT NOT NULL,
    department TEXT NOT NULL,
    start_date DATE NOT NULL DEFAULT '2025-01-01',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Leave Quotas Table
CREATE TABLE IF NOT EXISTS public.leave_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id TEXT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    year INT NOT NULL DEFAULT 2026,
    annual_total FLOAT NOT NULL DEFAULT 12,
    sick_total FLOAT NOT NULL DEFAULT 30,
    personal_total FLOAT NOT NULL DEFAULT 3,
    carried_over FLOAT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_emp_year UNIQUE (employee_id, year)
);

-- 3. Create Leave Records Table
CREATE TABLE IF NOT EXISTS public.leave_records (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    employee_id TEXT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    leave_date DATE NOT NULL,
    leave_type TEXT NOT NULL CHECK (leave_type IN ('sick', 'annual', 'personal')),
    days FLOAT NOT NULL DEFAULT 1,
    note TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Approved' CHECK (status IN ('Approved', 'Pending', 'Rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS for public access
ALTER TABLE public.employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_quotas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_records DISABLE ROW LEVEL SECURITY;

-- Clear previous dummy data if any
TRUNCATE TABLE public.leave_records CASCADE;
TRUNCATE TABLE public.leave_quotas CASCADE;
TRUNCATE TABLE public.employees CASCADE;

-- Insert Real 31 Employees Data
INSERT INTO public.employees (id, emp_code, name, nickname, department, start_date) VALUES
('Uf20f36eac46e64eb83eb913b95e25da7', 'TBS-001', 'Jullapong Oobbenjasub', 'Bill', 'SEO', '2025-01-01'),
('U5740bc83fb4f964648d07ace4d1ed24b', 'TBS-002', 'RAPEEROJ POKPA', 'Julian', 'SEO', '2025-01-01'),
('U437d78a035fce09cd623650fb6c3fc97', 'TBS-003', 'Kochakorn Keitiwattanapong', 'Nam', 'Web Developer', '2025-01-01'),
('Ub8aa0964e1c37b08b80875db8f7e48c2', 'TBS-004', 'Apisara Saengma', 'Lukyor', 'SEO', '2025-01-01'),
('Uc229f2377a2b8839adab478d92c0c26f', 'TBS-005', 'Supakitt Choketanasett', 'Boom', 'Graphic', '2025-01-01'),
('U0d24d4e3cb9d54ecb7650c6f34ecdcaf', 'TBS-006', 'Kasidit Pornbuaphan', 'First', 'Content', '2025-01-01'),
('U52393c80220b57cfcdb053f911d08096', 'TBS-007', 'Apirak Sakmuneong', 'Toddy', 'SEO', '2025-01-01'),
('Ue6d9d9c8e1621d76983de40d0a977f2f', 'TBS-008', 'Thanchanok Chullao', 'Noey', 'SEO', '2025-01-01'),
('U0cec3b528edf50c24c1ff3d2ac964a36', 'TBS-009', 'Sutanai Janprasert', 'Bank', 'Web Developer', '2025-01-01'),
('U9842ee302fff0b21ecfa18a1253bbd5d', 'TBS-010', 'Kochchakorn Chaipirom', 'Bam', 'Content', '2025-01-01'),
('Ufd5897943c7034d9482c137f2642cc9b', 'TBS-011', 'Kittitaj Klomchit', 'Sumo', 'PBN', '2025-01-01'),
('Ucd25d069c7139374582c2ad5fa4ef027', 'TBS-012', 'Patsawee Prairumphueng', 'Satang', 'UX/UI Designer', '2025-01-27'),
('Ue6cb8f22f3fe81b284da3f735ab15e6e', 'TBS-013', 'Narawith Kijwongwatthana', 'Mummy', 'Web Developer', '2025-01-01'),
('Uc741092942c1040469bdb970df83cb35', 'TBS-014', 'Nattakit Kulwanidchayawong', 'Ohm', 'Web Developer', '2025-01-01'),
('Uaafbd5c22567fb57cd3cc8b156095478', 'TBS-015', 'Chaiyaporn Sirikolkarn', 'Shawn', 'SEO', '2025-01-01'),
('Uc04eac70d557f0ee640a06d1815efa1a', 'TBS-016', 'Nathan Namnuae', 'Nate', 'Graphic', '2025-01-01'),
('U6919cb09b35c8287758ad8118dd26dd2', 'TBS-017', 'Pawanrat Thepabut', 'Pemai', 'SEM', '2025-01-01'),
('Uf87e4b0b19ede92cfba9df3451c7429d', 'TBS-018', 'Alexander Lambie', 'Alex', 'SEO', '2025-01-01'),
('U62c284e79710c3cc4516fee043c871e8', 'TBS-019', 'Kemyok Kaewpim', 'Pim', 'Graphic', '2025-01-01'),
('Ud2980a8c518ce5b67100fb591a659b82', 'TBS-020', 'Aunaun Lai', 'Amber', 'SEM', '2025-01-01'),
('U92db3d60085081df116075ba254067c8', 'TBS-021', 'Chanan Tararungsun', 'Golf', 'SEM', '2025-01-01'),
('Uacebdda1d8312daa44ff79c6089c8b8b', 'TBS-022', 'Valada Homsuwan', 'Da', 'Account', '2025-01-01'),
('U2859f6f9dfdf73d35e67bf561fb8078a', 'TBS-023', 'Orathai Sangwanram', 'Orn', 'Sale', '2025-01-27'),
('U2efdb4780b5df4ea553cc1b3bc345e8b', 'TBS-024', 'Thapanat Sikhinaram', 'Parker', 'Sale', '2025-01-01'),
('U175f776d1a89b1873cfb77fdbb8999d7', 'TBS-025', 'Thanin Khunprom', 'March', 'Sale', '2025-01-01'),
('Uda2bf82cd6d24f2bc23679924880cdd6', 'TBS-026', 'Wathinee Srichan', 'Tuk', 'Account', '2025-01-01'),
('Uf83edd0005aa59b510cefc5e269dd6c7', 'TBS-027', 'Chonpipat Techarukpong', 'Winner', 'SEO', '2025-01-01'),
('U612d6eed31ddd9e30deab351a5ea6958', 'TBS-028', 'Poomporn Chaiyadej', 'Poom', 'PBN', '2025-01-01'),
('U0765b3f202e3fe055c4de77a80d1bebb', 'TBS-029', 'Satrirat Ngamgang', 'Pang', 'Sale', '2025-01-01'),
('U50b4fb8ee1bff239ddc5ffc460248e54', 'TBS-030', 'Intuon Suphannarat', 'Alice', 'Sale', '2025-01-01'),
('U35cbbabbc5eed23ef32bab65dbdd2c00', 'TBS-031', 'Pimpisuht Rattanasin', 'Pim', 'Graphic', '2025-01-01');

-- Insert Real 31 Employee Leave Quotas
INSERT INTO public.leave_quotas (employee_id, year, annual_total, sick_total, personal_total, carried_over)
SELECT id, 2026, 
  CASE WHEN id = 'Ucd25d069c7139374582c2ad5fa4ef027' THEN 14 ELSE 12 END, 
  30, 
  3, 
  CASE WHEN id = 'Ucd25d069c7139374582c2ad5fa4ef027' THEN 2 ELSE 0 END 
FROM public.employees;

-- Insert Real Initial Leave Records
INSERT INTO public.leave_records (employee_id, leave_date, leave_type, days, note, status) VALUES
('Ucd25d069c7139374582c2ad5fa4ef027', '2026-01-12', 'annual', 1, '', 'Approved'),
('Ucd25d069c7139374582c2ad5fa4ef027', '2026-01-13', 'annual', 1, '', 'Approved'),
('Ucd25d069c7139374582c2ad5fa4ef027', '2026-01-07', 'sick', 1, 'stomachache', 'Approved'),
('Ucd25d069c7139374582c2ad5fa4ef027', '2026-02-04', 'personal', 0.5, 'pm - fixing electric', 'Approved'),
('Ucd25d069c7139374582c2ad5fa4ef027', '2026-02-06', 'annual', 0.5, 'pm', 'Approved'),
('Ucd25d069c7139374582c2ad5fa4ef027', '2026-02-10', 'sick', 1, 'fever', 'Approved'),
('Ucd25d069c7139374582c2ad5fa4ef027', '2026-03-19', 'annual', 0.5, 'pm', 'Approved'),
('Ucd25d069c7139374582c2ad5fa4ef027', '2026-05-25', 'annual', 1, 'Japan', 'Approved'),
('Ucd25d069c7139374582c2ad5fa4ef027', '2026-05-26', 'annual', 1, '', 'Approved'),
('Ucd25d069c7139374582c2ad5fa4ef027', '2026-05-27', 'annual', 1, '', 'Approved'),
('U2859f6f9dfdf73d35e67bf561fb8078a', '2026-01-19', 'sick', 1, '', 'Approved'),
('U2859f6f9dfdf73d35e67bf561fb8078a', '2026-03-02', 'annual', 1, '', 'Approved'),
('U2859f6f9dfdf73d35e67bf561fb8078a', '2026-03-23', 'sick', 1, '', 'Approved'),
('U2859f6f9dfdf73d35e67bf561fb8078a', '2026-04-16', 'annual', 1, '', 'Approved'),
('U2859f6f9dfdf73d35e67bf561fb8078a', '2026-04-17', 'annual', 1, '', 'Approved'),
('U2859f6f9dfdf73d35e67bf561fb8078a', '2026-04-23', 'personal', 0.5, 'am - baby', 'Approved');
