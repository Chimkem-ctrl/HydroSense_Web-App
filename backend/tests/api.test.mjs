import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = await readFile(new URL('../supabase/functions/api/index.ts', import.meta.url), 'utf8');
const javascript = stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm, ''), { mode: 'strip' });

function setup(role = 'admin', status = 'approved') {
  const profiles = [
    { id: 'actor', first_name: 'Admin', last_name: 'User', email: 'admin@example.test', role, status },
    { id: 'pending', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.test', role: null, status: 'pending', requested_role: null },
    { id: 'member', first_name: 'John', last_name: 'Smith', email: 'john@example.test', role: 'operator', status: 'approved', site: 'site', active: true, last_active: 'today' },
    { id: 'other-admin', first_name: 'Other', last_name: 'Admin', email: 'other@example.test', role: 'admin', status: 'approved' },
  ];
  const tables = { profiles, audit_logs: [], manual_entries: [], activity_logs: [], validation_rows: [], readings: [], tanks: [{ id: 'tank', device_id: 'node' }], device_statuses: [], alerts: [], alert_responses: [], thresholds: [{ parameter: 'temperature', min_value: 26, max_value: 30 }, { parameter: 'do', min_value: 4, max_value: null }, { parameter: 'ph', min_value: 6, max_value: 8 }], advisory_settings: [{ id: true, salinity_watch_temperature_c: 31, salinity_high_temperature_c: 32, ammonia_watch_temperature_c: 31, ammonia_high_ph: 7.8 }] };
  const failures = {};
  let createdUser;
  const db = {
    auth: { admin: { createUser: async (body) => { createdUser = body; return { data: { user: { id: 'new', email: body.email } }, error: null }; } } },
    from(table) {
      let rows = tables[table];
      let updates;
      const query = {
        select() { return this; },
        order(field, options = {}) {
          rows = [...rows].sort((a, b) => {
            if (a[field] === b[field]) return 0;
            const result = a[field] < b[field] ? -1 : 1;
            return options.ascending === false ? -result : result;
          });
          return this;
        },
        limit(count) { rows = rows.slice(0, count); return this; },
        eq(field, value) { rows = rows.filter((row) => row[field] === value); return this; },
        in(field, values) { rows = rows.filter((row) => values.includes(row[field])); return this; },
        update(value) { updates = value; return this; },
        insert(value) { tables[table].push(value); rows = [value]; return this; },
        upsert(value) { tables[table].push(value); rows = [value]; return this; },
        result() {
          if (failures[table]) return { data: null, error: { message: failures[table] } };
          if (updates) rows.forEach((row) => Object.assign(row, updates));
          return { data: rows, error: null };
        },
        async maybeSingle() { const result = this.result(); return { ...result, data: result.data?.[0] ?? null }; },
        async single() { return this.maybeSingle(); },
        then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); },
      };
      return query;
    },
  };
  let handler;
  const context = {
    Deno: { env: { get: (name) => name === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service' : name === 'HARDWARE_INGEST_API_KEY' ? 'hardware' : 'anon' }, serve: (fn) => { handler = fn; } },
    createClient: (_url, key) => key === 'service' ? db : { auth: { getUser: async () => ({ data: { user: { id: 'actor' } }, error: null }) } },
    getAddressByBarangayCode: (code) => code === 'barangay' ? {
      barangay: { name: 'Alangilan' }, municipality: { psgcCode: 'city', provinceCode: 'province', name: 'Sagay' },
      province: { psgcCode: 'province', name: 'Camiguin' }, region: { psgcCode: 'region', name: 'Region X' },
    } : undefined,
    Request, Response, URL, console,
  };
  runInNewContext(javascript, context);
  return {
    tables,
    failures,
    get createdUser() { return createdUser; },
    request: (path, method = 'GET', body) => handler(new Request(`https://example.test/functions/v1/api${path}`, {
      method, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })),
    ingest: (body) => handler(new Request('https://example.test/functions/v1/api/v1/ingest/readings', {
      method: 'POST', headers: { 'x-hardware-api-key': 'hardware', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })),
  };
}

test('signup accepts required fields without requested role and stores a readable address', async () => {
  const app = setup();
  const response = await app.request('/v1/auth/signup', 'POST', {
    firstName: 'Jane', lastName: 'Smith', email: 'jane@example.test', password: 'password123', employeeId: '123',
    phone: '+639123456789', emergencyContactName: 'John', emergencyContactPhone: '+639123456789',
    hatcheryId: 'camiguin-sagay', address: { country: 'PH', province: 'province', city: 'city', barangay: 'barangay', street: 'Main St' },
  });
  assert.equal(response.status, 201);
  assert.equal(app.createdUser.user_metadata.address, 'Main St, Alangilan, Sagay, Camiguin, Philippines');
  assert.equal('requestedRole' in app.createdUser.user_metadata, false);
  assert.equal((await app.request('/v1/auth/signup', 'POST', {})).status, 400);
});

test('CORS preflight permits settings and role updates', async () => {
  const response = await setup().request('/v1/settings/thresholds', 'OPTIONS');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('access-control-allow-methods'), /\bPUT\b/);
});

test('only approved admins can review pending requests and assign any approval role', async () => {
  for (const role of ['operator', 'manager', 'admin']) {
    const app = setup();
    const pending = await app.request('/v1/admin/pending-requests');
    assert.equal((await pending.json()).length, 1);
    const approved = await app.request('/v1/admin/pending-requests/pending/approve', 'PUT', { role });
    assert.equal(approved.status, 200);
    assert.equal(app.tables.profiles[1].role, role);
    assert.equal(app.tables.profiles[1].requested_role, null);
    assert.equal((await app.request('/v1/admin/pending-requests/pending/reject', 'PUT')).status, 404);
  }
  assert.equal((await setup('manager').request('/v1/admin/pending-requests')).status, 403);
  assert.equal((await setup('admin', 'pending').request('/v1/admin/pending-requests')).status, 403);
  const app = setup();
  assert.equal((await app.request('/v1/admin/pending-requests/pending/approve', 'PUT', { role: 'invalid' })).status, 400);
  assert.equal((await app.request('/v1/admin/pending-requests/pending/reject', 'PUT')).status, 200);
  const legacy = setup();
  assert.equal((await legacy.request('/v1/admin/users/pending', 'PATCH', { status: 'approved', role: 'admin' })).status, 200);
  assert.equal(legacy.tables.profiles[1].role, 'admin');
});

test('approved-user role changes exclude admins and pending accounts', async () => {
  const app = setup();
  assert.equal((await app.request('/v1/admin/users/member/role', 'PUT', { role: 'manager' })).status, 200);
  assert.equal(app.tables.profiles[2].role, 'manager');
  assert.equal(app.tables.audit_logs.length, 1);
  assert.equal((await app.request('/v1/admin/users/other-admin/role', 'PUT', { role: 'operator' })).status, 404);
  assert.equal((await app.request('/v1/admin/users/pending/role', 'PUT', { role: 'operator' })).status, 404);
  assert.equal((await app.request('/v1/admin/users/member/role', 'PUT', { role: 'admin' })).status, 400);
  assert.equal((await setup('operator').request('/v1/admin/users/member/role', 'PUT', { role: 'manager' })).status, 403);
});

test('operational routes use database timestamps and include hatchery-wide activity', async () => {
  const app = setup();
  await app.request('/v1/manual-entries', 'POST', { tankId: 'tank', type: 'rain_event', enteredBy: 'Jane' });
  await app.request('/v1/activity-logs', 'POST', { tankId: 'hatchery', kind: 'ENVIRONMENT', type: 'Rainfall', operator: 'Jane' });
  assert.equal('timestamp' in app.tables.manual_entries[0], false);
  assert.equal('occurred_at' in app.tables.activity_logs[0], false);
  assert.equal((await (await app.request('/v1/manual-entries?tank_id=tank')).json()).length, 1);
  assert.equal((await (await app.request('/v1/activity-logs?tank_id=tank')).json()).length, 1);
  assert.equal((await app.request('/v1/validation')).status, 200);
  assert.deepEqual(await (await app.request('/v1/tanks/tank/advisories')).json(), []);
});

test('operators cannot resolve alerts or access validation', async () => {
  const app = setup('operator');
  assert.equal((await app.request('/v1/alerts/example/resolve', 'POST', { user: 'Operator', note: 'Resolved' })).status, 403);
  assert.equal((await app.request('/v1/validation')).status, 403);
  assert.equal((await app.request('/v1/validation/tolerances')).status, 403);
});

test('role restrictions also apply to tank and settings mutations', async () => {
  const operator = setup('operator');
  for (const [path, method, body] of [
    ['/v1/tanks', 'POST', {}],
    ['/v1/tanks/tank', 'DELETE', undefined],
    ['/v1/settings/thresholds', 'PUT', {}],
    ['/v1/settings/advisory-rules', 'PUT', {}],
    ['/v1/validation/tolerances', 'PUT', {}],
    ['/v1/admin/logs', 'GET', undefined],
  ]) {
    assert.equal((await operator.request(path, method, body)).status, 403, `${method} ${path}`);
  }
  assert.equal((await setup('manager').request('/v1/admin/logs')).status, 403);
  assert.equal((await setup('admin').request('/v1/admin/logs')).status, 200);
});

test('alert note validation is enforced by the API', async () => {
  const app = setup('manager');
  for (const note of ['', 'ab', 'x'.repeat(501)]) {
    assert.equal((await app.request('/v1/alerts/example/resolve', 'POST', { user: 'Manager', note })).status, 400);
  }
  for (const note of ['a', 'x'.repeat(501)]) {
    assert.equal((await app.request('/v1/alerts/example/acknowledge', 'POST', { user: 'Manager', note })).status, 400);
  }
  app.tables.alerts.push({ id: 'example', tank_id: 'tank', status: 'open', parameter: 'ph', value: 8, severity: 'warning' });
  assert.equal((await app.request('/v1/alerts/example/acknowledge', 'POST', { user: 'Manager', note: '' })).status, 200);
  assert.equal((await app.request('/v1/alerts/example/resolve', 'POST', { user: 'Manager', note: 'Checked' })).status, 200);
});

test('alert response history failures are reported after the status was saved', async () => {
  const app = setup('manager');
  app.tables.alerts.push({ id: 'example', tank_id: 'tank', status: 'open', parameter: 'ph', value: 8, severity: 'warning' });
  app.failures.alert_responses = 'database unavailable';
  const response = await app.request('/v1/alerts/example/acknowledge', 'POST', { user: 'Manager', note: '' });
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /was acknowledged.*history could not be saved/);
  assert.equal(app.tables.alerts[0].status, 'acknowledged');
});

