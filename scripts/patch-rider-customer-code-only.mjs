import fs from 'node:fs';

const filePath = 'src/pages/rider/RiderDashboard.tsx';
const marker = '// rider-customer-search: exact-code-only fallback';

let source = fs.readFileSync(filePath, 'utf8');

if (source.includes(marker)) {
  console.log('Exact rider customer-code search already applied.');
  process.exit(0);
}

const startNeedle = '        const pattern = buildPostgrestSearchPattern(q);';
const endNeedle = '        setCustomers(uniqueCustomers(collected).slice(0, 20));';
const start = source.indexOf(startNeedle);
const end = source.indexOf(endNeedle, start);

if (start === -1 || end === -1) {
  throw new Error('Could not find legacy rider customer-search fallback; manual review required.');
}

const replacement = `        ${marker}
        // The secure RPC is the primary path. If it is temporarily unavailable,
        // the fallback must remain exact-code-only and must never search phone,
        // name, address, or partial codes.
        const collected: NormalizedCustomer[] = [];
        for (const codeColumn of ["customer_code", "code"] as const) {
          const { data, error } = await supabase
            .from("customers")
            .select("*")
            .eq(codeColumn, q)
            .limit(20);

          // Some older schemas may not have both aliases. Ignore only a missing
          // alias and continue to the other exact code column.
          if (error) continue;

          collected.push(
            ...(data ?? [])
              .map((row) => normalizeCustomer(row as Record<string, unknown>))
              .filter((customer) => customer.code === q),
          );
        }

        setCustomers(uniqueCustomers(collected).slice(0, 20));`;

source = source.slice(0, start) + replacement + source.slice(end + endNeedle.length);
fs.writeFileSync(filePath, source, 'utf8');
console.log('Applied exact-code-only rider customer search fallback.');
