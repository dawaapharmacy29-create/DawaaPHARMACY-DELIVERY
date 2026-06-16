-- Enable Row Level Security on all tables
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE bconnect_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Branches policies
-- Admins can read all branches
CREATE POLICY "Admins can read all branches" ON branches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Shift managers can read their branch
CREATE POLICY "Shift managers can read their branch" ON branches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'shift_manager'
      AND status = 'active'
      AND branch_id = branches.id
    )
  );

-- Riders can read their branch
CREATE POLICY "Riders can read their branch" ON branches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN riders r ON r.profile_id = up.id
      WHERE up.id = auth.uid()
      AND up.status = 'active'
      AND r.branch_id = branches.id
    )
  );

-- User profiles policies
-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = auth_user_id);

-- Admins can read all profiles
CREATE POLICY "Admins can read all profiles" ON user_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Shift managers can read profiles in their branch
CREATE POLICY "Shift managers can read branch profiles" ON user_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'shift_manager'
      AND status = 'active'
      AND branch_id = user_profiles.branch_id
    )
  );

-- Login aliases policies
-- Anon can read login aliases for login resolution
CREATE POLICY "Anon can read login aliases" ON login_aliases
  FOR SELECT USING (true);

-- Riders policies
-- Admins can read all riders
CREATE POLICY "Admins can read all riders" ON riders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Shift managers can read riders in their branch
CREATE POLICY "Shift managers can read branch riders" ON riders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'shift_manager'
      AND status = 'active'
      AND branch_id = riders.branch_id
    )
  );

-- Riders can read their own profile
CREATE POLICY "Riders can read own profile" ON riders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN riders r ON r.profile_id = up.id
      WHERE up.id = auth.uid()
      AND up.status = 'active'
      AND r.id = riders.id
    )
  );

-- Customers policies
-- Admins can read all customers
CREATE POLICY "Admins can read all customers" ON customers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Shift managers can read customers in their branch
CREATE POLICY "Shift managers can read branch customers" ON customers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'shift_manager'
      AND status = 'active'
      AND branch_id = customers.branch_id
    )
  );

-- Riders can read customers for search
CREATE POLICY "Riders can read customers" ON customers
  FOR SELECT USING (true);

-- Attendance policies
-- Admins can read all attendance
CREATE POLICY "Admins can read all attendance" ON attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Shift managers can read attendance in their branch
CREATE POLICY "Shift managers can read branch attendance" ON attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'shift_manager'
      AND status = 'active'
      AND branch_id = attendance.branch_id
    )
  );

-- Riders can read their own attendance
CREATE POLICY "Riders can read own attendance" ON attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN riders r ON r.profile_id = up.id
      WHERE up.id = auth.uid()
      AND up.status = 'active'
      AND r.id = attendance.rider_id
    )
  );

-- Riders can insert their own attendance
CREATE POLICY "Riders can insert own attendance" ON attendance
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN riders r ON r.profile_id = up.id
      WHERE up.id = auth.uid()
      AND up.status = 'active'
      AND r.id = rider_id
    )
  );

-- Riders can update their own attendance (check-out only)
CREATE POLICY "Riders can update own attendance" ON attendance
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN riders r ON r.profile_id = up.id
      WHERE up.id = auth.uid()
      AND up.status = 'active'
      AND r.id = attendance.rider_id
    )
  );

-- Delivery orders policies
-- Admins can read all orders
CREATE POLICY "Admins can read all orders" ON delivery_orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Shift managers can read orders in their branch
CREATE POLICY "Shift managers can read branch orders" ON delivery_orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'shift_manager'
      AND status = 'active'
      AND branch_id = delivery_orders.branch_id
    )
  );

-- Riders can read their own orders
CREATE POLICY "Riders can read own orders" ON delivery_orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN riders r ON r.profile_id = up.id
      WHERE up.id = auth.uid()
      AND up.status = 'active'
      AND r.id = delivery_orders.rider_id
    )
  );

-- Riders can insert their own orders
CREATE POLICY "Riders can insert own orders" ON delivery_orders
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN riders r ON r.profile_id = up.id
      WHERE up.id = auth.uid()
      AND up.status = 'active'
      AND r.id = rider_id
    )
  );

-- Riders can update their own orders (status only)
CREATE POLICY "Riders can update own orders" ON delivery_orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN riders r ON r.profile_id = up.id
      WHERE up.id = auth.uid()
      AND up.status = 'active'
      AND r.id = delivery_orders.rider_id
    )
  );

