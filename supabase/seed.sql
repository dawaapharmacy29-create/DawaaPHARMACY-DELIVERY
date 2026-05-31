-- Seed Data for Pharmacy Purchasing Management System

-- BRANCHES
insert into branches (name, monthly_limit, warning_percent, critical_percent) values
  ('فرع زكريا',   150000, 80, 100),
  ('فرع بيسيلة',  120000, 80, 100),
  ('فرع المنشية', 100000, 80, 100),
  ('فرع الفاروق',  80000, 80, 100)
on conflict (name) do nothing;

-- BRANCH SETTINGS
insert into branch_settings (branch_id, monthly_limit, warning_percent, critical_percent)
select id, monthly_limit, warning_percent, critical_percent from branches
on conflict (branch_id) do nothing;

-- SUPPLIERS
insert into suppliers (name, representative, phone, payment_type, credit_days) values
  ('الشركة المصرية للأدوية',  'أحمد محمد',  '01001234567', 'آجل',   30),
  ('دار الشفاء للأدوية',      'محمد علي',   '01112345678', 'آجل',   45),
  ('بيوفارما للاستيراد',      'كريم يوسف',  '01223456789', 'آجل',   60),
  ('شركة الفاروق للتوزيع',    'سامي فاروق', '01334567890', 'تقسيط', null),
  ('مجموعة النيل للصيدليات',  'سامي حسن',  '01222345678', 'كاش',   null)
on conflict do nothing;

-- PRODUCTS
insert into products (code, name, category, branch_id, supplier_id, current_stock, min_stock, max_stock, unit_price, days_since_sale, suggested_action, expiry_date)
select p.code, p.name, p.category, b.id, s.id,
  p.current_stock, p.min_stock, p.max_stock, p.unit_price,
  p.days_since_sale, p.suggested_action, p.expiry_date
from (values
  ('MORPH-10',  'مورفين 10 مج حقن',              'مخدرات',       'فرع زكريا',   'الشركة المصرية للأدوية', 50,  30, 100, 45, 0,  null::text, null::date),
  ('MID-5',     'ميدازولام 5 مج حقن',             'مهدئات',       'فرع بيسيلة',  'دار الشفاء للأدوية',    15,  10, 50,  85, 0,  null, null),
  ('TRAM-100',  'ترامادول 100 مج أمبولات',        'مسكنات قوية', 'فرع زكريا',   'بيوفارما للاستيراد',    20,  25, 80,  50, 0,  null, null),
  ('DIAZ-10',   'ديازيبام 10 مج حقن',             'مهدئات',       'فرع المنشية', 'الشركة المصرية للأدوية', 35, 20, 80,  35, 0,  null, null),
  ('PETH-50',   'بيثيدين 50 مج حقن',              'مخدرات',       'فرع بيسيلة',  'مجموعة النيل للصيدليات', 8, 15, 60,  75, 0,  null, null),
  ('VIT-B12',   'فيتامين ب12 حبوب',               'فيتامينات',    'فرع زكريا',   'دار الشفاء للأدوية',    60, 20, 120, 25, 0,  null, null),
  ('MED-001',   'أموكسيسيلين 250 مج - كبسولات',  'مضادات حيوية','فرع زكريا',   'الشركة المصرية للأدوية',120, 30, 200, 25, 67, 'عرض أو تحويل للفروع الأخرى', '2026-09-30'),
  ('VIT-002',   'فيتامين ب12 - الراكد',           'فيتامينات',    'فرع بيسيلة',  'دار الشفاء للأدوية',    80, 20, 150, 30, 91, 'إرجاع للمورد أو تخفيض السعر', '2026-08-31'),
  ('CALC-500',  'كالسيوم 500 مج أقراص',           'مكملات',       'فرع المنشية', 'بيوفارما للاستيراد',   200, 40, 300, 20, 45, 'خصومات ترويجية', '2026-07-15')
) as p(code, name, category, branch_name, supplier_name, current_stock, min_stock, max_stock, unit_price, days_since_sale, suggested_action, expiry_date)
join branches b on b.name = p.branch_name
join suppliers s on s.name = p.supplier_name
on conflict do nothing;

