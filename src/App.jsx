import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Download,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Plus,
  Receipt,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
  XCircle
} from 'lucide-react';
import {
  auth,
  collection,
  createUserWithEmailAndPassword,
  db,
  deleteDoc,
  doc,
  firebaseReady,
  getDoc,
  getDocs,
  getDownloadURL,
  googleProvider,
  onAuthStateChanged,
  orderBy,
  query,
  ref,
  setDoc,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  storage,
  updateDoc,
  uploadBytes,
  writeBatch
} from './firebase';
import './App.css';

const APP_NAME = 'Kilinochchi Central College - Guild Account Management';
const TABS = [
  ['dashboard', LayoutDashboard, 'Dashboard'],
  ['staff', Users, 'Staff'],
  ['events', CalendarDays, 'Events'],
  ['expenses', Receipt, 'Expenses'],
  ['reports', FileText, 'Reports']
];
const EXPENSE_CATEGORIES = [
  'Food & Refreshments',
  'Stationery & Printing',
  'Decoration',
  'Transport',
  'Gifts & Awards',
  'Communication',
  'Other'
];
const STAFF_CATEGORIES = ['Academic', 'Non Academic', 'Attachment'];
const STAFF_SERVICE_STATUSES = ['Active', 'Transferred', 'Temporary attachment to another school', 'Medical Leave'];

const currency = (value) => `Rs. ${Number(value || 0).toLocaleString('en-LK')}`;
const today = () => new Date().toISOString().slice(0, 10);
const canManage = (user) => ['admin', 'treasurer'].includes(user?.role);
const staffNumber = (value) => {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
};
const sortByStaffNumber = (a, b) => staffNumber(a.employeeId) - staffNumber(b.employeeId) || String(a.staffName || a.name || '').localeCompare(String(b.staffName || b.name || ''));
const staffCategory = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('non')) return 'Non Academic';
  if (normalized.includes('attach')) return 'Attachment';
  return 'Academic';
};
const publicStatusLink = (eventId) => `${window.location.origin}${window.location.pathname}?status=${encodeURIComponent(eventId)}`;

function buildPublicStatus(event, staff, contributions) {
  const activeRows = contributions
    .map((item) => {
      const person = staff.find((staffItem) => staffItem.id === item.staffId);
      return {
        employeeId: person?.employeeId || item.staffId,
        name: person?.name || item.staffName,
        category: staffCategory(person?.category || person?.section),
        exempt: !!item.exempt,
        paid: !!item.paid,
        amount: Number(item.amount || 0),
        due: item.exempt || item.paid ? 0 : Number(event.amount || 0)
      };
    })
    .sort(sortByStaffNumber);

  const paidRows = activeRows.filter((row) => row.paid && !row.exempt);
  const unpaidRows = activeRows.filter((row) => !row.paid && !row.exempt);
  const exemptRows = activeRows.filter((row) => row.exempt);
  const collected = paidRows.reduce((sum, row) => sum + row.amount, 0);
  const notCollected = unpaidRows.reduce((sum, row) => sum + row.due, 0);
  const expected = activeRows.filter((row) => !row.exempt).length * Number(event.amount || 0);

  return {
    eventId: event.id,
    eventName: event.name,
    eventDate: event.date,
    amountPerStaff: Number(event.amount || 0),
    expected,
    collected,
    notCollected,
    paidCount: paidRows.length,
    unpaidCount: unpaidRows.length,
    exemptCount: exemptRows.length,
    paidRows,
    unpaidRows,
    exemptRows,
    updatedAt: new Date().toISOString()
  };
}

function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const cells = [];
      let current = '';
      let quoted = false;
      for (const char of line) {
        if (char === '"') quoted = !quoted;
        else if (char === ',' && !quoted) {
          cells.push(current.trim());
          current = '';
        } else current += char;
      }
      cells.push(current.trim());
      return cells.map((cell) => cell.replace(/^"|"$/g, ''));
    });
}

function normalizeStaffRows(rows) {
  const headers = rows[0]?.map((h) => String(h || '').toLowerCase().trim()) || [];
  const find = (name) => headers.findIndex((h) => h.includes(name));
  const indexes = {
    employeeId: find('employee'),
    name: find('name'),
    email: find('email'),
    phone: find('phone'),
    category: find('category') >= 0 ? find('category') : find('section'),
    serviceStatus: find('service status') >= 0 ? find('service status') : find('status'),
    statusDate: find('status date') >= 0 ? find('status date') : find('date')
  };
  if (indexes.employeeId < 0 || indexes.name < 0) {
    throw new Error('Employee ID and Name columns are required.');
  }
  return rows.slice(1).map((row) => {
    const employeeId = String(row[indexes.employeeId] || '').trim();
    const name = String(row[indexes.name] || '').trim();
    if (!employeeId || !name) return null;
    return {
      id: employeeId,
      employeeId,
      name,
      email: String(row[indexes.email] || '').trim(),
      phone: String(row[indexes.phone] || '').trim(),
      category: staffCategory(row[indexes.category]),
      serviceStatus: String(row[indexes.serviceStatus] || 'Active').trim(),
      statusDate: String(row[indexes.statusDate] || '').trim(),
      updatedAt: new Date().toISOString()
    };
  }).filter(Boolean);
}

function downloadWorkbook(filename, sheets) {
  const book = XLSX.utils.book_new();
  sheets.forEach(([name, rows]) => {
    const sheet = Array.isArray(rows[0])
      ? XLSX.utils.aoa_to_sheet(rows)
      : XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(book, sheet, name.slice(0, 31));
  });
  XLSX.writeFile(book, filename);
}

async function ensureUserProfile(firebaseUser, displayName = '') {
  const userRef = doc(db, 'users', firebaseUser.uid);
  const existing = await getDoc(userRef);
  if (existing.exists()) return existing.data();

  const usersSnapshot = await getDocs(collection(db, 'users'));
  const isFirstUser = usersSnapshot.empty;
  const profile = {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: displayName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Guild User',
    role: isFirstUser ? 'admin' : 'member',
    status: isFirstUser ? 'approved' : 'pending',
    createdAt: new Date().toISOString()
  };
  await setDoc(userRef, profile);
  return profile;
}

function EmptyState({ title, text }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function AuthScreen({ onUser }) {
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const credential = mode === 'signup'
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);
      onUser(await ensureUserProfile(credential.user, name));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setError('');
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      onUser(await ensureUserProfile(credential.user));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-head">
          <div className="brand-mark"><ShieldCheck /></div>
          <div>
            <h1>Guild Accounts</h1>
            <p>Kilinochchi Central College</p>
          </div>
        </div>
        {error && <div className="alert danger"><AlertTriangle size={16} />{error}</div>}
        <form onSubmit={submit} className="form-stack">
          {mode === 'signup' && (
            <label>Full Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          )}
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></label>
          <button className="primary-btn" disabled={busy}>{mode === 'signup' ? 'Create Account' : 'Sign In'}</button>
        </form>
        <button className="google-btn" onClick={google} disabled={busy}>Continue with Google</button>
        <button className="link-btn" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
          {mode === 'signup' ? 'Already registered? Sign in' : 'New treasurer or admin? Create account'}
        </button>
      </section>
    </main>
  );
}

function PendingScreen({ user, onLogout, onRefresh }) {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-mark warn"><AlertTriangle /></div>
        <h1>Approval pending</h1>
        <p>{user.displayName}, your account is waiting for admin approval. Ask the admin to approve you as treasurer if you need account access.</p>
        <div className="row-actions">
          <button className="secondary-btn" onClick={onRefresh}>Check Status</button>
          <button className="danger-btn" onClick={onLogout}>Sign Out</button>
        </div>
      </section>
    </main>
  );
}