-- Internal trips policies
-- Admins can read all trips
CREATE POLICY "Admins can read all trips" ON internal_trips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Shift managers can read trips in their branch
CREATE POLICY "Shift managers can read branch trips" ON internal_trips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'shift_manager'
      AND status = 'active'
      AND branch_id = internal_trips.branch_id
    )
  );

-- Riders can read their own trips
CREATE POLICY "Riders can read own trips" ON internal_trips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN riders r ON r.profile_id = up.id
      WHERE up.id = auth.uid()
      AND up.status = 'active'
      AND r.id = internal_trips.rider_id
    )
  );

-- Riders can insert their own trips
CREATE POLICY "Riders can insert own trips" ON internal_trips
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN riders r ON r.profile_id = up.id
      WHERE up.id = auth.uid()
      AND up.status = 'active'
      AND r.id = rider_id
    )
  );

-- Import batches policies
-- Admins can read all import batches
CREATE POLICY "Admins can read all import batches" ON import_batches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Admins can insert import batches
CREATE POLICY "Admins can insert import batches" ON import_batches
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
      AND imported_by = id
    )
  );

-- B-Connect invoices policies
-- Admins can read all bconnect invoices
CREATE POLICY "Admins can read all bconnect invoices" ON bconnect_invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Reconciliation results policies
-- Admins can read all reconciliation results
CREATE POLICY "Admins can read all reconciliation" ON reconciliation_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Shift managers can read reconciliation in their branch
CREATE POLICY "Shift managers can read branch reconciliation" ON reconciliation_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'shift_manager'
      AND status = 'active'
      AND EXISTS (
        SELECT 1 FROM riders r
        WHERE r.id = reconciliation_results.rider_id
        AND r.branch_id = user_profiles.branch_id
      )
    )
  );

-- Monthly payroll policies
-- Admins can read all payroll
CREATE POLICY "Admins can read all payroll" ON monthly_payroll
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Shift managers can read payroll in their branch
CREATE POLICY "Shift managers can read branch payroll" ON monthly_payroll
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'shift_manager'
      AND status = 'active'
      AND EXISTS (
        SELECT 1 FROM riders r
        WHERE r.id = monthly_payroll.rider_id
        AND r.branch_id = user_profiles.branch_id
      )
    )
  );

-- Riders can read their own payroll
CREATE POLICY "Riders can read own payroll" ON monthly_payroll
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN riders r ON r.profile_id = up.id
      WHERE up.id = auth.uid()
      AND up.status = 'active'
      AND r.id = monthly_payroll.rider_id
    )
  );

-- Incidents policies
-- Admins can read all incidents
CREATE POLICY "Admins can read all incidents" ON incidents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Shift managers can read incidents in their branch
CREATE POLICY "Shift managers can read branch incidents" ON incidents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'shift_manager'
      AND status = 'active'
      AND EXISTS (
        SELECT 1 FROM riders r
        WHERE r.id = incidents.rider_id
        AND r.branch_id = user_profiles.branch_id
      )
    )
  );

-- Riders can read their own incidents
CREATE POLICY "Riders can read own incidents" ON incidents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN riders r ON r.profile_id = up.id
      WHERE up.id = auth.uid()
      AND up.status = 'active'
      AND r.id = incidents.rider_id
    )
  );

-- Performance scores policies
-- Admins can read all performance scores
CREATE POLICY "Admins can read all performance" ON performance_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Shift managers can read performance in their branch
CREATE POLICY "Shift managers can read branch performance" ON performance_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'shift_manager'
      AND status = 'active'
      AND EXISTS (
        SELECT 1 FROM riders r
        WHERE r.id = performance_scores.rider_id
        AND r.branch_id = user_profiles.branch_id
      )
    )
  );

-- Riders can read their own performance
CREATE POLICY "Riders can read own performance" ON performance_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN riders r ON r.profile_id = up.id
      WHERE up.id = auth.uid()
      AND up.status = 'active'
      AND r.id = performance_scores.rider_id
    )
  );

-- Notifications policies
-- Users can read their own notifications
CREATE POLICY "Users can read own notifications" ON notifications
  FOR SELECT USING (recipient_profile_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (recipient_profile_id = auth.uid());

-- Admins can read all notifications
CREATE POLICY "Admins can read all notifications" ON notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Audit log policies
-- Admins can read all audit logs
CREATE POLICY "Admins can read all audit logs" ON audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
    )
  );

-- Admins can insert audit logs
CREATE POLICY "Admins can insert audit logs" ON audit_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
      AND actor_profile_id = id
    )
  );
