-- Seed incentive rules (penalties and bonuses)

insert into public.delivery_incentive_rules (rule_code, rule_name, rule_type, amount_type, amount, severity, repeat_multiplier, requires_review, active, description)
values
  ('LATE_RETURN_NO_REASON', 'Late return without reason', 'penalty', 'fixed', 20, 'medium', true, true, true, 'خصم عند رجوع متأخر بدون سبب واضح'),
  ('MANUAL_RETURN_NO_GPS', 'Manual return without GPS', 'penalty', 'fixed', 20, 'high', false, true, true, 'خصم بعد أول حالة رجوع يدوي بدون GPS'),
  ('WRONG_CUSTOMER_SELECTED', 'Wrong customer selected', 'penalty', 'fixed', 20, 'high', false, true, true, 'خصم عند اختيار عميل خاطئ'),
  ('FAILED_ORDER_RIDER_FAULT', 'Failed order due to rider', 'penalty', 'fixed', 50, 'high', false, true, true, 'خصم عند فشل أوردر بسبب المندوب'),
  ('UNAPPROVED_INTERNAL_TRIP', 'Unapproved internal trip', 'penalty', 'fixed', 20, 'medium', true, true, true, 'خصم عند تكرار مشاوير داخلية غير معتمدة'),
  ('OPEN_RUN_TOO_LONG', 'Open run too long', 'penalty', 'fixed', 20, 'medium', true, true, true, 'خصم عند تكرار الخروجات الطويلة'),
  ('INVOICE_EDIT_REQUIRED', 'Invoice requires admin edit', 'penalty', 'fixed', 0, 'high', false, true, true, 'مراجعة إدارية لازمة لتعديل الفاتورة'),
  ('FASTEST_RIDER_DAILY', 'Fastest rider daily', 'bonus', 'fixed', 20, 'low', false, false, true, 'مكافأة أسرع مندوب يوميًا'),
  ('ZERO_ERRORS_7_DAYS', 'Zero errors for 7 days', 'bonus', 'fixed', 50, 'low', false, false, true, 'مكافأة عدم وجود أخطاء لمدة 7 أيام'),
  ('TOP_BRANCH_RIDER_MONTHLY', 'Top branch rider monthly', 'bonus', 'fixed', 100, 'low', false, false, true, 'مكافأة أفضل مندوب في الفرع شهريًا'),
  ('BEST_GPS_COMPLIANCE', 'Best GPS compliance', 'bonus', 'points', 5, 'low', false, false, true, 'نقاط للالتزام بجودة GPS'),
  ('HIGH_SUCCESS_RATE', 'High success rate', 'bonus', 'points', 10, 'low', false, false, true, 'نقاط لمعدل نجاح مرتفع')
on conflict (rule_code) do update set
  rule_name = excluded.rule_name,
  rule_type = excluded.rule_type,
  amount_type = excluded.amount_type,
  amount = excluded.amount,
  severity = excluded.severity,
  repeat_multiplier = excluded.repeat_multiplier,
  requires_review = excluded.requires_review,
  active = excluded.active,
  description = excluded.description,
  updated_at = now();