test('only admins can list user accounts', async () => {
  for (const role of ['operator', 'manager']) {
    assert.equal((await setup(role).request('/v1/admin/users')).status, 403);
  }
  assert.equal((await setup('admin').request('/v1/admin/users')).status, 200);
});

test('invalid probe readings do not create water-quality alerts', async () => {
  const app = setup();
  const result = await app.ingest({ deviceId: 'node', temperature: 126, doMgL: -1, ph: 15 });
  assert.equal(result.status, 201);
  assert.deepEqual((await result.json()).invalidParameters, ['temperature', 'do', 'ph']);
  assert.equal(app.tables.readings.length, 1);
  assert.equal(app.tables.alerts.length, 0);
  const valid = await app.ingest({ deviceId: 'node', temperature: 31, doMgL: 0, ph: 7 });
  assert.equal(valid.status, 201);
  assert.deepEqual(app.tables.alerts.map((alert) => alert.parameter).sort(), ['do', 'temperature']);
});

test('ingest rejects missing numeric values and surfaces device status failures', async () => {
  const app = setup();
  for (const value of [null, '', '  ', false]) {
    assert.equal((await app.ingest({ deviceId: 'node', temperature: value, doMgL: 5, ph: 7 })).status, 400);
  }
  assert.equal(app.tables.readings.length, 0);
  app.failures.device_statuses = 'database unavailable';
  const response = await app.ingest({ deviceId: 'node', temperature: 28, doMgL: 5, ph: 7 });
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /Reading was stored/);
  assert.equal(app.tables.readings.length, 1);
});

