import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Users, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  UserCheck, 
  UserX, 
  Shield, 
  Unlock 
} from 'lucide-react';
import { 
  db, 
  collection, 
  getDocs, 
  updateDoc, 
  doc 
} from '../firebase';

export default function Dashboard({ currentUser, staffList, eventsList, expensesList, contributionsList, onUpdateUsers }) {
  const [guildUsers, setGuildUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Load registered users (Only for Admin to grant access)
  const loadGuildUsers = async () => {
    if (currentUser.role !== 'admin') return;
    setLoadingUsers(true);
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const users = [];
      usersSnapshot.forEach(doc => {
        users.push(doc.data());
      });
      setGuildUsers(users);
    } catch (err) {
      console.error("Error loading registered users:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadGuildUsers();
  }, [currentUser, onUpdateUsers]);

  const handleUpdateUserStatus = async (uid, newStatus, newRole) => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        status: newStatus,
        role: newRole
      });
      loadGuildUsers();
      if (onUpdateUsers) onUpdateUsers();
    } catch (err) {
      console.error("Failed to update user:", err);
      alert("Failed to update user permissions.");
    }
  };

  // Calculations for financial metrics
  const totalCollected = contributionsList
    .filter(c => c.paid)
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);

  const totalSpent = expensesList
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const netBalance = totalCollected - totalSpent;

  // Recent events progress
  const getEventCollectionProgress = (eventId, targetAmount) => {
    const eventContributions = contributionsList.filter(c => c.eventId === eventId && c.paid);
    const collected = eventContributions.reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const paidCount = eventContributions.length;
    
    // Find number of active staff for this event
    const event = eventsList.find(e => e.id === eventId);
    const exemptIds = event?.exemptStaffIds || [];
    const targetStaffCount = Math.max(1, staffList.length - exemptIds.length);
    const totalTarget = targetAmount * targetStaffCount;
    
    const percentage = Math.min(100, Math.round((collected / (totalTarget || 1)) * 100));
    return { collected, totalTarget, percentage, paidCount, targetStaffCount };
  };

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {currentUser.displayName} ({currentUser.role})</p>
        </div>
      </div>

      {/* Financial Metrics Cards */}
      <div className="stats-grid">
        <div className="stat-card success">
          <div className="stat-header">
            <span>Total Collected</span>
            <div className="stat-icon" style={{ color: 'var(--success)', backgroundColor: 'var(--success-bg)' }}>
              <ArrowUpRight size={20} />
            </div>
          </div>
          <div className="stat-value">Rs. {totalCollected.toLocaleString()}</div>
          <div className="stat-footer">
            <span>Contributions collected from staff</span>
          </div>
        </div>

        <div className="stat-card danger">
          <div className="stat-header">
            <span>Total Expenses</span>
            <div className="stat-icon" style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-bg)' }}>
              <ArrowDownRight size={20} />
            </div>
          </div>
          <div className="stat-value">Rs. {totalSpent.toLocaleString()}</div>
          <div className="stat-footer">
            <span>Funds spent on events</span>
          </div>
        </div>

        <div className="stat-card" style={{ borderColor: netBalance >= 0 ? 'var(--success-border)' : 'var(--danger-border)' }}>
          <div className="stat-header">
            <span>Net Guild Balance</span>
            <div className="stat-icon" style={{ 
              color: netBalance >= 0 ? 'var(--success)' : 'var(--danger)', 
              backgroundColor: netBalance >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)' 
            }}>
              <DollarSign size={20} />
            </div>
          </div>
          <div className="stat-value" style={{ color: netBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            Rs. {netBalance.toLocaleString()}
          </div>
          <div className="stat-footer">
            <span>{netBalance >= 0 ? 'Surplus in Guild Account' : 'Deficit in Guild Account'}</span>
          </div>
        </div>

        <div className="stat-card warn">
          <div className="stat-header">
            <span>Guild Members</span>
            <div className="stat-icon" style={{ color: 'var(--warn)', backgroundColor: 'var(--warn-bg)' }}>
              <Users size={20} />
            </div>
          </div>
          <div className="stat-value">{staffList.length}</div>
          <div className="stat-footer">
            <span>Registered staff members</span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid-2">
        {/* Event Progress Lists */}
        <div className="widget-card">
          <h2 className="widget-title">
            <Calendar size={18} className="text-primary" />
            Active Events Collection Progress
          </h2>
          
          {eventsList.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No active events found. Create one in the Events tab.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {eventsList.slice(0, 5).map(event => {
                const progress = getEventCollectionProgress(event.id, Number(event.targetAmount || 0));
                return (
                  <div key={event.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '600' }}>{event.name}</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Rs. {progress.collected.toLocaleString()} / Rs. {progress.totalTarget.toLocaleString()}
                      </span>
                    </div>
                    <div className="progress-bar-outer">
                      <div className="progress-bar-inner" style={{ width: `${progress.percentage}%` }}></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>Progress: {progress.percentage}%</span>
                      <span>Paid: {progress.paidCount} / {progress.targetStaffCount} staff</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* User Approval (Only for Admin) */}
        {currentUser.role === 'admin' && (
          <div className="widget-card">
            <h2 className="widget-title">
              <Shield size={18} style={{ color: 'var(--warn)' }} />
              Admin Portal: User Access Permissions
            </h2>
            
            {loadingUsers ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>Loading registered accounts...</p>
            ) : guildUsers.filter(u => u.uid !== currentUser.uid).length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>No other users registered in the system.</p>
            ) : (
              <div className="activity-list" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                {guildUsers
                  .filter(u => u.uid !== currentUser.uid)
                  .map(user => (
                    <div key={user.uid} className="activity-item" style={{ alignItems: 'flex-start' }}>
                      <div className="user-avatar" style={{ width: '32px', height: '32px', fontSize: '0.85rem', flexShrink: 0 }}>
                        {user.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="activity-details">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="activity-title" style={{ fontSize: '0.9rem' }}>{user.displayName}</span>
                          <span className={`badge ${user.status === 'approved' ? 'badge-success' : 'badge-danger'}`} style={{ transform: 'scale(0.85)' }}>
                            {user.status}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.email}</p>
                        
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                          {user.status === 'pending' ? (
                            <>
                              <button 
                                onClick={() => handleUpdateUserStatus(user.uid, 'approved', 'treasurer')}
                                className="btn btn-secondary" 
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              >
                                <Unlock size={12} />
                                Grant Treasurer Access
                              </button>
                              <button 
                                onClick={() => handleUpdateUserStatus(user.uid, 'approved', 'regular')}
                                className="btn btn-secondary" 
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              >
                                Approve Member
                              </button>
                            </>
                          ) : (
                            <>
                              <select 
                                value={user.role} 
                                onChange={(e) => handleUpdateUserStatus(user.uid, 'approved', e.target.value)}
                                className="form-control"
                                style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'auto', display: 'inline-block', height: '28px' }}
                              >
                                <option value="regular">Regular Member</option>
                                <option value="treasurer">Treasurer</option>
                                <option value="admin">Administrator</option>
                              </select>
                              <button 
                                onClick={() => handleUpdateUserStatus(user.uid, 'pending', user.role)}
                                className="btn btn-danger"
                                style={{ padding: '4px 8px', fontSize: '0.75rem', height: '28px' }}
                              >
                                <UserX size={12} />
                                Revoke Access
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
