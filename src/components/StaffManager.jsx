import React, { useState } from 'react';
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
  isFirebaseConfigured, 
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
      if (isFirebaseConfigured) {
        await setDoc(doc(db, 'staff', staffData.id), staffData);
      } else {
        const localStaff = JSON.parse(localStorage.getItem('guild_staff') || '[]');
        const index = localStaff.findIndex(s => s.id === staffData.id);
        if (index !== -1) {
          localStaff[index] = staffData;
        } else {
          localStaff.push(staffData);
        }
        localStorage.setItem('guild_staff', JSON.stringify(localStaff));
      }

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
      if (isFirebaseConfigured) {
        await deleteDoc(doc(db, 'staff', staffId));
      } else {
        const localStaff = JSON.parse(localStorage.getItem('guild_staff') || '[]');
        const updated = localStaff.filter(s => s.id !== staffId);
        localStorage.setItem('guild_staff', JSON.stringify(updated));
      }
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);
    setUploadError('');
    setUploadPreview([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
      if (lines.length <= 1) {
        setUploadError("CSV file is empty or only contains headers.");
        return;
      }

      const headers = parseCSVLine(lines[0]);
      // Verify headers
      const required = ['employee id', 'name', 'email', 'phone', 'section'];
      const headerIndexes = {};
      required.forEach(req => {
        const idx = headers.findIndex(h => h.toLowerCase().includes(req));
        if (idx !== -1) headerIndexes[req] = idx;
      });

      if (Object.keys(headerIndexes).length < 5) {
        setUploadError("Invalid headers. Make sure you have columns for: Employee ID, Name, Email, Phone, Section");
        return;
      }

      const previewRows = [];
      for (let i = 1; i < Math.min(lines.length, 6); i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length >= 5) {
          previewRows.push({
            employeeId: cols[headerIndexes['employee id']] || '',
            name: cols[headerIndexes['name']] || '',
            email: cols[headerIndexes['email']] || '',
            phone: cols[headerIndexes['phone']] || '',
            section: cols[headerIndexes['section']] || ''
          });
        }
      }
      setUploadPreview(previewRows);
    };
    reader.readAsText(file);
  };

  const handleBulkUpload = async () => {
    if (!csvFile || !isAuthorized) return;

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const text = evt.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        
        const headers = parseCSVLine(lines[0]);
        const required = ['employee id', 'name', 'email', 'phone', 'section'];
        const headerIndexes = {};
        required.forEach(req => {
          headerIndexes[req] = headers.findIndex(h => h.toLowerCase().includes(req));
        });

        const parsedStaff = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCSVLine(lines[i]);
          if (cols.length >= 5) {
            const empId = cols[headerIndexes['employee id']];
            if (empId) {
              parsedStaff.push({
                id: empId.trim(),
                employeeId: empId.trim(),
                name: (cols[headerIndexes['name']] || '').trim(),
                email: (cols[headerIndexes['email']] || '').trim(),
                phone: (cols[headerIndexes['phone']] || '').trim(),
                section: (cols[headerIndexes['section']] || '').trim(),
                updatedAt: new Date().toISOString()
              });
            }
          }
        }

        if (isFirebaseConfigured) {
          const batch = writeBatch(db);
          parsedStaff.forEach(staff => {
            const ref = doc(db, 'staff', staff.id);
            batch.set(ref, staff);
          });
          await batch.commit();
        } else {
          const localStaff = JSON.parse(localStorage.getItem('guild_staff') || '[]');
          parsedStaff.forEach(staff => {
            const index = localStaff.findIndex(s => s.id === staff.id);
            if (index !== -1) {
              localStaff[index] = staff;
            } else {
              localStaff.push(staff);
            }
          });
          localStorage.setItem('guild_staff', JSON.stringify(localStaff));
        }

        setUploadSuccessCount(parsedStaff.length);
        setTimeout(() => {
          setShowBulkModal(false);
          setCsvFile(null);
          setUploadPreview([]);
          setUploadSuccessCount(0);
          onRefreshStaff();
        }, 1500);
      };
      reader.readAsText(csvFile);
    } catch (err) {
      console.error(err);
      setUploadError("Bulk upload failed during batch insertion.");
    }
  };

  const downloadCSVTemplate = () => {
    const headers = 'Employee ID,Name,Email,Phone,Section\n';
    const sample = 'EMP101,Mr. A. Perera,perera@kcc.edu,0771234567,Science Department\nEMP102,Mrs. S. Raghu,raghu@kcc.edu,0777654321,Language Section\n';
    const blob = new Blob([headers + sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "kcc_staff_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportStaffDetails = () => {
    if (staffList.length === 0) {
      alert("No staff details to export.");
      return;
    }
    const headers = 'Employee ID,Name,Email,Phone,Section\n';
    const rows = staffList.map(s => `"${s.employeeId}","${s.name}","${s.email}","${s.phone}","${s.section}"`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "kcc_guild_staff_details.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
              Bulk Upload (CSV)
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
                    Upload a CSV file containing your staff directory. Columns should include headers for <strong>Employee ID, Name, Email, Phone, Section</strong>.
                  </p>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>Need a starting point?</span>
                    <button onClick={downloadCSVTemplate} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                      <FileText size={14} />
                      Download Template CSV
                    </button>
                  </div>

                  <div className="upload-area" onClick={() => document.getElementById('csv-file-picker').click()}>
                    <Upload className="upload-icon" />
                    <p className="upload-text">Click to choose file or drag CSV here</p>
                    <p className="upload-subtext">Max size: 5MB (.csv format)</p>
                    <input 
                      id="csv-file-picker"
                      type="file"
                      accept=".csv"
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