test('device warnings reflect each tank latest persisted reading and clear after a valid reading', async () => {
  const app = setup();
  app.tables.device_statuses.push({ device_id: 'node', last_seen: '2026-01-02T00:00:00Z' });
  app.tables.readings.push(
    { tank_id: 'tank', timestamp: '2026-01-01T00:00:00Z', temperature: 28, do_mg_l: 4, ph: 7 },
    { tank_id: 'tank', timestamp: '2026-01-02T00:00:00Z', temperature: 126, do_mg_l: -1, ph: 15 },
  );
  const invalid = await (await app.request('/v1/devices/status')).json();
  assert.deepEqual(invalid[0].invalidParameters, ['temperature', 'do', 'ph']);
  assert.equal(invalid[0].probeCheckedAt, '2026-01-02T00:00:00Z');
  app.tables.readings.push({ tank_id: 'tank', timestamp: '2026-01-03T00:00:00Z', temperature: -55, do_mg_l: 0, ph: 14 });
  const valid = await (await app.request('/v1/devices/status')).json();
  assert.deepEqual(valid[0].invalidParameters, []);
  app.tables.readings[2].temperature = 125;
  app.tables.readings[2].ph = 0;
  assert.deepEqual((await (await app.request('/v1/devices/status')).json())[0].invalidParameters, []);
});

