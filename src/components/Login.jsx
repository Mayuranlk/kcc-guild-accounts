import React, { useState } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  isFirebaseConfigured,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  collection,
  getDocs,
  getDoc,
  setDoc,
  doc
} from '../firebase';
import { Mail, Lock, LogIn, UserPlus, AlertCircle, Loader2 } from 'lucide-react';

export default function Login({ onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFirebaseSignUp = async (email, password, displayName) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Check if this is the first user to register
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    const isFirstUser = usersSnapshot.empty;

    const userProfile = {
      uid: user.uid,
      email: user.email,
      displayName: displayName || user.displayName || user.email.split('@')[0],
      role: isFirstUser ? 'admin' : 'regular',
      status: isFirstUser ? 'approved' : 'pending',
      createdAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'users', user.uid), userProfile);
    return userProfile;
  };

  const handleFirebaseSignIn = async (email, password) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
    
    if (userDoc.exists()) {
      return userDoc.data();
    } else {
      // User created auth but has no firestore document
      const userProfile = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName || userCredential.user.email.split('@')[0],
        role: 'regular',
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', userCredential.user.uid), userProfile);
      return userProfile;
    }
  };

  const handleFirebaseGoogleSignIn = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      return userDoc.data();
    } else {
      // Check if first user
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      const isFirstUser = usersSnapshot.empty;

      const userProfile = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        role: isFirstUser ? 'admin' : 'regular',
        status: isFirstUser ? 'approved' : 'pending',
        createdAt: new Date().toISOString()
      };
      await setDoc(userDocRef, userProfile);
      return userProfile;
    }
  };

  // Mock fallbacks for offline demo testing
  const handleLocalSignUp = (email, password, displayName) => {
    const localUsers = JSON.parse(localStorage.getItem('guild_users') || '[]');
    const userExists = localUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (userExists) {
      throw new Error("Email already registered in local database.");
    }
    
    const isFirstUser = localUsers.length === 0;
    const mockUser = {
      uid: 'mock_' + Math.random().toString(36).substr(2, 9),
      email: email,
      displayName: displayName || email.split('@')[0],
      role: isFirstUser ? 'admin' : 'regular',
      status: isFirstUser ? 'approved' : 'pending',
      createdAt: new Date().toISOString()
    };
    
    localUsers.push(mockUser);
    localStorage.setItem('guild_users', JSON.stringify(localUsers));
    localStorage.setItem('current_guild_user', JSON.stringify(mockUser));
    return mockUser;
  };

  const handleLocalSignIn = (email, password) => {
    const localUsers = JSON.parse(localStorage.getItem('guild_users') || '[]');
    const user = localUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      throw new Error("User not found in local database.");
    }
    localStorage.setItem('current_guild_user', JSON.stringify(user));
    return user;
  };

  const handleLocalGoogleSignIn = () => {
    const localUsers = JSON.parse(localStorage.getItem('guild_users') || '[]');
    const isFirstUser = localUsers.length === 0;
    const mockUser = {
      uid: 'mock_google_' + Math.random().toString(36).substr(2, 9),
      email: 'google.user@example.com',
      displayName: 'Google User',
      role: isFirstUser ? 'admin' : 'regular',
      status: isFirstUser ? 'approved' : 'pending',
      createdAt: new Date().toISOString()
    };
    
    const exists = localUsers.find(u => u.email === mockUser.email);
    if (!exists) {
      localUsers.push(mockUser);
      localStorage.setItem('guild_users', JSON.stringify(localUsers));
    }
    
    const activeUser = exists || mockUser;
    localStorage.setItem('current_guild_user', JSON.stringify(activeUser));
    return activeUser;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        if (!displayName.trim()) {
          throw new Error('Please enter your full name');
        }
        let user;
        if (isFirebaseConfigured) {
          user = await handleFirebaseSignUp(email, password, displayName);
        } else {
          user = handleLocalSignUp(email, password, displayName);
        }
        onAuthSuccess(user);
      } else {
        let user;
        if (isFirebaseConfigured) {
          user = await handleFirebaseSignIn(email, password);
        } else {
          user = handleLocalSignIn(email, password);
        }
        onAuthSuccess(user);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      let user;
      if (isFirebaseConfigured) {
        user = await handleFirebaseGoogleSignIn();
      } else {
        user = handleLocalGoogleSignIn();
      }
      onAuthSuccess(user);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Google Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-logo-section">
          <div className="auth-logo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <h1 className="auth-title">Kilinochchi Central College</h1>
          <p className="auth-subtitle">Guild Account Management</p>
        </div>

        {!isFirebaseConfigured && (
          <div className="alert-banner">
            <AlertCircle size={16} />
            <span>Local Simulation Mode: Firebase credentials missing. Registering users locally.</span>
          </div>
        )}

        {error && (
          <div className="alert-banner" style={{ backgroundColor: 'var(--danger-bg)', borderColor: 'var(--danger-border)', color: 'var(--danger)' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isSignUp && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Full Name</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  className="form-control"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                placeholder="example@kcc.edu"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                required
                placeholder="••••••••"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '14px', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : isSignUp ? (
              <>
                <UserPlus size={18} />
                Create Guild Account
              </>
            ) : (
              <>
                <LogIn size={18} />
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="auth-divider">Or continue with</div>

        <button 
          onClick={handleGoogleSignIn} 
          className="google-signin-btn"
          disabled={loading}
        >
          <img 
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/action/google.svg" 
            alt="Google logo" 
            className="google-icon"
          />
          Sign in with Google
        </button>

        <p className="auth-toggle-link">
          {isSignUp ? "Already have an account? " : "New to the Guild? "}
          <span 
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            style={{ color: 'var(--primary)', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isSignUp ? "Sign In" : "Register Now"}
          </span>
        </p>
      </div>
    </div>
  );
}
