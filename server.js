const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Database connection: change the password to your MySQL root password ----
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'vehicle_service_center',
  dateStrings: true, // return DATE columns as 'YYYY-MM-DD' text
});

// ---- Tables the API is allowed to touch ----
const T = {
  customers: { table: 'Customers', pk: 'customer_id', cols: ['name', 'phone', 'email', 'address'] },
  vehicles: { table: 'Vehicles', pk: 'vehicle_id', cols: ['customer_id', 'vehicle_number', 'email', 'address'] },
  services: { table: 'Services', pk: 'service_id', cols: ['vehicle_id', 'service_type', 'service_date', 'description', 'service_change', 'status'] },
  payments: { table: 'Payments', pk: 'payment_id', cols: ['service_id', 'amount', 'payment_date', 'payment_method', 'status'] },
};

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => res.status(500).json({ error: e.sqlMessage || e.message }));

// Empty form values become NULL
const pick = (t, body) => Object.fromEntries(t.cols.map((c) => [c, body[c] === '' || body[c] === undefined ? null : body[c]]));

// ---- Dashboard numbers ----
app.get('/api/stats', wrap(async (req, res) => {
  const [[counts]] = await db.query(`
    SELECT (SELECT COUNT(*) FROM Customers) AS customers,
           (SELECT COUNT(*) FROM Vehicles) AS vehicles,
           (SELECT COUNT(*) FROM Services WHERE status <> 'Completed') AS open_services,
           (SELECT IFNULL(SUM(amount), 0) FROM Payments) AS revenue`);
  const [recent] = await db.query(`
    SELECT v.vehicle_number, s.service_type, s.service_date, s.status
    FROM Services s JOIN Vehicles v ON v.vehicle_id = s.vehicle_id
    ORDER BY s.service_date DESC, s.service_id DESC LIMIT 5`);
  res.json({ ...counts, recent });
}));

// ---- CRUD for customers, vehicles, services, payments ----
app.param('e', (req, res, next, e) => {
  if (!T[e]) return res.status(404).json({ error: 'Unknown resource' });
  req.t = T[e];
  next();
});

app.get('/api/:e', wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM ?? ORDER BY ?? DESC', [req.t.table, req.t.pk]);
  res.json(rows);
}));

app.post('/api/:e', wrap(async (req, res) => {
  const data = pick(req.t, req.body);
  const [r] = await db.query('INSERT INTO ?? SET ?', [req.t.table, data]);
  res.status(201).json({ id: r.insertId });
}));

app.put('/api/:e/:id', wrap(async (req, res) => {
  await db.query('UPDATE ?? SET ? WHERE ?? = ?', [req.t.table, pick(req.t, req.body), req.t.pk, req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/:e/:id', wrap(async (req, res) => {
  await db.query('DELETE FROM ?? WHERE ?? = ?', [req.t.table, req.t.pk, req.params.id]);
  res.json({ ok: true });
}));

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