function PublicStatusPage({ eventId }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const statusDoc = await getDoc(doc(db, 'publicStatuses', eventId));
        if (!statusDoc.exists()) {
          setError('This event collection status link is not published yet.');
        } else {
          setStatus(statusDoc.data());
        }
      } catch (err) {
        setError(err.message || 'Unable to load event collection status.');
      } finally {
        setLoading(false);
      }
    };
    loadStatus();
  }, [eventId]);

  if (loading) {
    return <main className="public-page" onContextMenu={(event) => event.preventDefault()}><section className="public-card"><h1>Loading collection status...</h1></section></main>;
  }

  if (error) {
    return <main className="public-page" onContextMenu={(event) => event.preventDefault()}><section className="public-card"><h1>Collection Status</h1><p>{error}</p></section></main>;
  }

  return (
    <main className="public-page" onContextMenu={(event) => event.preventDefault()}>
      <section className="public-card">
        <header className="public-header">
          <div>
            <p>Kilinochchi Central College Guild</p>
            <h1>{status.eventName}</h1>
            <span>{status.eventDate} | {currency(status.amountPerStaff)} per staff</span>
          </div>
        </header>
        <div className="stats public-stats">
          <Stat title="Collected" value={currency(status.collected)} icon={Banknote} tone="good" />
          <Stat title="Not Collected" value={currency(status.notCollected)} icon={XCircle} tone="bad" />
          <Stat title="Paid / Unpaid" value={`${status.paidCount} / ${status.unpaidCount}`} icon={Users} tone="warn" />
        </div>
        <div className="public-lists">
          <PublicStatusList title={`Paid Staff (${status.paidRows.length})`} rows={status.paidRows} paid />
          <PublicStatusList title={`Not Paid Staff (${status.unpaidRows.length})`} rows={status.unpaidRows} />
        </div>
        {status.exemptRows?.length > 0 && <PublicStatusList title={`Exempt Staff (${status.exemptRows.length})`} rows={status.exemptRows} />}
        <p className="public-updated">Updated: {new Date(status.updatedAt).toLocaleString()}</p>
      </section>
    </main>
  );
}

function PublicStatusList({ title, rows, paid }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="public-list">
        {rows.map((row, index) => (
          <div className="public-row" key={`${row.employeeId}-${index}`}>
            <span>{row.employeeId}</span>
            <strong>{row.name}</strong>
            <em>{row.category}</em>
            <b>{currency(paid ? row.amount : row.due)}</b>
          </div>
        ))}
        {rows.length === 0 && <p className="muted">No records.</p>}
      </div>
    </section>
  );
}

function SetupScreen() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-mark danger"><AlertTriangle /></div>
        <h1>Firebase configuration required</h1>
        <p>Add the `VITE_FIREBASE_*` variables in `.env` locally and in Vercel before using the system.</p>
      </section>
    </main>
  );
}

