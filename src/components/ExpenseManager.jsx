import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  X, 
  DollarSign, 
  Image as ImageIcon, 
  TrendingDown, 
  TrendingUp, 
  Minus,
  Maximize2 
} from 'lucide-react';
import { 
  db, 
  storage, 
  setDoc, 
  doc, 
  deleteDoc, 
  ref, 
  uploadString, 
  getDownloadURL 
} from '../firebase';

export default function ExpenseManager({ currentUser, eventsList, expensesList, contributionsList, onRefreshExpenses }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterEventId, setFilterEventId] = useState('');
  const [selectedBillUrl, setSelectedBillUrl] = useState(null);

  // Expense Form State
  const [eventId, setEventId] = useState('');
  const [category, setCategory] = useState('Food & Refreshments');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [billImage, setBillImage] = useState(null);
  const [billFileName, setBillFileName] = useState('');
  const [uploading, setUploading] = useState(false);

  const categories = [
    'Food & Refreshments',
    'Stationery & Printing',
    'Decoration & Hall Hire',
    'Transport & Logistics',
    'Prizes & Certificates',
    'Miscellaneous'
  ];

  const isAuthorized = currentUser.role === 'admin' || currentUser.role === 'treasurer';

  // Handle image conversion to Base64 for Firestore or preview
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Image is too large. Please select or crop a photo smaller than 5MB.");
      return;
    }

    setBillFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setBillImage(reader.result); // Base64 dataURL
    };
    reader.readAsDataURL(file);
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!isAuthorized) return;
    setUploading(true);

    const expenseId = 'expense_' + Math.random().toString(36).substr(2, 9);
    let finalImageUrl = '';

    try {
      if (billImage) {
        const storageRef = ref(storage, `bills/${eventId}/${expenseId}_${billFileName}`);
        const snapshot = await uploadString(storageRef, billImage, 'data_url');
        finalImageUrl = await getDownloadURL(snapshot.ref);
      }

      const expenseData = {
        id: expenseId,
        eventId: eventId,
        eventName: eventsList.find(e => e.id === eventId)?.name || '',
        category: category,
        amount: Number(amount),
        date: date,
        description: description.trim(),
        imageUrl: finalImageUrl,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'expenses', expenseId), expenseData);

      resetForm();
      setShowAddModal(false);
      onRefreshExpenses();
    } catch (err) {
      console.error("Error saving expense:", err);
      alert("Failed to save expense details.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteExpense = async (expense) => {
    if (!isAuthorized) return;
    if (!window.confirm("Are you sure you want to delete this expense record?")) return;

    try {
      await deleteDoc(doc(db, 'expenses', expense.id));
      onRefreshExpenses();
    } catch (err) {
      console.error("Error deleting expense:", err);
      alert("Failed to delete expense.");
    }
  };

  const resetForm = () => {
    setEventId('');
    setCategory('Food & Refreshments');
    setAmount('');
    setDate('');
    setDescription('');
    setBillImage(null);
    setBillFileName('');
  };

  // Filter expenses
  const filteredExpenses = filterEventId 
    ? expensesList.filter(e => e.eventId === filterEventId)
    : expensesList;

  // Selected Event Financial Health Check
  const getEventBudgetSummary = () => {
    if (!filterEventId) return null;

    const eventObj = eventsList.find(e => e.id === filterEventId);
    if (!eventObj) return null;

    const eventContribs = contributionsList.filter(c => c.eventId === filterEventId && c.paid);
    const collected = eventContribs.reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const spent = expensesList
      .filter(e => e.eventId === filterEventId)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    
    const balance = collected - spent;

    return {
      name: eventObj.name,
      collected,
      spent,
      balance,
      isShort: balance < 0,
      isLeft: balance > 0
    };
  };

  const budgetSummary = getEventBudgetSummary();

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="page-title">Expenses Log</h1>
          <p className="page-subtitle">Record and manage expenditures for each guild event with receipt proof</p>
        </div>
        {isAuthorized && (
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary" disabled={eventsList.length === 0}>
            <Plus size={16} />
            Add Expense Record
          </button>
        )}
      </div>

      {/* Select Event Filter */}
      <div className="expense-filter-bar">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Analyze Event Budget</label>
          <select 
            value={filterEventId} 
            onChange={(e) => setFilterEventId(e.target.value)}
            className="form-control"
          >
            <option value="">-- View All Expenses --</option>
            {eventsList.map(event => (
              <option key={event.id} value={event.id}>{event.name} ({event.date})</option>
            ))}
          </select>
        </div>
        {filterEventId && (
          <button onClick={() => setFilterEventId('')} className="btn btn-secondary" style={{ height: '44px' }}>
            Clear Filter
          </button>
        )}
      </div>

      {/* Selected Event Financial Health Check */}
      {budgetSummary && (
        <div className="stats-grid" style={{ marginBottom: '24px' }}>
          <div className="stat-card success">
            <div className="stat-header">
              <span>Funds Collected</span>
              <div className="stat-icon" style={{ color: 'var(--success)', backgroundColor: 'var(--success-bg)' }}>
                <TrendingUp size={20} />
              </div>
            </div>
            <div className="stat-value">Rs. {budgetSummary.collected.toLocaleString()}</div>
            <div className="stat-footer">
              <span>Total collected from staff</span>
            </div>
          </div>

          <div className="stat-card danger">
            <div className="stat-header">
              <span>Funds Spent</span>
              <div className="stat-icon" style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-bg)' }}>
                <TrendingDown size={20} />
              </div>
            </div>
            <div className="stat-value">Rs. {budgetSummary.spent.toLocaleString()}</div>
            <div className="stat-footer">
              <span>Total spent on this event</span>
            </div>
          </div>

          <div className="stat-card" style={{ borderColor: budgetSummary.balance >= 0 ? 'var(--success-border)' : 'var(--danger-border)' }}>
            <div className="stat-header">
              <span>Net Status</span>
              <div className="stat-icon" style={{ 
                color: budgetSummary.balance >= 0 ? 'var(--success)' : 'var(--danger)', 
                backgroundColor: budgetSummary.balance >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)' 
              }}>
                {budgetSummary.balance >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              </div>
            </div>
            <div className="stat-value" style={{ color: budgetSummary.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              Rs. {Math.abs(budgetSummary.balance).toLocaleString()}
            </div>
            <div className="stat-footer">
              <strong>
                {budgetSummary.balance > 0 ? (
                  <span style={{ color: 'var(--success)' }}>Surplus (Remaining Left)</span>
                ) : budgetSummary.balance < 0 ? (
                  <span style={{ color: 'var(--danger)' }}>Deficit (Short of Funds)</span>
                ) : (
                  <span>Balanced budget</span>
                )}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Expenses Table */}
      <div className="card-table-wrapper">
        <div className="table-header-bar">
          <h2 className="table-title">Logged Expenses ({filteredExpenses.length})</h2>
        </div>

        <div className="custom-table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Category</th>
                <th>Description</th>
                <th>Date</th>
                <th>Bill Photo</th>
                <th>Amount Spent</th>
                {isAuthorized && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={isAuthorized ? 7 : 6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    No expenses recorded under current filter.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map(expense => (
                  <tr key={expense.id}>
                    <td style={{ fontWeight: '600' }}>{expense.eventName}</td>
                    <td>
                      <span className="badge badge-warn" style={{ fontSize: '0.7rem' }}>
                        {expense.category}
                      </span>
                    </td>
                    <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={expense.description}>
                      {expense.description}
                    </td>
                    <td>{expense.date}</td>
                    <td>
                      {expense.imageUrl ? (
                        <div style={{ position: 'relative', width: '48px', height: '48px' }}>
                          <img 
                            src={expense.imageUrl} 
                            alt="Bill thumbnail" 
                            className="bill-thumbnail"
                            onClick={() => setSelectedBillUrl(expense.imageUrl)}
                          />
                          <Maximize2 
                            size={10} 
                            style={{ position: 'absolute', right: '4px', bottom: '4px', pointerEvents: 'none', color: 'white', backgroundColor: 'black', borderRadius: '2px' }} 
                          />
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Minus size={14} /> None
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: '700', color: 'var(--danger)' }}>Rs. {expense.amount.toLocaleString()}</td>
                    {isAuthorized && (
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          onClick={() => handleDeleteExpense(expense)} 
                          className="btn btn-danger btn-icon"
                          title="Delete record"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bill Photo Preview Modal */}
      {selectedBillUrl && (
        <div className="modal-overlay" onClick={() => setSelectedBillUrl(null)}>
          <div className="modal-card" style={{ maxWidth: '650px', backgroundColor: 'transparent', border: 'none', boxShadow: 'none' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
              <button 
                onClick={() => setSelectedBillUrl(null)} 
                className="btn btn-secondary" 
                style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0 }}
              >
                <X size={20} />
              </button>
            </div>
            <img 
              src={selectedBillUrl} 
              alt="Full receipt bill photo" 
              style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 'var(--radius-lg)', border: '2px solid var(--border-color)', backgroundColor: '#0f172a' }} 
            />
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Log Event Expense</h3>
              <button className="modal-close" onClick={() => { resetForm(); setShowAddModal(false); }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveExpense}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Link to Guild Event *</label>
                  <select
                    required
                    className="form-control"
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                  >
                    <option value="">-- Select Event --</option>
                    {eventsList.map(event => (
                      <option key={event.id} value={event.id}>{event.name} ({event.date})</option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Expense Category *</label>
                    <select
                      required
                      className="form-control"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Amount Spent (Rs.) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 2500"
                      className="form-control"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Date of Expenditure *</label>
                    <input
                      type="date"
                      required
                      className="form-control"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Bill Photo Receipt</label>
                    <input
                      type="file"
                      accept="image/*"
                      className="form-control"
                      onChange={handleImageChange}
                      style={{ padding: '6px 12px' }}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Description / Remarks *</label>
                  <textarea
                    required
                    rows="3"
                    placeholder="Provide details about the purchase (e.g. Bought lunch packets for guests from Kilinochchi Hotel)..."
                    className="form-control"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{ resize: 'vertical' }}
                  ></textarea>
                </div>

                {billImage && (
                  <div>
                    <span className="form-label">Receipt Image Preview:</span>
                    <img src={billImage} alt="Receipt preview" className="bill-image-preview" />
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { resetForm(); setShowAddModal(false); }} disabled={uploading}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={uploading || !eventId}>
                  {uploading ? "Uploading & Saving..." : "Save Expense Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
