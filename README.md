# Kilinochchi Central College - Guild Account Management

React + Firebase account management system for the Kilinochchi Central College School Guild.

## Features

- Firebase Authentication with Email/Password and Google sign-in.
- First registered user becomes `admin`; new users stay `pending` until an admin approves them.
- Admin can grant `treasurer` access for account handling.
- Staff registry with manual entry, Excel/CSV bulk upload, and Excel export.
- Event contribution tracking with organizer/staff exemptions.
- Paid/unpaid contribution marking per event, including custom collected amounts.
- Event reports showing paid staff, unpaid staff, collected totals, expenses, surplus, or deficit.
- Custom date range reports across multiple events, including staff-wise paid and outstanding totals.
- Expense entry by event and category with bill photo upload to Firebase Storage.
- Excel, PDF, email, and WhatsApp report sharing.
- Responsive modern UI for desktop and mobile.

## Firebase Setup

Create a Firebase project and enable:

- Authentication: Email/Password and Google providers.
- Firestore Database.
- Cloud Storage.

Copy `.env.example` to `.env` for local development and add the same variables to Vercel:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

The app requires Firebase configuration. It does not use mock data or localStorage fallback.

## Firebase Rules

Deploy the included rules:

```bash
firebase deploy --only firestore:rules,storage
```

The rules allow:

- Signed-in users to create their own profile.
- Approved users to read guild data.
- Treasurer/admin users to manage staff, events, contributions, expenses, and bill uploads.
- Admin users to approve users and assign roles.

## Local Development

```bash
npm install
npm run dev
```

Vite runs at `http://localhost:3000`.

## Production Build

```bash
npm run build
```

## Deploy To Vercel

1. Import `Mayuranlk/kcc-guild-accounts` in Vercel.
2. Add all `VITE_FIREBASE_*` environment variables.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Deploy.

## GitHub

Repository:

```text
https://github.com/Mayuranlk/kcc-guild-accounts
```