test('device status reports errors loading the latest probe reading', async () => {
  const app = setup();
  app.failures.readings = 'readings unavailable';
  const response = await app.request('/v1/devices/status');
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /readings unavailable/);
});

test('device warning physical limits match the shared inclusive boundaries', async () => {
  const app = setup();
  const row = { tank_id: 'tank', timestamp: '2026-01-03T00:00:00Z', temperature: 28, do_mg_l: 4, ph: 7 };
  app.tables.readings.push(row);
  for (const [field, values, parameter] of [
    ['temperature', [[-56, false], [-55, true], [125, true], [126, false]], 'temperature'],
    ['do_mg_l', [[-1, false], [0, true], [5, true]], 'do'],
    ['ph', [[-1, false], [0, true], [14, true], [15, false]], 'ph'],
  ]) {
    const original = row[field];
    for (const [value, valid] of values) {
      row[field] = value;
      const response = await (await app.request('/v1/devices/status')).json();
      assert.equal(response[0].invalidParameters.includes(parameter), !valid, `${parameter} ${value}`);
    }
    row[field] = original;
  }
});

test('advisories do not use invalid sensor values', async () => {
  const app = setup();
  app.tables.readings.push({ tank_id: 'tank', timestamp: '2026-01-01T00:00:00Z', temperature: 126, ph: 7 });
  const response = await app.request('/v1/tanks/tank/advisories');
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /Check probe/);
});

test('advisories use configured thresholds and recorded water events', async () => {
  const app = setup();
  app.tables.readings.push({ tank_id: 'tank', timestamp: '2026-01-01T00:00:00Z', temperature: 33, ph: 8 });
  let result = await (await app.request('/v1/tanks/tank/advisories')).json();
  assert.equal(result[0].level, 'high');
  assert.equal(result[1].level, 'watch');
  assert.equal(result[0].inputs.temperatureC, 33);
  app.tables.activity_logs.push({ tank_id: 'hatchery', kind: 'ENVIRONMENT', type: 'Rainfall' });
  result = await (await app.request('/v1/tanks/tank/advisories')).json();
  assert.equal(result[0].level, 'watch');
  assert.equal(result[0].inputs.recentRainEvent, 'yes');
  app.tables.readings[0].temperature = 25;
  app.tables.readings[0].ph = 7;
  app.tables.activity_logs.length = 0;
  result = await (await app.request('/v1/tanks/tank/advisories')).json();
  assert.equal(result[0].level, 'low');
  assert.equal(result[1].level, 'low');
});

test('advisories apply event impacts to salinity and ammonia', async () => {
  const app = setup();
  app.tables.readings.push({ tank_id: 'tank', timestamp: '2026-01-01T00:00:00Z', temperature: 25, ph: 7 });
  app.tables.activity_logs.push(
    { tank_id: 'tank', kind: 'OPERATION', type: 'Water change / exchange' },
    { tank_id: 'hatchery', kind: 'ENVIRONMENT', type: 'Power interruption' },
  );
  const result = await (await app.request('/v1/tanks/tank/advisories')).json();
  assert.equal(result[0].level, 'watch');
  assert.match(result[0].firedRule, /Salinity check recommended/);
  assert.equal(result[1].level, 'high');
  assert.match(result[1].firedRule, /Monitor TAN levels/);
});