-- PURCHASE INVOICES
insert into purchase_invoices (invoice_no, supplier_id, branch_id, date, value, returned, remaining, payment_type, payment_status, review_status)
select p.invoice_no, s.id, b.id, p.date::date, p.value, p.returned, p.remaining, p.payment_type, p.payment_status, p.review_status
from (values
  ('INV-2026-001','الشركة المصرية للأدوية','فرع زكريا',  '2026-05-10',25000,0,   25000,'آجل', 'غير مدفوع',    'معتمد'),
  ('INV-2026-002','دار الشفاء للأدوية',    'فرع بيسيلة', '2026-05-08',18500,0,   10000,'جزئي','مدفوع جزئياً','معتمد'),
  ('INV-2026-003','بيوفارما للاستيراد',    'فرع زكريا',  '2026-05-12',42000,0,   42000,'آجل', 'غير مدفوع',    'انتظار مراجعة'),
  ('INV-2026-004','الشركة المصرية للأدوية','فرع المنشية','2026-05-11',15000,500, 14500,'كاش', 'مدفوع بالكامل','معتمد'),
  ('INV-2026-005','شركة الفاروق للتوزيع', 'فرع بيسيلة', '2026-05-14',35000,0,   35000,'آجل', 'غير مدفوع',    'انتظار مراجعة'),
  ('INV-2026-006','الشركة المصرية للأدوية','فرع المنشية','2026-05-15',28000,1000,27000,'آجل', 'غير مدفوع',    'يحتاج تعديل'),
  ('INV-2026-007','مجموعة النيل للصيدليات','فرع بيسيلة','2026-05-14',55000,0,   55000,'آجل', 'غير مدفوع',    'انتظار مراجعة')
) as p(invoice_no,supplier_name,branch_name,date,value,returned,remaining,payment_type,payment_status,review_status)
join suppliers s on s.name = p.supplier_name
join branches b on b.name = p.branch_name
on conflict (invoice_no) do nothing;

-- SUPPLIER PAYMENTS
insert into supplier_payments (supplier_id, amount, payment_method, payment_date, notes)
select s.id, p.amount, p.method, p.date::date, p.notes
from (values
  ('الشركة المصرية للأدوية', 50000, 'bank_transfer', '2026-05-05', 'دفعة جزئية'),
  ('دار الشفاء للأدوية',     20000, 'cash',          '2026-05-01', 'دفعة جزئية'),
  ('بيوفارما للاستيراد',     15000, 'bank_transfer', '2026-05-01', 'دفعة أولى'),
  ('شركة الفاروق للتوزيع',   10000, 'cash',          '2026-04-15', 'قسط أول'),
  ('مجموعة النيل للصيدليات', 18000, 'cash',          '2026-05-10', 'دفع كامل')
) as p(supplier_name, amount, method, date, notes)
join suppliers s on s.name = p.supplier_name
on conflict do nothing;

-- SUPPLIER RETURNS
insert into supplier_returns (return_no, date, supplier_id, branch_id, medicine_code, medicine_name, quantity, value, reason, status)
select p.return_no, p.date::date, s.id, b.id, p.med_code, p.med_name, p.qty, p.val, p.reason, p.status
from (values
  ('RET-2026-001','2026-05-15','الشركة المصرية للأدوية','فرع المنشية','AMOX-500','أموكسيسيلين 500 مج',20,1500,'قريب الانتهاء','معتمد'),
  ('RET-2026-002','2026-05-09','دار الشفاء للأدوية',    'فرع بيسيلة', 'VIT-D3',  'فيتامين د3',         15,2250,'راكد',          'معلق'),
  ('RET-2026-003','2026-05-11','شركة الفاروق للتوزيع', 'فرع زكريا',  'PARA-1',  'باراسيتامول 1 جم',   50,3000,'فرق سعر',       'تحت المراجعة')
) as p(return_no,date,supplier_name,branch_name,med_code,med_name,qty,val,reason,status)
join suppliers s on s.name = p.supplier_name
join branches b on b.name = p.branch_name
on conflict (return_no) do nothing;

-- EXPENSES
insert into expenses (date, branch_id, category, description, amount, payment_method, status)
select p.date::date, b.id, p.category, p.description, p.amount, p.method, p.status
from (values
  ('2026-05-01','فرع زكريا',  'إيجار',    'إيجار شهر مايو',      8000, 'bank_transfer','معتمد'),
  ('2026-05-02','فرع بيسيلة', 'كهرباء',   'فاتورة كهرباء أبريل', 1200, 'cash',         'معتمد'),
  ('2026-05-05','فرع المنشية','صيانة',    'صيانة التكييفات',      2500, 'cash',         'معتمد'),
  ('2026-05-07','فرع زكريا',  'إنترنت',   'اشتراك إنترنت شهري',   450,  'bank_transfer','معتمد'),
  ('2026-05-10','فرع بيسيلة', 'مستلزمات', 'مستلزمات مكتبية',      350,  'cash',         'انتظار')
) as p(date,branch_name,category,description,amount,method,status)
join branches b on b.name = p.branch_name
on conflict do nothing;

-- DELIVERY DEFAULT SETTINGS
insert into delivery_settings (
  branch_id,
  internal_trip_requires_approval,
  senior_hourly_rate,
  senior_order_rate,
  senior_internal_trip_rate,
  mid_hourly_rate,
  mid_order_rate,
  mid_internal_trip_rate,
  junior_hourly_rate,
  junior_order_rate,
  junior_internal_trip_rate
)
select
  b.id,
  true,
  23,
  10,
  4,
  21.5,
  8,
  4,
  19.25,
  6,
  3
from branches as b
on conflict (branch_id) do nothing;