function Dashboard({ user, users, staff, events, contributions, expenses, handovers, reload }) {
  const totals = useMemo(() => {
    const collected = contributions.filter((c) => c.paid && !c.exempt).reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const spent = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const handedOver = handovers.reduce((sum, h) => sum + Number(h.amount || 0), 0);
    const unpaid = contributions.filter((c) => !c.paid && !c.exempt).length;
    return { collected, spent, handedOver, balance: collected - handedOver, unpaid };
  }, [contributions, expenses, handovers]);

  const approve = async (target, role) => {
    await updateDoc(doc(db, 'users', target.uid), { status: 'approved', role });
    reload();
  };

  return (
    <div className="page">
      <PageTitle title="Dashboard" subtitle={`Welcome, ${user.displayName}`} />
      <div className="stats">
        <Stat title="Collected" value={currency(totals.collected)} icon={Banknote} tone="good" />
        <Stat title="Handed Over" value={currency(totals.handedOver)} icon={Receipt} tone="warn" />
        <Stat title="Balance" value={currency(totals.balance)} icon={FileSpreadsheet} tone={totals.balance >= 0 ? 'good' : 'bad'} />
        <Stat title="Unpaid Records" value={totals.unpaid} icon={XCircle} tone="warn" />
      </div>

      <div className="grid two">
        <section className="panel">
          <h2>Recent Events</h2>
          {events.length === 0 ? <EmptyState title="No events" text="Create an event to start collecting contributions." /> : (
            <div className="list">
              {events.slice(0, 6).map((event) => {
                const eventContributions = contributions.filter((c) => c.eventId === event.id);
                const collected = eventContributions.filter((c) => c.paid).reduce((sum, c) => sum + Number(c.amount || 0), 0);
                const expected = eventContributions.filter((c) => !c.exempt).reduce((sum, c) => sum + Number(event.amount || 0), 0);
                return (
                  <div className="list-row" key={event.id}>
                    <div><strong>{event.name}</strong><span>{event.date}</span></div>
                    <b>{currency(collected)} / {currency(expected)}</b>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {user.role === 'admin' && (
          <section className="panel">
            <h2>User Access</h2>
            <div className="list">
              {users.filter((u) => u.uid !== user.uid).map((target) => (
                <div className="approval-row" key={target.uid}>
                  <div><strong>{target.displayName}</strong><span>{target.email} | {target.status} | {target.role}</span></div>
                  <div className="row-actions">
                    <button className="secondary-btn small" onClick={() => approve(target, 'treasurer')}>Treasurer</button>
                    <button className="secondary-btn small" onClick={() => approve(target, 'member')}>Member</button>
                  </div>
                </div>
              ))}
              {users.length <= 1 && <EmptyState title="No users waiting" text="New signups will appear here." />}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function PageTitle({ title, subtitle, actions }) {
  return (
    <header className="page-title-row">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      {actions && <div className="row-actions">{actions}</div>}
    </header>
  );
}

function Stat({ title, value, icon: Icon, tone }) {
  return (
    <section className={`stat ${tone || ''}`}>
      <div><span>{title}</span><strong>{value}</strong></div>
      <Icon size={24} />
    </section>
  );
}

function StaffPage({ user, staff, reload }) {
  const [modal, setModal] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const emptyStaffForm = { employeeId: '', name: '', email: '', phone: '', category: 'Academic', serviceStatus: 'Active', statusDate: '' };
  const [form, setForm] = useState(emptyStaffForm);
  const authorized = user.role === 'admin';
  const visible = staff
    .filter((s) => [s.employeeId, s.name, s.email, staffCategory(s.category || s.section), s.serviceStatus].join(' ').toLowerCase().includes(search.toLowerCase()))
    .sort(sortByStaffNumber);

  const open = (item = null) => {
    setEditing(item);
    setForm(item ? {
      ...emptyStaffForm,
      ...item,
      category: staffCategory(item.category || item.section),
      serviceStatus: item.serviceStatus || 'Active',
      statusDate: item.statusDate || ''
    } : emptyStaffForm);
    setModal(true);
  };

  const save = async (event) => {
    event.preventDefault();
    if (form.serviceStatus !== 'Active' && !form.statusDate) {
      alert('Please add the date for transferred or temporary attachment status.');
      return;
    }
    const id = editing?.id || form.employeeId.trim();
    await setDoc(doc(db, 'staff', id), { ...form, id, employeeId: id, statusDate: form.serviceStatus === 'Active' ? '' : form.statusDate, updatedAt: new Date().toISOString() });
    setModal(false);
    reload();
  };

  const remove = async (item) => {
    if (window.confirm(`Delete ${item.name}?`)) {
      await deleteDoc(doc(db, 'staff', item.id));
      reload();
    }
  };

  const exportStaff = () => downloadWorkbook('kcc-guild-staff.xlsx', [[
    'Staff',
    staff.map((s) => ({
      'Employee ID': s.employeeId,
      Name: s.name,
      Email: s.email,
      Phone: s.phone,
      Category: staffCategory(s.category || s.section),
      'Service Status': s.serviceStatus || 'Active',
      'Status Date': s.statusDate || ''
    }))
  ]]);

  return (
    <div className="page">
      <PageTitle
        title="Staff Details"
        subtitle="Maintain the staff registry for guild collections."
        actions={authorized && <>
          <button className="secondary-btn" onClick={exportStaff}><Download size={16} />Export</button>
          <button className="secondary-btn" onClick={() => setBulk(true)}><Upload size={16} />Bulk Upload</button>
          <button className="primary-btn" onClick={() => open()}><Plus size={16} />Add Staff</button>
        </>}
      />
      <SearchBox value={search} onChange={setSearch} placeholder="Search staff..." />
      <DataTable headers={['ID', 'Name', 'Email', 'Phone', 'Category', 'Status', 'Status Date', authorized ? 'Actions' : '']}>
        {visible.map((s) => (
          <tr key={s.id}>
            <td>{s.employeeId}</td><td><strong>{s.name}</strong></td><td>{s.email}</td><td>{s.phone}</td><td>{staffCategory(s.category || s.section)}</td><td>{s.serviceStatus || 'Active'}</td><td>{s.statusDate || '-'}</td>
            {authorized && <td className="table-actions"><button onClick={() => open(s)}>Edit</button><button onClick={() => remove(s)}>Delete</button></td>}
          </tr>
        ))}
      </DataTable>

      {modal && <Modal title={editing ? 'Edit Staff' : 'Add Staff'} onClose={() => setModal(false)}>
        <form onSubmit={save} className="modal-body form-grid">
          <label>Employee ID<input disabled={!!editing} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required /></label>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{STAFF_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label>Service Status<select value={form.serviceStatus} onChange={(e) => setForm({ ...form, serviceStatus: e.target.value, statusDate: e.target.value === 'Active' ? '' : form.statusDate })}>{STAFF_SERVICE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          {form.serviceStatus !== 'Active' && <label>Status Date<input type="date" value={form.statusDate} onChange={(e) => setForm({ ...form, statusDate: e.target.value })} required /></label>}
          <footer><button className="primary-btn">Save Staff</button></footer>
        </form>
      </Modal>}

      {bulk && <BulkUploadModal onClose={() => setBulk(false)} reload={reload} />}
    </div>
  );
}

function BulkUploadModal({ onClose, reload }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  const readFile = (file) => {
    setError('');
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let rawRows;
        if (file.name.match(/\.csv$/i)) {
          rawRows = parseCsv(event.target.result);
        } else {
          const workbook = XLSX.read(event.target.result, { type: 'array' });
          rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
        }
        setRows(normalizeStaffRows(rawRows));
      } catch (err) {
        setError(err.message);
      }
    };
    file.name.match(/\.csv$/i) ? reader.readAsText(file) : reader.readAsArrayBuffer(file);
  };

  const upload = async () => {
    const batch = writeBatch(db);
    rows.forEach((s) => batch.set(doc(db, 'staff', s.id), s));
    await batch.commit();
    reload();
    onClose();
  };

  const template = () => downloadWorkbook('kcc-staff-template.xlsx', [[
    'Template',
    [
      ['Employee ID', 'Name', 'Email', 'Phone', 'Category', 'Service Status', 'Status Date'],
      ['EMP001', 'Teacher Name', 'teacher@example.com', '0770000000', 'Academic', 'Active', ''],
      ['EMP002', 'Office Staff Name', 'office@example.com', '0770000001', 'Non Academic', 'Transferred', '2026-05-28'],
      ['EMP003', 'Attachment Staff Name', 'attach@example.com', '0770000002', 'Attachment', 'Temporary attachment to another school', '2026-05-28'],
      ['EMP004', 'Medical Leave Staff Name', 'medical@example.com', '0770000003', 'Academic', 'Medical Leave', '2026-05-28']
    ]
  ]]);

  return (
    <Modal title="Bulk Upload Staff" onClose={onClose}>
      <div className="modal-body">
        <p className="muted">Upload `.xlsx`, `.xls`, or `.csv` with Employee ID, Name, Email, Phone, Category, Service Status, Status Date.</p>
        <div className="row-actions">
          <button className="secondary-btn" onClick={template}><Download size={16} />Template</button>
          <label className="file-btn"><Upload size={16} />Choose File<input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => readFile(e.target.files[0])} /></label>
        </div>
        {error && <div className="alert danger">{error}</div>}
        {rows.length > 0 && <><p>{rows.length} staff records ready.</p><button className="primary-btn" onClick={upload}>Upload to Firebase</button></>}
      </div>
    </Modal>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return <label className="search"><Search size={18} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

function DataTable({ headers, children }) {
  return (
    <section className="table-wrap">
      <table>
        <thead><tr>{headers.filter(Boolean).map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

function EventsPage({ user, staff, events, contributions, expenses, handovers, reload }) {
  const [modal, setModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: '', date: today(), amount: '', exemptIds: [] });
  const authorized = canManage(user);
  const activeStaff = staff.filter((person) => (person.serviceStatus || 'Active') === 'Active');

  const resetEventForm = () => {
    setEditingEvent(null);
    setForm({ name: '', date: today(), amount: '', exemptIds: [] });
    setModal(false);
  };

  const openCreateEvent = () => {
    setEditingEvent(null);
    setForm({ name: '', date: today(), amount: '', exemptIds: [] });
    setModal(true);
  };

  const openEditEvent = (event) => {
    setEditingEvent(event);
    setForm({
      name: event.name || '',
      date: event.date || today(),
      amount: event.amount || '',
      exemptIds: event.exemptIds || []
    });
    setModal(true);
  };

  const saveEvent = async (event) => {
    event.preventDefault();
    const id = editingEvent?.id || `event_${Date.now()}`;
    const batch = writeBatch(db);
    const existingEventContributions = contributions.filter((item) => item.eventId === id);
    const eventData = {
      id,
      name: form.name,
      date: form.date,
      amount: Number(form.amount),
      exemptIds: form.exemptIds,
      createdAt: editingEvent?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    batch.set(doc(db, 'events', id), eventData);
    if (!editingEvent) {
      activeStaff.forEach((s) => {
        const exempt = form.exemptIds.includes(s.id);
        const cid = `${id}_${s.id}`;
        batch.set(doc(db, 'contributions', cid), { id: cid, eventId: id, staffId: s.id, staffName: s.name, exempt, paid: false, amount: 0, updatedAt: new Date().toISOString() });
      });
    } else {
      existingEventContributions.forEach((item) => {
        const exempt = form.exemptIds.includes(item.staffId);
        batch.update(doc(db, 'contributions', item.id), {
          exempt,
          amount: exempt ? 0 : Number(item.amount || 0),
          paid: exempt ? false : !!item.paid,
          updatedAt: new Date().toISOString()
        });
      });
    }
    await batch.commit();
    const savedContributions = !editingEvent
      ? activeStaff.map((s) => ({
        id: `${id}_${s.id}`,
        eventId: id,
        staffId: s.id,
        staffName: s.name,
        exempt: form.exemptIds.includes(s.id),
        paid: false,
        amount: 0,
        updatedAt: new Date().toISOString()
      }))
      : existingEventContributions.map((item) => ({
        ...item,
        exempt: form.exemptIds.includes(item.staffId),
        amount: form.exemptIds.includes(item.staffId) ? 0 : Number(item.amount || 0),
        paid: form.exemptIds.includes(item.staffId) ? false : !!item.paid
      }));
    await setDoc(doc(db, 'publicStatuses', id), buildPublicStatus(eventData, staff, savedContributions));
    resetEventForm();
    reload();
  };

  const remove = async (event) => {
    if (!window.confirm(`Delete ${event.name} and all linked records?`)) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'events', event.id));
    batch.delete(doc(db, 'publicStatuses', event.id));
    contributions.filter((c) => c.eventId === event.id).forEach((c) => batch.delete(doc(db, 'contributions', c.id)));
    expenses.filter((e) => e.eventId === event.id).forEach((e) => batch.delete(doc(db, 'expenses', e.id)));
    handovers.filter((h) => h.eventId === event.id).forEach((h) => batch.delete(doc(db, 'handovers', h.id)));
    await batch.commit();
    reload();
  };

  if (selected) {
    return <EventDetail event={selected} staff={staff} contributions={contributions.filter((c) => c.eventId === selected.id)} expenses={expenses.filter((e) => e.eventId === selected.id)} handovers={handovers.filter((h) => h.eventId === selected.id)} authorized={authorized} onBack={() => setSelected(null)} reload={reload} />;
  }

  return (
    <div className="page">
      <PageTitle title="Events & Contributions" subtitle="Create events, exempt organizers, and record staff payments." actions={authorized && <button className="primary-btn" onClick={openCreateEvent}><Plus size={16} />New Event</button>} />
      <div className="cards">
        {events.map((event) => {
          const eventRows = contributions.filter((c) => c.eventId === event.id);
          const collected = eventRows.filter((c) => c.paid).reduce((sum, c) => sum + Number(c.amount || 0), 0);
          const expected = eventRows.filter((c) => !c.exempt).length * Number(event.amount || 0);
          const unpaid = eventRows.filter((c) => !c.exempt && !c.paid).length;
          const handedOver = handovers.filter((h) => h.eventId === event.id).reduce((sum, h) => sum + Number(h.amount || 0), 0);
          return (
            <section className="event-card" key={event.id}>
              <header><div><h2>{event.name}</h2><p>{event.date}</p></div>{authorized && <button className="icon-btn danger" onClick={() => remove(event)}><Trash2 size={16} /></button>}</header>
              <div className="event-metrics"><span>Collected <b>{currency(collected)}</b></span><span>Handed Over <b>{currency(handedOver)}</b></span><span>Balance <b>{currency(collected - handedOver)}</b></span><span>Unpaid <b>{unpaid}</b></span></div>
              <div className="row-actions">
                {authorized && <button className="secondary-btn" onClick={() => openEditEvent(event)}>Edit Event</button>}
                <button className="secondary-btn" onClick={() => setSelected(event)}>Manage Payments</button>
              </div>
            </section>
          );
        })}
      </div>
      {events.length === 0 && <EmptyState title="No events yet" text="Create your first guild event to start tracking contributions." />}
      {modal && <Modal title={editingEvent ? 'Edit Event' : 'Create Event'} onClose={resetEventForm}>
        <form onSubmit={saveEvent} className="modal-body form-stack">
          <label>Event Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Event Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
          <label>Contribution Per Staff<input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
          <div><strong>Exempt event staff</strong><div className="check-grid">
            {activeStaff.map((s) => <label key={s.id}><input type="checkbox" checked={form.exemptIds.includes(s.id)} onChange={(e) => setForm({ ...form, exemptIds: e.target.checked ? [...form.exemptIds, s.id] : form.exemptIds.filter((id) => id !== s.id) })} />{s.name}</label>)}
          </div></div>
          <button className="primary-btn">{editingEvent ? 'Save Event' : 'Create Event'}</button>
        </form>
      </Modal>}
    </div>
  );
}

function EventDetail({ event, staff, contributions, expenses, handovers, authorized, onBack, reload }) {
  const [search, setSearch] = useState('');
  const [handoverForm, setHandoverForm] = useState({ amount: '', date: today(), receiver: '', note: '' });
  const visible = contributions.filter((c) => c.staffName.toLowerCase().includes(search.toLowerCase()));
  const collected = contributions.filter((c) => c.paid).reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const expected = contributions.filter((c) => !c.exempt).length * Number(event.amount || 0);
  const handedOver = handovers.reduce((sum, h) => sum + Number(h.amount || 0), 0);
  const spent = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const cashBalance = collected - handedOver;
  const eventBalance = handedOver - spent;
  const missingActiveStaff = staff
    .filter((person) => (person.serviceStatus || 'Active') === 'Active')
    .filter((person) => !contributions.some((item) => item.staffId === person.id))
    .sort(sortByStaffNumber);

  const updateContribution = async (item, changes) => {
    const updatedItem = { ...item, ...changes, updatedAt: new Date().toISOString() };
    await updateDoc(doc(db, 'contributions', item.id), updatedItem);
    const updatedContributions = contributions.map((contribution) => contribution.id === item.id ? updatedItem : contribution);
    await setDoc(doc(db, 'publicStatuses', event.id), buildPublicStatus(event, staff, updatedContributions));
    reload();
  };

  const publishStatus = async () => {
    await setDoc(doc(db, 'publicStatuses', event.id), buildPublicStatus(event, staff, contributions));
    const link = publicStatusLink(event.id);
    await navigator.clipboard?.writeText(link);
    alert(`Public collection status link copied:\n${link}`);
  };

  const syncMissingStaff = async () => {
    if (!missingActiveStaff.length) {
      alert('No missing active staff found for this event.');
      return;
    }
    const batch = writeBatch(db);
    missingActiveStaff.forEach((person) => {
      const contributionId = `${event.id}_${person.id}`;
      const exempt = event.exemptIds?.includes(person.id);
      batch.set(doc(db, 'contributions', contributionId), {
        id: contributionId,
        eventId: event.id,
        staffId: person.id,
        staffName: person.name,
        exempt,
        paid: false,
        amount: 0,
        updatedAt: new Date().toISOString()
      });
    });
    await batch.commit();
    const added = missingActiveStaff.map((person) => ({
      id: `${event.id}_${person.id}`,
      eventId: event.id,
      staffId: person.id,
      staffName: person.name,
      exempt: event.exemptIds?.includes(person.id),
      paid: false,
      amount: 0,
      updatedAt: new Date().toISOString()
    }));
    await setDoc(doc(db, 'publicStatuses', event.id), buildPublicStatus(event, staff, [...contributions, ...added]));
    reload();
    alert(`${missingActiveStaff.length} missing staff added to this event.`);
  };

  const saveHandover = async (submitEvent) => {
    submitEvent.preventDefault();
    const id = `handover_${Date.now()}`;
    await setDoc(doc(db, 'handovers', id), {
      id,
      eventId: event.id,
      eventName: event.name,
      amount: Number(handoverForm.amount),
      date: handoverForm.date,
      receiver: handoverForm.receiver.trim(),
      note: handoverForm.note.trim(),
      createdAt: new Date().toISOString()
    });
    setHandoverForm({ amount: '', date: today(), receiver: '', note: '' });
    reload();
  };

  const deleteHandover = async (handover) => {
    if (!window.confirm('Delete this handed over amount?')) return;
    await deleteDoc(doc(db, 'handovers', handover.id));
    reload();
  };

  return (
    <div className="page">
      <button className="secondary-btn" onClick={onBack}><ChevronLeft size={16} />Back</button>
      <PageTitle title={event.name} subtitle={`${event.date} | ${currency(event.amount)} per staff`} actions={authorized && <>
        <button className="secondary-btn" onClick={publishStatus}>Publish/Copy Public Link</button>
        <button className="secondary-btn" onClick={() => window.open(publicStatusLink(event.id), '_blank', 'noopener,noreferrer')}>Open Public Status</button>
        <button className="secondary-btn" onClick={syncMissingStaff}>Add Missing Staff ({missingActiveStaff.length})</button>
      </>} />
      <div className="stats">
        <Stat title="Collected" value={currency(collected)} icon={CheckCircle2} tone="good" />
        <Stat title="Handed Over" value={currency(handedOver)} icon={Banknote} tone="warn" />
        <Stat title="Guild Cash Balance" value={currency(cashBalance)} icon={FileSpreadsheet} tone={cashBalance >= 0 ? 'good' : 'bad'} />
        <Stat title="Event Balance" value={currency(eventBalance)} icon={Receipt} tone={eventBalance >= 0 ? 'good' : 'bad'} />
      </div>
      <section className="panel">
        <h2>Amount Handed Over to Event</h2>
        {authorized && (
          <form className="handover-form" onSubmit={saveHandover}>
            <label>Amount<input type="number" min="1" value={handoverForm.amount} onChange={(e) => setHandoverForm({ ...handoverForm, amount: e.target.value })} required /></label>
            <label>Date<input type="date" value={handoverForm.date} onChange={(e) => setHandoverForm({ ...handoverForm, date: e.target.value })} required /></label>
            <label>Receiver<input value={handoverForm.receiver} onChange={(e) => setHandoverForm({ ...handoverForm, receiver: e.target.value })} placeholder="Event treasurer / organizer" required /></label>
            <label>Note<input value={handoverForm.note} onChange={(e) => setHandoverForm({ ...handoverForm, note: e.target.value })} placeholder="Optional" /></label>
            <button className="primary-btn">Add Handover</button>
          </form>
        )}
        <DataTable headers={['Date', 'Receiver', 'Note', 'Amount', authorized ? 'Action' : '']}>
          {handovers.map((handover) => (
            <tr key={handover.id}>
              <td>{handover.date}</td>
              <td>{handover.receiver}</td>
              <td>{handover.note || '-'}</td>
              <td className="money-cell"><strong>{currency(handover.amount)}</strong></td>
              {authorized && <td><button className="danger-btn small" onClick={() => deleteHandover(handover)}>Delete</button></td>}
            </tr>
          ))}
        </DataTable>
      </section>
      <SearchBox value={search} onChange={setSearch} placeholder="Search contribution records..." />
      <DataTable headers={['Staff', 'Status', 'Amount', authorized ? 'Action' : '']}>
        {visible.map((c) => {
          const s = staff.find((item) => item.id === c.staffId);
          return <tr key={c.id}>
            <td><strong>{c.staffName}</strong><span className="subtext">{s?.employeeId}</span></td>
            <td>{c.exempt ? <span className="badge warn">Exempt</span> : c.paid ? <span className="badge good">Paid</span> : <span className="badge bad">Unpaid</span>}</td>
            <td><input disabled={!authorized || c.exempt} type="number" value={c.amount || ''} onChange={(e) => updateContribution(c, { amount: Number(e.target.value), paid: Number(e.target.value) > 0 })} /></td>
            {authorized && <td><button className="secondary-btn small" disabled={c.exempt} onClick={() => updateContribution(c, { paid: !c.paid, amount: c.paid ? 0 : Number(event.amount || 0) })}>{c.paid ? 'Mark Unpaid' : 'Mark Paid'}</button></td>}
          </tr>;
        })}
      </DataTable>
    </div>
  );
}

function ExpensesPage({ user, events, expenses, contributions, handovers, reload }) {
  const [modal, setModal] = useState(false);
  const [eventFilter, setEventFilter] = useState('');
  const [preview, setPreview] = useState(null);
  const authorized = canManage(user);
  const visible = eventFilter ? expenses.filter((e) => e.eventId === eventFilter) : expenses;
  const selectedEvent = events.find((e) => e.id === eventFilter);
  const collected = contributions.filter((c) => c.eventId === eventFilter && c.paid).reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const spent = expenses.filter((e) => e.eventId === eventFilter).reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const handedOver = handovers.filter((h) => h.eventId === eventFilter).reduce((sum, h) => sum + Number(h.amount || 0), 0);

  const remove = async (expense) => {
    if (window.confirm('Delete this expense?')) {
      await deleteDoc(doc(db, 'expenses', expense.id));
      reload();
    }
  };

  return (
    <div className="page">
      <PageTitle title="Expenses" subtitle="Record spending with bill photos and event balances." actions={authorized && <button className="primary-btn" onClick={() => setModal(true)}><Plus size={16} />Add Expense</button>} />
      <label className="filter">Event Filter<select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}><option value="">All events</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      {selectedEvent && <div className="stats"><Stat title="Collected" value={currency(collected)} icon={Banknote} tone="good" /><Stat title="Handed Over" value={currency(handedOver)} icon={Banknote} tone="warn" /><Stat title="Spent" value={currency(spent)} icon={Receipt} tone="bad" /><Stat title="Event Balance" value={currency(handedOver - spent)} icon={FileSpreadsheet} tone={handedOver - spent >= 0 ? 'good' : 'bad'} /></div>}
      <DataTable headers={['Event', 'Category', 'Date', 'Description', 'Bill', 'Amount', authorized ? 'Actions' : '']}>
        {visible.map((e) => <tr key={e.id}><td>{e.eventName}</td><td>{e.category}</td><td>{e.date}</td><td>{e.description}</td><td>{e.billUrl ? <button className="link-btn" onClick={() => setPreview(e.billUrl)}>View</button> : '-'}</td><td><strong>{currency(e.amount)}</strong></td>{authorized && <td><button className="danger-btn small" onClick={() => remove(e)}>Delete</button></td>}</tr>)}
      </DataTable>
      {modal && <ExpenseModal events={events} onClose={() => setModal(false)} reload={reload} />}
      {preview && <Modal title="Bill Photo" onClose={() => setPreview(null)}><div className="modal-body"><img className="bill-preview" src={preview} alt="Bill" /></div></Modal>}
    </div>
  );
}

function ExpenseModal({ events, onClose, reload }) {
  const [form, setForm] = useState({ eventId: '', category: EXPENSE_CATEGORIES[0], amount: '', date: today(), description: '', file: null });
  const [busy, setBusy] = useState(false);
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const id = `expense_${Date.now()}`;
      const eventItem = events.find((e) => e.id === form.eventId);
      let billUrl = '';
      if (form.file) {
        const billRef = ref(storage, `bills/${form.eventId}/${id}-${form.file.name}`);
        const uploaded = await uploadBytes(billRef, form.file);
        billUrl = await getDownloadURL(uploaded.ref);
      }
      await setDoc(doc(db, 'expenses', id), { id, eventId: form.eventId, eventName: eventItem?.name || '', category: form.category, amount: Number(form.amount), date: form.date, description: form.description, billUrl, createdAt: new Date().toISOString() });
      reload();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return <Modal title="Add Expense" onClose={onClose}><form onSubmit={save} className="modal-body form-stack">
    <label>Event<select value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value })} required><option value="">Select event</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
    <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
    <label>Amount<input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
    <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
    <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></label>
    <label className="file-field"><ImagePlus size={18} />Bill Photo<input type="file" accept="image/*" onChange={(e) => setForm({ ...form, file: e.target.files[0] })} /></label>
    <button className="primary-btn" disabled={busy}>{busy ? 'Saving...' : 'Save Expense'}</button>
  </form></Modal>;
}

function ReportsPage({ staff, events, contributions, expenses, handovers }) {
  const [mode, setMode] = useState('event');
  const [eventId, setEventId] = useState('');
  const [eventIds, setEventIds] = useState([]);
  const [range, setRange] = useState({ start: '', end: '' });
  const [view, setView] = useState('details');
  const [status, setStatus] = useState('all');
  const statusOptions = view === 'account'
    ? [['all', 'All Events']]
    : view === 'staff'
    ? [
      ['all', 'All Staff'],
      ['paid', 'Fully Paid'],
      ['unpaid', 'Not Paid Any'],
      ['outstanding', 'Has Outstanding'],
      ['exempt', 'Exempt Only']
    ]
    : [
      ['all', 'All Records'],
      ['paid', 'Paid Only'],
      ['unpaid', 'Unpaid Only'],
      ['exempt', 'Exempt Only']
    ];
  const report = useMemo(() => buildReport({ mode, eventId, eventIds, range, view, status, staff, events, contributions, expenses, handovers }), [mode, eventId, eventIds, range, view, status, staff, events, contributions, expenses, handovers]);

  const shareText = () => encodeURIComponent(report.summaryText || 'No report selected.');
  const exportExcel = () => report.sheets.length && downloadWorkbook(report.filename.replace('.pdf', '.xlsx'), report.sheets);
  const createPdf = () => {
    if (!report.rows.length) return;
    const pdf = new jsPDF({ orientation: report.pdfOrientation || report.orientation || 'portrait', unit: 'mm', format: 'a4' });
    pdf.setFontSize(14);
    pdf.text(APP_NAME, 14, 14);
    pdf.setFontSize(10);
    pdf.text(report.title, 14, 22);
    autoTable(pdf, {
      startY: 30,
      head: [report.pdfHeaders || report.headers],
      body: report.pdfRows || report.rows,
      theme: 'striped',
      margin: { left: 10, right: 10 },
      headStyles: { fillColor: [41, 128, 185], fontSize: report.pdfHeadFontSize || 9, cellPadding: 2 },
      styles: { fontSize: report.pdfFontSize || 8.5, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
      columnStyles: report.pdfColumnStyles || report.columnStyles || {}
    });
    return pdf;
  };
  const exportPdf = () => {
    const pdf = createPdf();
    if (!pdf) return;
    pdf.save(report.filename);
  };
  const sharePdfWhatsapp = async () => {
    const pdf = createPdf();
    if (!pdf) return;
    const blob = pdf.output('blob');
    const file = new File([blob], report.filename, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: report.title,
        text: report.summaryText,
        files: [file]
      });
      return;
    }
    pdf.save(report.filename);
    window.open(`https://api.whatsapp.com/send?text=${shareText()}`, '_blank', 'noopener,noreferrer');
    alert('Your browser cannot attach a PDF directly to WhatsApp. The PDF has been downloaded; attach it manually in WhatsApp.');
  };
  const createSignaturePdf = () => {
    if (!report.signatureRows?.length) return;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.setFontSize(14);
    pdf.text(APP_NAME, 14, 14);
    pdf.setFontSize(11);
    pdf.text(`${report.title} - Signature Sheet`, 14, 22);
    pdf.setFontSize(9);
    pdf.text(`Generated: ${today()}`, 14, 28);
    autoTable(pdf, {
      startY: 34,
      head: [['No', 'Name', 'Amount Paid', 'Signature']],
      body: report.signatureRows,
      theme: 'grid',
      margin: { left: 12, right: 12 },
      headStyles: { fillColor: [41, 128, 185], fontSize: 10 },
      styles: { fontSize: 9, cellPadding: 3, minCellHeight: 10 },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: 86 },
        2: { cellWidth: 34, halign: 'right' },
        3: { cellWidth: 50 }
      }
    });
    return pdf;
  };
  const exportSignaturePdf = () => {
    const pdf = createSignaturePdf();
    if (pdf) pdf.save(report.signatureFilename);
  };
  const printSignaturePdf = () => {
    const pdf = createSignaturePdf();
    if (!pdf) return;
    pdf.autoPrint();
    window.open(pdf.output('bloburl'), '_blank', 'noopener,noreferrer');
  };
  const shareSignatureWhatsapp = async () => {
    const pdf = createSignaturePdf();
    if (!pdf) return;
    const blob = pdf.output('blob');
    const file = new File([blob], report.signatureFilename, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: `${report.title} Signature Sheet`, text: 'Signature sheet attached.', files: [file] });
      return;
    }
    pdf.save(report.signatureFilename);
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`${report.title} signature sheet PDF downloaded. Please attach the downloaded PDF.`)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="page">
      <PageTitle title="Reports" subtitle="Paid, unpaid, outstanding, event-wise, and staff-wise reports." />
      <div className="tabs">
        <button className={mode === 'event' ? 'active' : ''} onClick={() => setMode('event')}>Single Event</button>
        <button className={mode === 'events' ? 'active' : ''} onClick={() => setMode('events')}>Selected Events</button>
        <button className={mode === 'range' ? 'active' : ''} onClick={() => setMode('range')}>Custom Range</button>
      </div>
      <section className="panel report-controls">
        {mode === 'event' && (
          <label>Event<select value={eventId} onChange={(e) => setEventId(e.target.value)}><option value="">Select event</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        )}
        {mode === 'events' && (
          <div className="multi-select">
            <strong>Choose Events</strong>
            {events.map((event) => (
              <label key={event.id}>
                <input
                  type="checkbox"
                  checked={eventIds.includes(event.id)}
                  onChange={(e) => setEventIds(e.target.checked ? [...eventIds, event.id] : eventIds.filter((id) => id !== event.id))}
                />
                {event.name}
              </label>
            ))}
          </div>
        )}
        {mode === 'range' && <>
          <label>Start<input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} /></label>
          <label>End<input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} /></label>
        </>}
        <label>Report View<select value={view} onChange={(e) => { setView(e.target.value); setStatus('all'); }}><option value="details">Payment Details</option><option value="staff">Staff Summary</option><option value="account">Event Account Sheet</option></select></label>
        <label>Status Filter<select value={status} onChange={(e) => setStatus(e.target.value)}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="row-actions">
          <button className="secondary-btn" disabled={!report.rows.length} onClick={exportExcel}><FileSpreadsheet size={16} />Excel</button>
          <button className="secondary-btn" disabled={!report.rows.length} onClick={exportPdf}><FileText size={16} />PDF</button>
          <button className="secondary-btn" disabled={!report.rows.length} onClick={() => { const pdf = createPdf(); if (pdf) { pdf.autoPrint(); window.open(pdf.output('bloburl'), '_blank', 'noopener,noreferrer'); } }}><FileText size={16} />Print</button>
          <a className="secondary-btn" href={`mailto:?subject=${encodeURIComponent(report.title)}&body=${shareText()}`}><Mail size={16} />Email</a>
          <button className="secondary-btn" disabled={!report.rows.length} onClick={sharePdfWhatsapp}><Send size={16} />WhatsApp PDF</button>
        </div>
      </section>
      <section className="panel signature-actions">
        <div>
          <h2>Manual Signature Sheet</h2>
          <p className="muted">A4 sheet for file documentation: No, Name, Amount Paid, Signature.</p>
        </div>
        <div className="row-actions">
          <button className="secondary-btn" disabled={!report.signatureRows?.length} onClick={exportSignaturePdf}><FileText size={16} />Signature PDF</button>
          <button className="secondary-btn" disabled={!report.signatureRows?.length} onClick={printSignaturePdf}><FileText size={16} />Print Sheet</button>
          <button className="secondary-btn" disabled={!report.signatureRows?.length} onClick={shareSignatureWhatsapp}><Send size={16} />WhatsApp Sheet</button>
        </div>
      </section>
      {report.stats && (
        <div className="stats">
          <Stat title="Events" value={report.stats.events} icon={CalendarDays} />
          <Stat title="Collected" value={currency(report.stats.collected)} icon={Banknote} tone="good" />
          <Stat title="Handed Over" value={currency(report.stats.handedOver)} icon={Receipt} tone="warn" />
          <Stat title="Guild Balance" value={currency(report.stats.collected - report.stats.handedOver)} icon={FileSpreadsheet} tone={report.stats.collected - report.stats.handedOver >= 0 ? 'good' : 'bad'} />
        </div>
      )}
      {report.rows.length ? <DataTable headers={report.headers}>{report.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td className={report.headers[j]?.includes('Paid') ? 'money-cell' : ''} key={j}>{cell}</td>)}</tr>)}</DataTable> : <EmptyState title="No report selected" text="Choose an event or date range to generate a report." />}
    </div>
  );
}

