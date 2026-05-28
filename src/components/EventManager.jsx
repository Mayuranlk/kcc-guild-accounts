import React, { useState } from 'react';
import { 
  Calendar, 
  Plus, 
  Trash2, 
  Search, 
  X, 
  Check, 
  CheckSquare, 
  Square, 
  Users, 
  DollarSign, 
  ArrowLeft,
  Info 
} from 'lucide-react';
import { 
  db, 
  setDoc, 
  doc, 
  deleteDoc,
  writeBatch
} from '../firebase';

export default function EventManager({ currentUser, staffList, eventsList, contributionsList, expensesList, onRefreshEvents }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Event Form State
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [exemptStaffIds, setExemptStaffIds] = useState([]);

  const isAuthorized = currentUser.role === 'admin' || currentUser.role === 'treasurer';

  // Toggle exemption check
  const handleToggleExempt = (staffId) => {
    if (exemptStaffIds.includes(staffId)) {
      setExemptStaffIds(exemptStaffIds.filter(id => id !== staffId));
    } else {
      setExemptStaffIds([...exemptStaffIds, staffId]);
    }
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (!isAuthorized) return;

    const eventId = 'event_' + Math.random().toString(36).substr(2, 9);
    const eventData = {
      id: eventId,
      name: name.trim(),
      date: date,
      targetAmount: Number(targetAmount),
      exemptStaffIds: exemptStaffIds,
      createdAt: new Date().toISOString()
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'events', eventId), eventData);

      staffList.forEach(staff => {
        const isExempt = exemptStaffIds.includes(staff.id);
        const contributionId = `${eventId}_${staff.id}`;
        batch.set(doc(db, 'contributions', contributionId), {
          id: contributionId,
          eventId: eventId,
          staffId: staff.id,
          staffName: staff.name,
          paid: false,
          amount: 0,
          isExempt: isExempt,
          updatedAt: new Date().toISOString()
        });
      });

      await batch.commit();

      resetForm();
      setShowAddModal(false);
      onRefreshEvents();
    } catch (err) {
      console.error("Error creating event:", err);
      alert("Failed to create event.");
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!isAuthorized) return;
    if (!window.confirm("Are you sure you want to delete this event? This will also wipe all contributions and expenses linked to this event!")) return;

    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'events', eventId));

      contributionsList
        .filter(c => c.eventId === eventId)
        .forEach(c => batch.delete(doc(db, 'contributions', c.id)));

      expensesList
        .filter(e => e.eventId === eventId)
        .forEach(e => batch.delete(doc(db, 'expenses', e.id)));

      await batch.commit();
      onRefreshEvents();
    } catch (err) {
      console.error("Error deleting event:", err);
      alert("Failed to delete event.");
    }
  };

  // Toggle Contribution payment status
  const handleTogglePayment = async (contribution) => {
    if (!isAuthorized) return;
    const newPaid = !contribution.paid;
    const targetEvent = eventsList.find(e => e.id === contribution.eventId);
    const newAmount = newPaid ? Number(targetEvent?.targetAmount || 0) : 0;

    const updatedContribution = {
      ...contribution,
      paid: newPaid,
      amount: newAmount,
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'contributions', contribution.id), updatedContribution);
      onRefreshEvents();
    } catch (err) {
      console.error("Error updating contribution:", err);
    }
  };

  // Update specific contribution amount manually
  const handleUpdateAmount = async (contribution, amountString) => {
    if (!isAuthorized) return;
    const amount = Number(amountString);
    
    const updatedContribution = {
      ...contribution,
      amount: amount,
      paid: amount > 0, // Auto-mark paid if amount > 0, else unpaid
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'contributions', contribution.id), updatedContribution);
      onRefreshEvents();
    } catch (err) {
      console.error("Error updating contribution amount:", err);
    }
  };

  const resetForm = () => {
    setName('');
    setDate('');
    setTargetAmount('');
    setExemptStaffIds([]);
  };

  const selectedEvent = eventsList.find(e => e.id === selectedEventId);
  const selectedContributions = contributionsList.filter(c => c.eventId === selectedEventId);

  // Financial calculations for active event details
  const activeExemptIds = selectedEvent?.exemptStaffIds || [];
  const activeTargetStaffCount = Math.max(1, staffList.length - activeExemptIds.length);
  const activeTargetTotal = (selectedEvent?.targetAmount || 0) * activeTargetStaffCount;
  
  const activeCollected = selectedContributions
    .filter(c => c.paid)
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  
  const activeOutstanding = activeTargetTotal - activeCollected;
  const activePaidCount = selectedContributions.filter(c => c.paid && !c.isExempt).length;
  const activeUnpaidCount = activeTargetStaffCount - activePaidCount;

  // Filter staff contributions in details view
  const filteredContributions = selectedContributions.filter(c => {
    const staff = staffList.find(s => s.id === c.staffId);
    if (!staff) return false;
    return staff.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           staff.employeeId.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div>
      {selectedEventId ? (
        /* ==========================================
           VIEW 2: EVENT CONTRIBUTION DETAILS
           ========================================== */
        <div>
          <div className="content-header">
            <div>
              <button onClick={() => setSelectedEventId(null)} className="btn btn-secondary" style={{ marginBottom: '16px' }}>
                <ArrowLeft size={16} />
                Back to Events
              </button>
              <h1 className="page-title">{selectedEvent?.name}</h1>
              <p className="page-subtitle">Event Date: {selectedEvent?.date} | Target Contribution: Rs. {selectedEvent?.targetAmount.toLocaleString()} per staff</p>
            </div>
          </div>

          {/* Event Metrics */}
          <div className="stats-grid">
            <div className="stat-card success">
              <div className="stat-header">
                <span>Collected</span>
                <div className="stat-icon" style={{ color: 'var(--success)', backgroundColor: 'var(--success-bg)' }}>
                  <Check size={20} />
                </div>
              </div>
              <div className="stat-value">Rs. {activeCollected.toLocaleString()}</div>
              <div className="stat-footer">
                <span>Target: Rs. {activeTargetTotal.toLocaleString()}</span>
              </div>
            </div>

            <div className="stat-card warn">
              <div className="stat-header">
                <span>Outstanding</span>
                <div className="stat-icon" style={{ color: 'var(--warn)', backgroundColor: 'var(--warn-bg)' }}>
                  <DollarSign size={20} />
                </div>
              </div>
              <div className="stat-value">Rs. {activeOutstanding.toLocaleString()}</div>
              <div className="stat-footer">
                <span>Total amount remaining</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span>Paid Staff</span>
                <div className="stat-icon" style={{ color: 'var(--primary)', backgroundColor: 'var(--primary-glow)' }}>
                  <CheckSquare size={20} />
                </div>
              </div>
              <div className="stat-value">{activePaidCount} / {activeTargetStaffCount}</div>
              <div className="stat-footer">
                <span>Excluding {activeExemptIds.length} exempted organizers</span>
              </div>
            </div>

            <div className="stat-card danger">
              <div className="stat-header">
                <span>Unpaid Staff</span>
                <div className="stat-icon" style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-bg)' }}>
                  <Users size={20} />
                </div>
              </div>
              <div className="stat-value">{activeUnpaidCount}</div>
              <div className="stat-footer">
                <span>Staff with pending payments</span>
              </div>
            </div>
          </div>

          {/* Exempt Organizers Alert */}
          {activeExemptIds.length > 0 && (
            <div className="alert-banner" style={{ backgroundColor: 'var(--primary-glow)', borderColor: 'var(--primary-border)', color: 'var(--text-primary)' }}>
              <Info size={16} className="text-primary" />
              <span>
                <strong>Organizers (Exempted): </strong> 
                {activeExemptIds.map(id => staffList.find(s => s.id === id)?.name).join(', ')}
              </span>
            </div>
          )}

          {/* Table */}
          <div className="card-table-wrapper">
            <div className="table-header-bar">
              <h2 className="table-title">Staff Contributions</h2>
              <div className="table-search-box">
                <div className="search-icon-wrapper">
                  <Search size={18} />
                </div>
                <input
                  type="text"
                  placeholder="Search staff..."
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
                    <th>Staff Name</th>
                    <th>Employee ID</th>
                    <th>Status</th>
                    <th>Amount Collected</th>
                    {isAuthorized && <th style={{ width: '120px', textAlign: 'center' }}>Mark Paid</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredContributions.map(contrib => {
                    const staff = staffList.find(s => s.id === contrib.staffId);
                    if (!staff) return null;
                    return (
                      <tr key={contrib.id} style={{ opacity: contrib.isExempt ? 0.6 : 1 }}>
                        <td style={{ fontWeight: '500' }}>{staff.name}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{staff.employeeId}</td>
                        <td>
                          {contrib.isExempt ? (
                            <span className="badge badge-warn">Exempt (Organizer)</span>
                          ) : contrib.paid ? (
                            <span className="badge badge-success">Paid</span>
                          ) : (
                            <span className="badge badge-danger">Unpaid</span>
                          )}
                        </td>
                        <td>
                          {contrib.isExempt ? (
                            <span>Rs. 0</span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>Rs. </span>
                              <input
                                type="number"
                                disabled={!isAuthorized}
                                className="form-control"
                                style={{ width: '100px', padding: '6px 10px', height: '32px' }}
                                value={contrib.amount}
                                onChange={(e) => handleUpdateAmount(contrib, e.target.value)}
                              />
                            </div>
                          )}
                        </td>
                        {isAuthorized && (
                          <td style={{ textAlign: 'center' }}>
                            <button
                              disabled={contrib.isExempt}
                              onClick={() => handleTogglePayment(contrib)}
                              className="btn btn-secondary btn-icon"
                              style={{ 
                                color: contrib.paid ? 'var(--success)' : 'var(--text-muted)',
                                borderColor: contrib.paid ? 'var(--success-border)' : 'var(--border-color)'
                              }}
                            >
                              {contrib.paid ? <CheckSquare size={16} /> : <Square size={16} />}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ==========================================
           VIEW 1: EVENTS SUMMARY BOARD
           ========================================== */
        <div>
          <div className="content-header">
            <div>
              <h1 className="page-title">Events & Contributions</h1>
              <p className="page-subtitle">Track guild events, set collections, and view individual payment records</p>
            </div>
            {isAuthorized && (
              <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                <Plus size={16} />
                Create New Event
              </button>
            )}
          </div>

          {eventsList.length === 0 ? (
            <div className="widget-card" style={{ padding: '60px', textAlign: 'center' }}>
              <Calendar size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
              <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>No events recorded yet</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Create an event to start collecting contributions from staff.</p>
              {isAuthorized && (
                <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                  Create First Event
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
              {eventsList.map(event => {
                // Fetch progress calculations
                const eventContribs = contributionsList.filter(c => c.eventId === event.id && c.paid);
                const collected = eventContribs.reduce((sum, c) => sum + Number(c.amount || 0), 0);
                const exemptCount = event.exemptStaffIds?.length || 0;
                const targetStaffCount = Math.max(1, staffList.length - exemptCount);
                const totalTarget = event.targetAmount * targetStaffCount;
                const progressPercentage = Math.min(100, Math.round((collected / (totalTarget || 1)) * 100));

                return (
                  <div key={event.id} className="stat-card" style={{ padding: '24px', minHeight: '260px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-primary)' }}>{event.name}</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>Event Date: {event.date}</p>
                      </div>
                      {isAuthorized && (
                        <button 
                          onClick={() => handleDeleteEvent(event.id)} 
                          className="btn btn-danger btn-icon" 
                          style={{ width: '32px', height: '32px', padding: 0 }}
                          title="Delete Event"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, marginBottom: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Target Per Person:</span>
                        <span style={{ fontWeight: '600' }}>Rs. {Number(event.targetAmount).toLocaleString()}</span>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Total Collected:</span>
                        <span style={{ fontWeight: '600', color: 'var(--success)' }}>Rs. {collected.toLocaleString()}</span>
                      </div>

                      <div className="progress-bar-wrapper">
                        <div className="progress-bar-outer">
                          <div className="progress-bar-inner" style={{ width: `${progressPercentage}%` }}></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span>Progress: {progressPercentage}%</span>
                          <span>Target: Rs. {totalTarget.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={14} />
                        {exemptCount} Organizer{exemptCount !== 1 ? 's' : ''} Exempted
                      </span>
                      <button 
                        onClick={() => setSelectedEventId(event.id)} 
                        className="btn btn-primary"
                        style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                      >
                        Manage Payments
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-card wide">
            <div className="modal-header">
              <h3>Create New Guild Event</h3>
              <button className="modal-close" onClick={() => { resetForm(); setShowAddModal(false); }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveEvent}>
              <div className="modal-body modal-body-grid">
                {/* Left side details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Event Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Teacher's Day Celebration"
                      className="form-control"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date of Event *</label>
                    <input
                      type="date"
                      required
                      className="form-control"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Target Contribution per Staff (Rs.) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      placeholder="e.g. 1000"
                      className="form-control"
                      value={targetAmount}
                      onChange={(e) => setTargetAmount(e.target.value)}
                    />
                  </div>
                </div>

                {/* Right side exemptions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label className="form-label">Select Event Organizers (Exempted) *</label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Select staff members organizing this event. They will be marked as Exempt and won't have to contribute.
                  </p>
                  
                  <div className="exempt-select-container">
                    {staffList.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '12px' }}>
                        No staff members found in directory. Add staff first.
                      </p>
                    ) : (
                      staffList.map(staff => {
                        const isExempt = exemptStaffIds.includes(staff.id);
                        return (
                          <div 
                            key={staff.id} 
                            className="exempt-item" 
                            onClick={() => handleToggleExempt(staff.id)}
                            style={{ backgroundColor: isExempt ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                          >
                            <input 
                              type="checkbox" 
                              checked={isExempt}
                              onChange={() => {}} // handled by div click
                            />
                            <div className="exempt-label">
                              <span className="exempt-name">{staff.name}</span>
                              <span className="exempt-sub">{staff.employeeId} | {staff.section}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { resetForm(); setShowAddModal(false); }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={staffList.length === 0}>
                  Create Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
