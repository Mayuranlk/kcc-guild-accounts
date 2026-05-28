import React from 'react';
import { LogOut, RefreshCw, Clock } from 'lucide-react';
import { doc, getDoc, db } from '../firebase';

export default function PendingApproval({ user, onLogout, onStatusRefresh }) {
  
  const handleRefresh = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const updatedUser = userDoc.data();
        onStatusRefresh(updatedUser);
      }
    } catch (err) {
      console.error("Error refreshing status:", err);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={{ textAlign: 'center', alignItems: 'center', gap: '20px' }}>
        <div className="pending-icon">
          <Clock size={32} />
        </div>
        
        <h1 className="auth-title" style={{ fontSize: '1.4rem', marginBottom: 0 }}>Approval Pending</h1>
        
        <p className="auth-subtitle" style={{ fontSize: '0.95rem', lineHeight: '1.5' }}>
          Hello <strong>{user.displayName}</strong>, your account is registered under <em>{user.email}</em>. 
          An Admin must approve your account and assign your role before you can access the system.
        </p>

        <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '12px' }}>
          <button 
            onClick={handleRefresh}
            className="btn btn-secondary" 
            style={{ flex: 1 }}
          >
            <RefreshCw size={16} />
            Check Status
          </button>
          
          <button 
            onClick={onLogout}
            className="btn btn-danger" 
            style={{ flex: 1 }}
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