function buildReport({ mode, eventId, eventIds, range, view, status, staff, events, contributions, expenses, handovers }) {
  let selectedEvents = [];
  if (mode === 'event') selectedEvents = events.filter((event) => event.id === eventId);
  if (mode === 'events') selectedEvents = events.filter((event) => eventIds.includes(event.id));
  if (mode === 'range') selectedEvents = events.filter((event) => range.start && range.end && event.date >= range.start && event.date <= range.end);

  if (!selectedEvents.length) {
    return { title: 'Guild Report', headers: [], rows: [], sheets: [], filename: 'guild-report.pdf' };
  }

  const sortedStaff = [...staff].sort(sortByStaffNumber);
  const detailRecords = selectedEvents.flatMap((event) => sortedStaff.map((person) => {
    const exempt = event.exemptIds?.includes(person.id);
    const contribution = contributions.find((item) => item.eventId === event.id && item.staffId === person.id);
    const paid = !exempt && !!contribution?.paid;
    const paidAmount = paid ? Number(contribution.amount || 0) : 0;
    const dueAmount = exempt || paid ? 0 : Number(event.amount || 0);
    return {
      eventId: event.id,
      eventName: event.name,
      eventDate: event.date,
      employeeId: person.employeeId,
      staffName: person.name,
      category: staffCategory(person.category || person.section),
      serviceStatus: person.serviceStatus || 'Active',
      statusDate: person.statusDate || '',
      status: exempt ? 'Exempt' : paid ? 'Paid' : 'Unpaid',
      paidAmount,
      dueAmount
    };
  }));

  const staffRecords = sortedStaff.map((person) => {
    const records = detailRecords.filter((record) => record.employeeId === person.employeeId);
    return {
      employeeId: person.employeeId,
      staffName: person.name,
      category: staffCategory(person.category || person.section),
      serviceStatus: person.serviceStatus || 'Active',
      statusDate: person.statusDate || '',
      paidEvents: records.filter((record) => record.status === 'Paid').length,
      unpaidEvents: records.filter((record) => record.status === 'Unpaid').length,
      exemptEvents: records.filter((record) => record.status === 'Exempt').length,
      paidAmount: records.reduce((sum, record) => sum + record.paidAmount, 0),
      dueAmount: records.reduce((sum, record) => sum + record.dueAmount, 0)
    };
  });
  const accountRecords = selectedEvents.map((event) => {
    const eventContributions = detailRecords.filter((record) => record.eventId === event.id);
    const collected = eventContributions.reduce((sum, record) => sum + record.paidAmount, 0);
    const due = eventContributions.reduce((sum, record) => sum + record.dueAmount, 0);
    const handedOver = handovers.filter((handover) => handover.eventId === event.id).reduce((sum, handover) => sum + Number(handover.amount || 0), 0);
    const spent = expenses.filter((expense) => expense.eventId === event.id).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    return {
      eventId: event.id,
      eventName: event.name,
      eventDate: event.date,
      collected,
      due,
      handedOver,
      spent,
      guildBalance: collected - handedOver,
      eventBalance: handedOver - spent,
      paidCount: eventContributions.filter((record) => record.status === 'Paid').length,
      unpaidCount: eventContributions.filter((record) => record.status === 'Unpaid').length
    };
  });

  const filterDetails = (record) => {
    if (status === 'paid') return record.status === 'Paid';
    if (status === 'unpaid' || status === 'outstanding') return record.status === 'Unpaid';
    if (status === 'exempt') return record.status === 'Exempt';
    return true;
  };
  const filterStaff = (record) => {
    if (status === 'paid') return record.dueAmount === 0 && record.paidEvents > 0;
    if (status === 'unpaid') return record.paidAmount === 0 && record.dueAmount > 0;
    if (status === 'outstanding') return record.dueAmount > 0;
    if (status === 'exempt') return record.exemptEvents > 0 && record.paidEvents === 0 && record.unpaidEvents === 0;
    return true;
  };

  const visibleDetails = detailRecords.filter(filterDetails).sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.eventName.localeCompare(b.eventName) || sortByStaffNumber(a, b));
  const visibleStaff = staffRecords.filter(filterStaff).sort(sortByStaffNumber);
  const rows = view === 'account'
    ? accountRecords.map((record) => [record.eventDate, record.eventName, currency(record.collected), currency(record.due), currency(record.handedOver), currency(record.spent), currency(record.guildBalance), currency(record.eventBalance)])
    : view === 'staff'
    ? visibleStaff.map((record) => [record.employeeId, record.staffName, record.category, record.serviceStatus, record.paidEvents, record.unpaidEvents, currency(record.paidAmount), currency(record.dueAmount)])
    : visibleDetails.map((record) => [record.eventName, record.eventDate, record.employeeId, record.staffName, record.category, record.serviceStatus, record.status, currency(record.paidAmount), currency(record.dueAmount)]);

  const headers = view === 'account'
    ? ['Date', 'Event', 'Collected', 'Not Collected', 'Handed Over', 'Expenses', 'Guild Balance', 'Event Balance']
    : view === 'staff'
    ? ['ID', 'Staff', 'Category', 'Service Status', 'Paid Events', 'Unpaid Events', 'Total Paid', 'Total Not Paid']
    : ['Event', 'Date', 'ID', 'Staff', 'Category', 'Service Status', 'Payment Status', 'Paid', 'Not Paid'];
  const singleEventPaymentPdf = mode === 'event' && view === 'details';
  const accountView = view === 'account';
  const pdfHeaders = singleEventPaymentPdf
    ? ['No', 'ID', 'Staff', 'Category', 'Status', 'Paid', 'Not Paid']
    : headers;
  const pdfRows = singleEventPaymentPdf
    ? visibleDetails.map((record, index) => [index + 1, record.employeeId, record.staffName, record.category, record.status, currency(record.paidAmount), currency(record.dueAmount)])
    : rows;

  const collected = detailRecords.reduce((sum, record) => sum + record.paidAmount, 0);
  const due = detailRecords.reduce((sum, record) => sum + record.dueAmount, 0);
  const spent = selectedEvents.reduce((sum, event) => sum + expenses.filter((expense) => expense.eventId === event.id).reduce((inner, expense) => inner + Number(expense.amount || 0), 0), 0);
  const handedOver = selectedEvents.reduce((sum, event) => sum + handovers.filter((handover) => handover.eventId === event.id).reduce((inner, handover) => inner + Number(handover.amount || 0), 0), 0);
  const paidCount = detailRecords.filter((record) => record.status === 'Paid').length;
  const unpaidCount = detailRecords.filter((record) => record.status === 'Unpaid').length;
  const title = mode === 'event'
    ? `${selectedEvents[0].name} Payment Report`
    : mode === 'events'
      ? `Selected Events Payment Report`
      : `Payment Report ${range.start} to ${range.end}`;
  const signatureSource = mode === 'event'
    ? visibleDetails.filter((record) => record.status !== 'Exempt')
    : visibleStaff.filter((record) => record.serviceStatus === 'Active');
  const signatureRows = signatureSource.map((record, index) => [
    index + 1,
    mode === 'event' || !record.eventName ? record.staffName : `${record.staffName} (${record.eventName})`,
    currency(record.paidAmount || (mode === 'event' ? selectedEvents[0]?.amount : 0)),
    ''
  ]);

  return {
    title,
    headers,
    rows,
    pdfHeaders,
    pdfRows,
    filename: `${title.replace(/\s+/g, '-').toLowerCase()}.pdf`,
    signatureFilename: `${title.replace(/\s+/g, '-').toLowerCase()}-signature-sheet.pdf`,
    signatureRows,
    pdfOrientation: accountView ? 'landscape' : singleEventPaymentPdf || view === 'staff' ? 'portrait' : 'landscape',
    pdfFontSize: singleEventPaymentPdf ? 8.8 : 8.2,
    pdfHeadFontSize: singleEventPaymentPdf ? 9 : 8.5,
    pdfColumnStyles: accountView
      ? {
        0: { cellWidth: 22 },
        1: { cellWidth: 58 },
        2: { cellWidth: 28, halign: 'right', overflow: 'visible' },
        3: { cellWidth: 30, halign: 'right', overflow: 'visible' },
        4: { cellWidth: 30, halign: 'right', overflow: 'visible' },
        5: { cellWidth: 28, halign: 'right', overflow: 'visible' },
        6: { cellWidth: 30, halign: 'right', overflow: 'visible' },
        7: { cellWidth: 30, halign: 'right', overflow: 'visible' }
      }
      : singleEventPaymentPdf
      ? {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 14, halign: 'center' },
        2: { cellWidth: 74 },
        3: { cellWidth: 28 },
        4: { cellWidth: 24 },
        5: { cellWidth: 18, halign: 'right', overflow: 'visible' },
        6: { cellWidth: 20, halign: 'right', overflow: 'visible' }
      }
      : undefined,
    orientation: view === 'staff' ? 'portrait' : 'landscape',
    columnStyles: view === 'staff'
      ? {
        0: { cellWidth: 16 },
        1: { cellWidth: 42 },
        2: { cellWidth: 24 },
        3: { cellWidth: 28 },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 22, halign: 'center' },
        6: { cellWidth: 24, halign: 'right', overflow: 'visible' },
        7: { cellWidth: 24, halign: 'right', overflow: 'visible' }
      }
      : {
        0: { cellWidth: 22 },
        1: { cellWidth: 22 },
        2: { cellWidth: 12, halign: 'center' },
        3: { cellWidth: 56 },
        4: { cellWidth: 24 },
        5: { cellWidth: 28 },
        6: { cellWidth: 25 },
        7: { cellWidth: 22, halign: 'right', overflow: 'visible' },
        8: { cellWidth: 22, halign: 'right', overflow: 'visible' }
      },
    stats: { events: selectedEvents.length, collected, due, handedOver, spent, paidCount, unpaidCount },
    summaryText: `${APP_NAME}\n${title}\nEvents: ${selectedEvents.length}\nCollected: ${currency(collected)}\nNot Collected: ${currency(due)}\nHanded Over: ${currency(handedOver)}\nExpenses: ${currency(spent)}\nGuild Balance: ${currency(collected - handedOver)}\nEvent Balance: ${currency(handedOver - spent)}\nPaid records: ${paidCount}\nUnpaid records: ${unpaidCount}`,
    sheets: [
      ['Account Sheet', accountRecords.map((record) => ({
        Date: record.eventDate,
        Event: record.eventName,
        Collected: record.collected,
        'Not Collected': record.due,
        'Handed Over': record.handedOver,
        Expenses: record.spent,
        'Guild Balance': record.guildBalance,
        'Event Balance': record.eventBalance,
        Paid: record.paidCount,
        Unpaid: record.unpaidCount
      }))],
      ['Payment Details', visibleDetails.map((record) => ({
        Event: record.eventName,
        Date: record.eventDate,
        ID: record.employeeId,
        Staff: record.staffName,
        Category: record.category,
        'Service Status': record.serviceStatus,
        'Status Date': record.statusDate,
        Status: record.status,
        Paid: record.paidAmount,
        'Not Paid': record.dueAmount
      }))],
      ['Staff Summary', visibleStaff.map((record) => ({
        ID: record.employeeId,
        Staff: record.staffName,
        Category: record.category,
        'Service Status': record.serviceStatus,
        'Status Date': record.statusDate,
        'Paid Events': record.paidEvents,
        'Unpaid Events': record.unpaidEvents,
        'Exempt Events': record.exemptEvents,
        'Total Paid': record.paidAmount,
        'Total Not Paid': record.dueAmount
      }))],
      ['Event Summary', selectedEvents.map((event) => {
        const account = accountRecords.find((record) => record.eventId === event.id);
        const records = detailRecords.filter((record) => record.eventId === event.id);
        return {
          Event: event.name,
          Date: event.date,
          Collected: account.collected,
          'Not Collected': account.due,
          'Handed Over': account.handedOver,
          Expenses: account.spent,
          'Guild Balance': account.guildBalance,
          'Event Balance': account.eventBalance,
          Paid: records.filter((record) => record.status === 'Paid').length,
          Unpaid: records.filter((record) => record.status === 'Unpaid').length,
          Exempt: records.filter((record) => record.status === 'Exempt').length
        };
      })]
    ]
  };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [menu, setMenu] = useState(false);
  const [data, setData] = useState({ users: [], staff: [], events: [], contributions: [], expenses: [], handovers: [] });

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  const refreshUser = async () => {
    const current = auth.currentUser;
    if (!current) return;
    const profile = await getDoc(doc(db, 'users', current.uid));
    if (profile.exists()) setUser(profile.data());
  };

  const loadData = async () => {
    if (!user || user.status !== 'approved') return;
    const [usersSnap, staffSnap, eventsSnap, contributionsSnap, expensesSnap, handoversSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(query(collection(db, 'staff'), orderBy('name'))),
      getDocs(query(collection(db, 'events'), orderBy('date', 'desc'))),
      getDocs(collection(db, 'contributions')),
      getDocs(query(collection(db, 'expenses'), orderBy('date', 'desc'))),
      getDocs(query(collection(db, 'handovers'), orderBy('date', 'desc')))
    ]);
    const unpack = (snap) => snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    setData({ users: unpack(usersSnap), staff: unpack(staffSnap).sort(sortByStaffNumber), events: unpack(eventsSnap), contributions: unpack(contributionsSnap), expenses: unpack(expensesSnap), handovers: unpack(handoversSnap) });
  };

  useEffect(() => {
    if (!firebaseReady) {
      setChecking(false);
      return;
    }
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser ? await ensureUserProfile(firebaseUser) : null);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [user]);

  if (!firebaseReady) return <SetupScreen />;
  const publicEventId = new URLSearchParams(window.location.search).get('status');
  if (publicEventId) return <PublicStatusPage eventId={publicEventId} />;
  if (checking) return <main className="auth-page"><section className="auth-panel"><h1>Loading...</h1></section></main>;
  if (!user) return <AuthScreen onUser={setUser} />;
  if (user.status !== 'approved') return <PendingScreen user={user} onLogout={logout} onRefresh={refreshUser} />;

  const pages = {
    dashboard: <Dashboard user={user} {...data} reload={loadData} />,
    staff: <StaffPage user={user} staff={data.staff} reload={loadData} />,
    events: <EventsPage user={user} {...data} reload={loadData} />,
    expenses: <ExpensesPage user={user} events={data.events} expenses={data.expenses} contributions={data.contributions} handovers={data.handovers} reload={loadData} />,
    reports: <ReportsPage {...data} />
  };

  return (
    <div className="app-shell">
      <header className="mobile-top">
        <button className="icon-btn" onClick={() => setMenu(true)}><Menu /></button>
        <strong>KCC Guild Accounts</strong>
      </header>
      <aside className={menu ? 'sidebar open' : 'sidebar'}>
        <div className="side-brand"><ShieldCheck /><div><strong>KCC Guild</strong><span>Account Management</span></div><button className="icon-btn mobile-only" onClick={() => setMenu(false)}><X /></button></div>
        <nav>{TABS.map(([id, Icon, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setMenu(false); }}><Icon size={18} />{label}</button>)}</nav>
        <footer><div className="user-card"><strong>{user.displayName}</strong><span>{user.role}</span></div><button className="secondary-btn" onClick={logout}><LogOut size={16} />Sign Out</button></footer>
      </aside>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <main className="content">{pages[tab]}</main>
    </div>
  );
}
