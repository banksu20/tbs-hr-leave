import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sql = (file) => readFileSync(resolve(root, 'n8n/sql', file), 'utf8');

export function patchWorkflow(original, credentialId) {
  const workflow = structuredClone(original);
  const node = (name) => {
    const found = workflow.nodes.find((item) => item.name === name);
    if (!found) throw new Error(`Required node missing: ${name}`);
    return found;
  };
  const query = (name, text, parameters) => {
    const target = node(name);
    target.parameters.query = text;
    target.parameters.options = { ...target.parameters.options, queryReplacement: parameters };
  };
  for (const operation of ['create', 'update', 'delete']) {
    query(`dashboard-leave-${operation}`,
      `SELECT result.* FROM jsonb_to_record(tbs_dashboard_request('${operation}', $1::jsonb)) AS result(ok boolean, id integer, "statusCode" integer, error text);`,
      '={{ [JSON.stringify($json.body)] }}');
  }
  query('Get all leaves', sql('get-all-leaves.sql'), '={{ [Number($json.query.year || $now.year)] }}');
  query('Get quota', sql('get-quota.sql'), '={{ [$json.query.userId, Number($json.query.year || $now.year)] }}');
  query('dashboard-employee-profile', sql('employee-profile.sql'), '={{ [JSON.stringify($json.body)] }}');
  // Array bindings retain commas, empty strings and SQL null instead of stringifying them.
  node('dashboard-quota-update').parameters.options.queryReplacement =
    '={{ [$json.body.userId, $json.body.year, $json.body.annualTotal ?? null, $json.body.sickTotal ?? null, $json.body.personalTotal ?? null, $json.body.carriedOver ?? null, $json.body.note ?? null, "pad"] }}';
  node('dashboard-employee-status').parameters.options.queryReplacement =
    '={{ [$json.body.userId, $json.body.status] }}';
  const history = node('Merge Sheet & DB History');
  if (!history.parameters.jsCode.includes("$('Get History from DB').all()")) throw new Error('History code changed; review before patching');
  history.parameters.jsCode = history.parameters.jsCode.replace("$('Get History from DB').all()", "$('Get History from DB1').all()");
  for (const name of ['Webhook get all leaves', ...['leave-create', 'leave-update', 'leave-delete', 'quota-update', 'employee-status', 'employee-profile'].map((action) => `Webhook dashboard-${action}`)]) {
    const webhook = node(name);
    webhook.parameters.authentication = 'headerAuth';
    webhook.credentials = { ...webhook.credentials, httpHeaderAuth: {
      id: credentialId || 'CONFIGURE_HEADER_AUTH_BEFORE_PUBLISHING', name: 'TBS dashboard server',
    } };
  }
  // Keep the export private. It retains original credential references and may contain
  // sensitive expressions. Do not commit the generated full workflow.
  workflow.pinData = {};
  workflow.active = false;
  delete workflow.versionId;
  return workflow;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output, credentialId] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/patch-n8n-workflow.mjs INPUT.json OUTPUT.json [headerCredentialId]');
  const original = JSON.parse(readFileSync(input, 'utf8'));
  writeFileSync(output, JSON.stringify(patchWorkflow(original, credentialId), null, 2), { mode: 0o600 });
  console.log('Wrote inactive workflow patch. Apply 001_request_safety.sql and configure Header Auth before publishing.');
}
