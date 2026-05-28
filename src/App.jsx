import React, { useState, useEffect } from 'react';
import { 
  isFirebaseConfigured, 
  auth, 
  db, 
  onAuthStateChanged,
  signOut,
  collection, 
  getDocs, 
  doc, 
  getDoc,
  query,
  orderBy
} from './firebase';
import Login from './components/Login';
import PendingApproval from './components/PendingApproval';
import Dashboard from './components/Dashboard';
import StaffManager from './components/StaffManager';
import EventManager from './components/EventManager';
import ExpenseManager from './components/ExpenseManager';
import Reports from './components/Reports';

import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Receipt, 
  FilePieChart, 
  LogOut,
  AlertTriangle 
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Application Data States
  const [staffList, setStaffList] = useState([]);
  const [eventsList, setEventsList] = useState([]);
  const [contributionsList, setContributionsList] = useState([]);
  const [expensesList, setExpensesList] = useState([]);

  // ----------------------------------------------------
  // AUTHENTICATION SYNC
  // ----------------------------------------------------
  useEffect(() => {
    let unsubscribe = () => {};
    
    if (isFirebaseConfigured) {
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          try {
            // Get user role/status details from Firestore
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              setCurrentUser(userDoc.data());
            } else {
              // User signed in but profile doc not created yet
              setCurrentUser({
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName || firebaseUser.email.split('@')[0],
                role: 'regular',
                status: 'pending'
              });
            }
          } catch (err) {
            console.error("Auth state profile fetch error:", err);
          }
        } else {
          setCurrentUser(null);
        }
        setAuthChecking(false);
      });
    } else {
      // Local simulation auth check
      const current = localStorage.getItem('current_guild_user');
      if (current) {
        setCurrentUser(JSON.parse(current));
      }
      setAuthChecking(false);
    }

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    if (isFirebaseConfigured) {
      await signOut(auth);
    } else {
      localStorage.removeItem('current_guild_user');
    }
    setCurrentUser(null);
    setActiveTab('dashboard');
  };

  // ----------------------------------------------------
  // DATABASE SYNCHRONIZATION
  // ----------------------------------------------------
  const fetchData = async () => {
    if (!currentUser || currentUser.status !== 'approved') return;

    try {
      if (isFirebaseConfigured) {
        // 1. Fetch Staff Registry
        const staffSnapshot = await getDocs(query(collection(db, 'staff'), orderBy('name')));
        const staff = [];
        staffSnapshot.forEach(doc => staff.push({ id: doc.id, ...doc.data() }));
        setStaffList(staff);

        // 2. Fetch Events
        const eventsSnapshot = await getDocs(query(collection(db, 'events'), orderBy('date', 'desc')));
        const events = [];
        eventsSnapshot.forEach(doc => events.push({ id: doc.id, ...doc.data() }));
        setEventsList(events);

        // 3. Fetch Contributions
        const contributionsSnapshot = await getDocs(collection(db, 'contributions'));
        const contributions = [];
        contributionsSnapshot.forEach(doc => contributions.push({ id: doc.id, ...doc.data() }));
        setContributionsList(contributions);

        // 4. Fetch Expenses
        const expensesSnapshot = await getDocs(query(collection(db, 'expenses'), orderBy('date', 'desc')));
        const expenses = [];
        expensesSnapshot.forEach(doc => expenses.push({ id: doc.id, ...doc.data() }));
        setExpensesList(expenses);

      } else {
        // Local simulation fetch
        const staff = JSON.parse(localStorage.getItem('guild_staff') || '[]');
        const events = JSON.parse(localStorage.getItem('guild_events') || '[]');
        const contributions = JSON.parse(localStorage.getItem('guild_contributions') || '[]');
        const expenses = JSON.parse(localStorage.getItem('guild_expenses') || '[]');

        // Sort locally
        staff.sort((a, b) => a.name.localeCompare(b.name));
        events.sort((a, b) => new Date(b.date) - new Date(a.date));
        expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

        setStaffList(staff);
        setEventsList(events);
        setContributionsList(contributions);
        setExpensesList(expenses);
      }
    } catch (err) {
      console.error("Database sync failed:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser]);

  if (authChecking) {
    return (
      <div style={{ display: 'flex', width: '100vw', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '8px' }}>Verifying Guild Credentials</h2>
          <p style={{ color: 'var(--text-muted)' }}>Connecting to Guild secure servers...</p>
        </div>
      </div>
    );
  }

  // Auth Card Page
  if (!currentUser) {
    return <Login onAuthSuccess={(user) => setCurrentUser(user)} />;
  }

  // Pending Status Screen
  if (currentUser.status === 'pending') {
    return (
      <PendingApproval 
        user={currentUser} 
        onLogout={handleLogout} 
        onStatusRefresh={(updatedUser) => setCurrentUser(updatedUser)} 
      />
    );
  }

  // Main Dashboard Shell
  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="school-logo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <div>
            <h2 className="sidebar-title">Kilinochchi Central</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Guild Account Manager</p>
          </div>
        </div>

        <nav className="sidebar-menu">
          <div 
            onClick={() => setActiveTab('dashboard')} 
            className={`sidebar-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </div>
          <div 
            onClick={() => setActiveTab('staff')} 
            className={`sidebar-item ${activeTab === 'staff' ? 'active' : ''}`}
          >
            <Users size={18} />
            <span>Staff Details</span>
          </div>
          <div 
            onClick={() => setActiveTab('events')} 
            className={`sidebar-item ${activeTab === 'events' ? 'active' : ''}`}
          >
            <Calendar size={18} />
            <span>Events & Dues</span>
          </div>
          <div 
            onClick={() => setActiveTab('expenses')} 
            className={`sidebar-item ${activeTab === 'expenses' ? 'active' : ''}`}
          >
            <Receipt size={18} />
            <span>Expenses Log</span>
          </div>
          <div 
            onClick={() => setActiveTab('reports')} 
            className={`sidebar-item ${activeTab === 'reports' ? 'active' : ''}`}
          >
            <FilePieChart size={18} />
            <span>Financial Reports</span>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">
              {currentUser.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <span className="user-name">{currentUser.displayName}</span>
              <span className="user-role">{currentUser.role}</span>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary" style={{ width: '100%', gap: '8px' }}>
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {!isFirebaseConfigured && (
          <div className="alert-banner" style={{ marginBottom: '24px' }}>
            <AlertTriangle size={18} style={{ color: 'var(--warn)' }} />
            <div>
              <strong>Firebase Offline Notice:</strong> Currently running in local simulation mode. To connect your production database, update your config file or add environment variables to Vercel/local `.env`.
            </div>
          </div>
        )}

        {/* Tab Routers */}
        {activeTab === 'dashboard' && (
          <Dashboard 
            currentUser={currentUser} 
            staffList={staffList} 
            eventsList={eventsList}
            expensesList={expensesList}
            contributionsList={contributionsList}
            onUpdateUsers={fetchData}
          />
        )}

        {activeTab === 'staff' && (
          <StaffManager 
            currentUser={currentUser} 
            staffList={staffList} 
            onRefreshStaff={fetchData}
          />
        )}

        {activeTab === 'events' && (
          <EventManager 
            currentUser={currentUser} 
            staffList={staffList} 
            eventsList={eventsList}
            contributionsList={contributionsList}
            onRefreshEvents={fetchData}
          />
        )}

        {activeTab === 'expenses' && (
          <ExpenseManager 
            currentUser={currentUser} 
            eventsList={eventsList} 
            expensesList={expensesList}
            contributionsList={contributionsList}
            onRefreshExpenses={fetchData}
          />
        )}

        {activeTab === 'reports' && (
          <Reports 
            staffList={staffList} 
            eventsList={eventsList}
            contributionsList={contributionsList}
            expensesList={expensesList}
          />
        )}
      </main>
    </div>
  );
}
