# Storage cleanup dry-run v2

The original workflow failed because PostgreSQL does not allow `COPY ... TO STDOUT` inside a PL/pgSQL `DO` block.

The replacement workflow exports references from ordinary SQL queries executed by Python, checks optional tables and columns through `information_schema`, and keeps deletion fully disabled.
