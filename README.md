# Kilinochchi Central College - Guild Account Management

A premium, state-of-the-art Account Management Web Application built for the School Guild of Kilinochchi Central College. Powered by **React**, **Firebase (Auth, Firestore, Cloud Storage)**, and custom **Vanilla CSS**.

---

## Features
- **Security & Approvals**: Google and Email sign-in. The first user to register automatically gets the **Admin** role, while subsequent users are placed in **Pending Approval** until approved by an Admin.
- **Staff Registry**: Add staff manually or perform **Bulk Upload** from a CSV spreadsheet. Easily export the staff list back to CSV.
- **Event Contributions**: Manage events, target collection amounts, and set organizer exemptions (exempt coordinators pay Rs. 0). Track individual contributions (paid/unpaid) with auto-saving.
- **Expense Logging**: Track event expenses by category (Food, Stationery, etc.) and upload bill receipt photos directly to Firebase Storage with a Base64 local storage fallback. Check budget surpluses/deficits instantly.
- **Professional Audits**: 
  - Generate Single Event Reports or Custom Date Range Reports.
  - Compile an **Event Matrix (Cross-tab grid)** displaying who paid, who didn't, and total staff dues.
  - Export reports to **Excel (CSV)** or generate styled **PDF Documents**.
  - Direct sharing hooks for **WhatsApp** and **Email**.

---

## 🛠️ Step 1: Firebase Project Setup

To link your live database, complete these quick steps in the [Firebase Console](https://console.firebase.google.com/):

1. **Create a Project**: Click **Add Project** and name it `kcc-guild-accounts`.
2. **Add a Web App**: In your project dashboard, click the `</>` (Web) icon, register your app, and copy the `firebaseConfig` object keys.
3. **Authentication Setup**:
   - Go to **Authentication** > **Sign-in method**.
   - Enable **Email/Password** and **Google**.
4. **Firestore Database Setup**:
   - Go to **Firestore Database** > **Create database**.
   - Start in **Production Mode** or **Test Mode**.
   - Under the **Rules** tab, paste the following secure rules:
     ```javascript
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /{document=**} {
           allow read, write: if request.auth != null;
         }
       }
     }
     ```
5. **Cloud Storage Setup** (for receipts):
   - Go to **Storage** > **Get Started**.
   - Under the **Rules** tab, paste the following rules:
     ```javascript
     rules_version = '2';
     service firebase.storage {
       match /b/{bucket}/o {
         match /{allPaths=**} {
           allow read, write: if request.auth != null;
         }
       }
     }
     ```

---

## ⚙️ Step 2: Environment Configurations

1. Inside the `guild-accounts` directory, rename `.env.example` to `.env`.
2. Open `.env` and fill in the values with your copied Firebase Config credentials:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=kcc-guild-accounts.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=kcc-guild-accounts
   VITE_FIREBASE_STORAGE_BUCKET=kcc-guild-accounts.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

*Note: If these environment variables are left default or missing, the application automatically enters **Local Simulation Mode**, allowing you to test all functionalities immediately with local client-side storage.*

---

## 🚀 Step 3: Run Locally (Requires Node.js)

If you have Node.js installed on your machine, run these commands in your terminal inside the `guild-accounts` folder:

```bash
# 1. Install dependencies
npm install

# 2. Run the Vite development server
npm run dev
```
The server will boot up at `http://localhost:3000` and open automatically.

---

## 📦 Step 4: Push to GitHub & Deploy to Vercel

If you don't have Git installed locally, you can upload this folder directly using **GitHub's web dashboard**!

### Option A: Uploading via GitHub Website (No command line needed)
1. Go to [GitHub](https://github.com/) and click **New Repository**.
2. Name it `kcc-guild-accounts` (keep it public or private) and click **Create**.
3. On the setup page, click the **"uploading an existing file"** link.
4. Drag and drop all the files and folders from `C:\Users\sathu\.gemini\antigravity\scratch\guild-accounts` (except `node_modules` if you ran npm install) into the upload box.
5. Click **Commit changes**.

### Option B: Using Git Command Line
```bash
git init
git add .
git commit -m "Initial commit - Kilinochchi Central College Account System"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/kcc-guild-accounts.git
git push -u origin main
```

---

## 🌩️ Step 5: Live Vercel Deployment

1. Go to [Vercel](https://vercel.com/) and log in using your GitHub account.
2. Click **Add New** > **Project**.
3. Import your `kcc-guild-accounts` repository.
4. Expand the **Environment Variables** section and copy/paste all the keys from your `.env` file:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
5. Click **Deploy**. Your application will be live in 1 minute!
