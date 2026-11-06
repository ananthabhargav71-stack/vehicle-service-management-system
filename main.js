const page = document.body.dataset.page;
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

async function api(url, method = 'GET', body) {
  const res = await fetch('/api/' + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const badge = (s) => (s ? `<span class="badge ${esc(s).toLowerCase().replace(/\s+/g, '-')}">${esc(s)}</span>` : '');

/* Each entity: primary key, and its form fields.
   ref: [parentEntity, columnToShow] turns a foreign key into a dropdown.
   opts: fixed list of choices. */
const CFG = {
  customers: {
    pk: 'customer_id',
    fields: [
      { n: 'name', l: 'Name', req: 1 },
      { n: 'phone', l: 'Phone' },
      { n: 'email', l: 'Email', t: 'email' },
      { n: 'address', l: 'Address' },
    ],
  },
  vehicles: {
    pk: 'vehicle_id',
    fields: [
      { n: 'customer_id', l: 'Customer', ref: ['customers', 'name'], req: 1 },
      { n: 'vehicle_number', l: 'Vehicle number', req: 1 },
      { n: 'email', l: 'Email', t: 'email' },
      { n: 'address', l: 'Address' },
    ],
  },
  services: {
    pk: 'service_id',
    fields: [
      { n: 'vehicle_id', l: 'Vehicle', ref: ['vehicles', 'vehicle_number'], req: 1 },
      { n: 'service_type', l: 'Service type', req: 1, opts: ['General Service', 'Brake Repair', 'Wheel Alignment', 'AC Service', 'Battery Change', 'Other'] },
      { n: 'service_date', l: 'Service date', t: 'date', req: 1 },
      { n: 'description', l: 'Description', t: 'textarea' },
      { n: 'service_change', l: 'Charge (₹)', t: 'number' },
      { n: 'status', l: 'Status', req: 1, opts: ['Pending', 'In Progress', 'Completed'], badge: 1 },
    ],
  },
  payments: {
    pk: 'payment_id',
    fields: [
      { n: 'service_id', l: 'Service', ref: ['services', 'service_type'], req: 1 },
      { n: 'amount', l: 'Amount (₹)', t: 'number', req: 1 },
      { n: 'payment_date', l: 'Payment date', t: 'date' },
      { n: 'payment_method', l: 'Method', opts: ['Cash', 'UPI', 'Card', 'Net Banking'] },
      { n: 'status', l: 'Status', req: 1, opts: ['Paid', 'Partial', 'Unpaid'], badge: 1 },
    ],
  },
};

const NAV = [
  ['dashboard', 'Dashboard'], ['customers', 'Customers'], ['vehicles', 'Vehicles'],
  ['services', 'Services'], ['payments', 'Payments'],
];

/* ---------- Sidebar ---------- */
function renderSidebar() {
  $('#sidebar').innerHTML =
    '<p class="brand">BhargavAutoCare</p>' +
    NAV.map(([k, l]) => `<a href="${k}.html" class="${k === page ? 'active' : ''}">${l}</a>`).join('') +
    '<a href="index.html" class="logout">Home page</a>';
}

/* ---------- Dashboard ---------- */
async function initDashboard() {
  const s = await api('stats');
  const card = (n, l, cls = '') => `<div class="card ${cls}"><b>${n}</b>${l}</div>`;
  $('#stats').innerHTML =
    card(s.customers, 'Customers') + card(s.vehicles, 'Vehicles') +
    card(s.open_services, 'Open services', 'accent') +
    card('₹' + Number(s.revenue).toLocaleString('en-IN'), 'Payments received', 'accent');
  $('#recent').innerHTML = s.recent.length
    ? `<table><thead><tr><th>Vehicle</th><th>Service</th><th>Date</th><th>Status</th></tr></thead><tbody>` +
      s.recent.map((r) => `<tr><td>${esc(r.vehicle_number)}</td><td>${esc(r.service_type)}</td><td>${esc(r.service_date)}</td><td>${badge(r.status)}</td></tr>`).join('') +
      '</tbody></table>'
    : '<p class="empty">No services yet. Add one from the Services page.</p>';
}

/* ---------- Customers / Vehicles / Services / Payments ---------- */
async function initCrud() {
  const c = CFG[page];
  const refs = {};
  for (const f of c.fields) if (f.ref) refs[f.n] = await api(f.ref[0]);
  let rows = [];
  let editId = null;

  const refLabel = (f, id) => {
    const r = refs[f.n].find((x) => x[CFG[f.ref[0]].pk] == id);
    return r ? `${esc(r[f.ref[1]])} (#${id})` : esc(id);
  };

  const cell = (f, v) => (f.ref ? refLabel(f, v) : f.badge ? badge(v) : esc(v));

  function draw() {
    const q = $('#search').value.toLowerCase();
    const shown = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    $('#content').innerHTML = shown.length
      ? `<table><thead><tr><th>ID</th>${c.fields.map((f) => `<th>${f.l}</th>`).join('')}<th>Actions</th></tr></thead><tbody>` +
        shown.map((r) =>
          `<tr><td>${r[c.pk]}</td>${c.fields.map((f) => `<td>${cell(f, r[f.n])}</td>`).join('')}` +
          `<td class="actions"><button class="btn small ghost" data-edit="${r[c.pk]}">Edit</button>` +
          `<button class="btn small danger" data-del="${r[c.pk]}">Delete</button></td></tr>`).join('') +
        '</tbody></table>'
      : '<p class="empty">No records found. Use "Add record" to create one.</p>';
  }

  async function load() {
    rows = await api(page);
    draw();
  }

  function input(f) {
    const base = `name="${f.n}" ${f.req ? 'required' : ''}`;
    if (f.ref) {
      const pk = CFG[f.ref[0]].pk;
      return `<select ${base}><option value="">Select</option>` +
        refs[f.n].map((r) => `<option value="${r[pk]}">${esc(r[f.ref[1]])} (#${r[pk]})</option>`).join('') + '</select>';
    }
    if (f.opts) return `<select ${base}><option value="">Select</option>${f.opts.map((o) => `<option>${o}</option>`).join('')}</select>`;
    if (f.t === 'textarea') return `<textarea ${base} rows="3"></textarea>`;
    return `<input ${base} type="${f.t || 'text'}" ${f.t === 'number' ? 'step="0.01" min="0"' : ''}>`;
  }

  function openForm(row) {
    editId = row ? row[c.pk] : null;
    $('#form').innerHTML =
      `<h2>${row ? 'Edit record' : 'Add record'}</h2>` +
      c.fields.map((f) => `<label>${f.l}${input(f)}</label>`).join('') +
      `<p class="error" id="formError" role="alert"></p>` +
      `<div class="form-actions"><button type="button" class="btn ghost" id="cancel">Cancel</button><button class="btn">Save</button></div>`;
    if (row) for (const f of c.fields) $('#form').elements[f.n].value = row[f.n] ?? '';
    $('#cancel').onclick = () => $('#modal').close();
    $('#modal').showModal();
  }

  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      await api(editId ? `${page}/${editId}` : page, editId ? 'PUT' : 'POST', body);
      $('#modal').close();
      load();
    } catch (err) {
      $('#formError').textContent = err.message;
    }
  });

  $('#addBtn').onclick = () => openForm(null);
  $('#search').oninput = draw;
  $('#content').addEventListener('click', async (e) => {
    const edit = e.target.dataset.edit, del = e.target.dataset.del;
    if (edit) openForm(rows.find((r) => r[c.pk] == edit));
    if (del && confirm('Delete this record? Related records will also be deleted.')) {
      try { await api(`${page}/${del}`, 'DELETE'); load(); } catch (err) { alert(err.message); }
    }
  });

  load();
}

/* ---------- Start ---------- */
renderSidebar();
(page === 'dashboard' ? initDashboard : initCrud)().catch((err) => {
  ($('#content') || $('#stats')).innerHTML = `<p class="empty">Could not load data: ${esc(err.message)}</p>`;
});
