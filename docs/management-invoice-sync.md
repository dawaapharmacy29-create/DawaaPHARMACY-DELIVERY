# Management daily invoice integration

The four `20261102...management_invoice...` migrations implement the authenticated receiver used by Management's `delivery-invoice-sync` worker. The actual shared key lives in Vault and is never a frontend secret.

The receiver reuses existing invoice evidence, result batches, upload history and order projections. It does not replace human approvals/exclusions, alter rider ownership, invoke payroll archives, or count failed orders. Missing evidence remains pending. Changed evidence conflicts are surfaced for review. Source/order hashes prevent duplicate reports, and unchanged order projections are not rewritten.

Exact invoice number, normalized source branch and invoice date are required. Customer code, phone and amount are checked when available. Multipliers preserve their value-review state. Nonzero existing earnings or missing rider identity require review, protecting against legacy UPDATE trigger side effects.

The RPC is atomic, serialized per cycle and bounded to the current open 26–25 cycle. Its 90-second timeout is function-specific: public role/database timeouts are unchanged. Anonymous execution requires the dedicated integration key; ordinary anonymous callers cannot read integration state or credentials.

End-to-end reproducible SQL tests are maintained in Management at `scripts/verification/test-delivery-daily-invoice-sync.mjs`; point `DAWAA_DELIVERY_REPO` at this checkout. They cover financial/manual preservation (including a legacy zeroing trigger), exact date/branch identity, conflicts/rollback, pending evidence, failed exclusions, duplicate visits, dry-run, repeat-file idempotency, late orders and access boundaries. Management's integration document describes source queueing, revision leases, timing, observability and rollout order.

Disable Management's `delivery-invoice-auto-match-minute` cron to pause automatic processing. Never delete historical invoices, orders, archived financial records or evidence as rollback.
