import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { 
  UserPlus, 
  Upload, 
  Download, 
  Trash2, 
  Edit3, 
  Search, 
  X, 
  Check, 
  FileText, 
  AlertCircle 
} from 'lucide-react';
import { 
  db, 
  collection, 
  setDoc, 
  doc, 
  deleteDoc, 
  writeBatch 
} from '../firebase';

export default function StaffManager({ currentUser, staffList, onRefreshStaff }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Single Staff Form State
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [section, setSection] = useState('');
  const [editingId, setEditingId] = useState(null);

  // Bulk Upload State
  const [csvFile, setCsvFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadPreview, setUploadPreview] = useState([]);
  const [uploadSuccessCount, setUploadSuccessCount] = useState(0);

  const isAuthorized = currentUser.role === 'admin' || currentUser.role === 'treasurer';

  // Handle Add/Edit Staff Submission
  const handleSaveStaff = async (e) => {
    e.preventDefault();
    if (!isAuthorized) {
      alert("Unauthorized to manage staff details.");
      return;
    }

    const staffData = {
      id: editingId || employeeId.trim(),
      employeeId: employeeId.trim(),
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      section: section.trim(),
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'staff', staffData.id), staffData);

      resetForm();
      setShowAddModal(false);
      onRefreshStaff();
    } catch (err) {
      console.error("Error saving staff:", err);
      alert("Failed to save staff details.");
    }
  };

  const handleEdit = (staff) => {
    setEditingId(staff.id);
    setEmployeeId(staff.employeeId);
    setName(staff.name);
    setEmail(staff.email);
    setPhone(staff.phone);
    setSection(staff.section);
    setShowAddModal(true);
  };

  const handleDelete = async (staffId) => {
    if (!isAuthorized) return;
    if (!window.confirm("Are you sure you want to remove this staff member? All their historical contribution mappings will remain but they won't be prompt for future events.")) return;

    try {
      await deleteDoc(doc(db, 'staff', staffId));
      onRefreshStaff();
    } catch (err) {
      console.error("Error deleting staff:", err);
      alert("Failed to delete staff member.");
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setEmployeeId('');
    setName('');
    setEmail('');
    setPhone('');
    setSection('');
  };

  // CSV Regex parser (handles quotes and commas)
  const parseCSVLine = (line) => {
    const arr = [];
    let quote = false;
    let val = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        quote = !quote;
      } else if (char === ',' && !quote) {
        arr.push(val.trim().replace(/^"|"$/g, ''));
        val = '';
      } else {
        val += char;
      }
    }
    arr.push(val.trim().replace(/^"|"$/g, ''));
    return arr;
  };

  const normalizeHeader = (value) => String(value || '').trim().toLowerCase();

  const mapStaffRows = (rows) => {
    if (rows.length <= 1) {
      throw new Error("File is empty or only contains headers.");
    }

    const headers = rows[0].map(normalizeHeader);
    const required = ['employee id', 'name', 'email', 'phone', 'section'];
    const headerIndexes = {};

    required.forEach(req => {
      const idx = headers.findIndex(h => h.includes(req));
      if (idx !== -1) headerIndexes[req] = idx;
    });

    if (Object.keys(headerIndexes).length < 5) {
      throw new Error("Invalid headers. Use columns for: Employee ID, Name, Email, Phone, Section");
    }

    return rows.slice(1)
      .map(cols => {
        const empId = String(cols[headerIndexes['employee id']] || '').trim();
        if (!empId) return null;
        return {
          id: empId,
          employeeId: empId,
          name: String(cols[headerIndexes['name']] || '').trim(),
          email: String(cols[headerIndexes['email']] || '').trim(),
          phone: String(cols[headerIndexes['phone']] || '').trim(),
          section: String(cols[headerIndexes['section']] || '').trim(),
          updatedAt: new Date().toISOString()
        };
      })
      .filter(Boolean);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);
    setUploadError('');
    setUploadPreview([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const isExcel = /\.(xlsx|xls)$/i.test(file.name);
        let rows;
        if (isExcel) {
          const workbook = XLSX.read(evt.target.result, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
        } else {
          const text = evt.target.result;
          rows = text.split(/\r?\n/).filter(line => line.trim() !== '').map(parseCSVLine);
        }

        setUploadPreview(mapStaffRows(rows).slice(0, 5));
      } catch (err) {
        setUploadError(err.message);
      }
    };

    if (/\.(xlsx|xls)$/i.test(file.name)) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleBulkUpload = async () => {
    if (!csvFile || !isAuthorized) return;

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        let rows;
        if (/\.(xlsx|xls)$/i.test(csvFile.name)) {
          const workbook = XLSX.read(evt.target.result, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
        } else {
          const text = evt.target.result;
          rows = text.split(/\r?\n/).filter(line => line.trim() !== '').map(parseCSVLine);
        }

        const parsedStaff = mapStaffRows(rows);
        const batch = writeBatch(db);
        parsedStaff.forEach(staff => {
          const ref = doc(db, 'staff', staff.id);
          batch.set(ref, staff);
        });
        await batch.commit();

        setUploadSuccessCount(parsedStaff.length);
        setTimeout(() => {
          setShowBulkModal(false);
          setCsvFile(null);
          setUploadPreview([]);
          setUploadSuccessCount(0);
          onRefreshStaff();
        }, 1500);
      };
      if (/\.(xlsx|xls)$/i.test(csvFile.name)) {
        reader.readAsArrayBuffer(csvFile);
      } else {
        reader.readAsText(csvFile);
      }
    } catch (err) {
      console.error(err);
      setUploadError("Bulk upload failed during batch insertion.");
    }
  };

  const downloadCSVTemplate = () => {
    const rows = [
      ['Employee ID', 'Name', 'Email', 'Phone', 'Section'],
      ['EMP101', 'Mr. A. Perera', 'perera@kcc.edu', '0771234567', 'Science Department'],
      ['EMP102', 'Mrs. S. Raghu', 'raghu@kcc.edu', '0777654321', 'Language Section']
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Staff Template');
    XLSX.writeFile(workbook, 'kcc_staff_template.xlsx');
  };

  const exportStaffDetails = () => {
    if (staffList.length === 0) {
      alert("No staff details to export.");
      return;
    }
    const rows = staffList.map(s => ({
      'Employee ID': s.employeeId,
      Name: s.name,
      Email: s.email,
      Phone: s.phone,
      Section: s.section
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Staff Details');
    XLSX.writeFile(workbook, 'kcc_guild_staff_details.xlsx');
  };

  const filteredStaff = staffList.filter(staff => 
    staff.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    staff.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    staff.section.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="page-title">Staff Details</h1>
          <p className="page-subtitle">Manage Guild staff registry for monthly and event contributions</p>
        </div>
        {isAuthorized && (
          <div className="btn-group">
            <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
              <UserPlus size={16} />
              Add Staff Member
            </button>
            <button onClick={() => setShowBulkModal(true)} className="btn btn-secondary">
              <Upload size={16} />
              Bulk Upload
            </button>
            <button onClick={exportStaffDetails} className="btn btn-secondary">
              <Download size={16} />
              Export Details
            </button>
          </div>
        )}
      </div>

      {/* Staff Data Table */}
      <div className="card-table-wrapper">
        <div className="table-header-bar">
          <h2 className="table-title">Registered Staff ({filteredStaff.length})</h2>
          <div className="table-search-box">
            <div className="search-icon-wrapper">
              <Search size={18} />
            </div>
            <input
              type="text"
              placeholder="Search by ID, name or department..."
              className="form-control table-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="custom-table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Section</th>
                {isAuthorized && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={isAuthorized ? 6 : 5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    No staff records found matching your query.
                  </td>
                </tr>
              ) : (
                filteredStaff.map(staff => (
                  <tr key={staff.id}>
                    <td style={{ fontWeight: '600', color: 'var(--primary)' }}>{staff.employeeId}</td>
                    <td style={{ fontWeight: '500' }}>{staff.name}</td>
                    <td>{staff.email || '-'}</td>
                    <td>{staff.phone || '-'}</td>
                    <td>
                      <span className="badge badge-warn" style={{ fontSize: '0.7rem' }}>
                        {staff.section}
                      </span>
                    </td>
                    {isAuthorized && (
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button 
                            onClick={() => handleEdit(staff)} 
                            className="btn btn-secondary btn-icon"
                            title="Edit details"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button 
                            onClick={() => handleDelete(staff.id)} 
                            className="btn btn-danger btn-icon"
                            title="Remove member"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Staff Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{editingId ? 'Edit Staff Member' : 'Add Staff Member'}</h3>
              <button className="modal-close" onClick={() => { resetForm(); setShowAddModal(false); }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveStaff}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Employee ID *</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingId}
                    placeholder="e.g. EMP101"
                    className="form-control"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mr. A. Perera"
                    className="form-control"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. perera@kcc.edu"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 0771234567"
                      className="form-control"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Section / Department *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Science Dept"
                      className="form-control"
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { resetForm(); setShowAddModal(false); }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulkModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Bulk Upload Staff Details</h3>
              <button className="modal-close" onClick={() => { setCsvFile(null); setUploadPreview([]); setUploadError(''); setShowBulkModal(false); }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {uploadSuccessCount > 0 ? (
                <div style={{ textAlign: 'center', padding: '24px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'var(--success-bg)', color: 'var(--success)', marginBottom: '16px' }}>
                    <Check size={24} />
                  </div>
                  <h4 style={{ color: 'var(--success)', fontWeight: '700' }}>Import Completed!</h4>
                  <p style={{ marginTop: '8px' }}>Successfully imported {uploadSuccessCount} staff records.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    Upload an Excel or CSV file containing your staff directory. Columns should include headers for <strong>Employee ID, Name, Email, Phone, Section</strong>.
                  </p>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>Need a starting point?</span>
                    <button onClick={downloadCSVTemplate} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                      <FileText size={14} />
                      Download Template
                    </button>
                  </div>

                  <div className="upload-area" onClick={() => document.getElementById('csv-file-picker').click()}>
                    <Upload className="upload-icon" />
                    <p className="upload-text">Click to choose file or drag CSV here</p>
                    <p className="upload-subtext">Max size: 5MB (.csv format)</p>
                    <input 
                      id="csv-file-picker"
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      style={{ display: 'none' }}
                      onChange={handleFileChange}
                    />
                  </div>

                  {csvFile && (
                    <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                      <strong>Selected File:</strong> {csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}

                  {uploadError && (
                    <div className="alert-banner" style={{ backgroundColor: 'var(--danger-bg)', borderColor: 'var(--danger-border)', color: 'var(--danger)' }}>
                      <AlertCircle size={16} />
                      <span>{uploadError}</span>
                    </div>
                  )}

                  {uploadPreview.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '8px' }}>Previewing First Few Rows:</h4>
                      <div className="custom-table-container" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', maxHeight: '180px' }}>
                        <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                          <thead>
                            <tr>
                              <th>ID</th>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Phone</th>
                              <th>Section</th>
                            </tr>
                          </thead>
                          <tbody>
                            {uploadPreview.map((row, idx) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: '600', color: 'var(--primary)' }}>{row.employeeId}</td>
                                <td>{row.name}</td>
                                <td>{row.email}</td>
                                <td>{row.phone}</td>
                                <td>{row.section}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => { setCsvFile(null); setUploadPreview([]); setUploadError(''); setShowBulkModal(false); }}
                disabled={uploadSuccessCount > 0}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleBulkUpload}
                disabled={!csvFile || !!uploadError || uploadSuccessCount > 0}
              >
                Upload Staff Registry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
