# 🍞 Newlight Breadworks — Order Management System
## Complete Setup Guide (No Technical Experience Required)

---

## WHAT YOU'RE SETTING UP

This system has three parts:
1. **Firebase** — Your database in the cloud (stores all orders, customers, etc.)
2. **GitHub** — Where your code lives (free)
3. **Netlify** — Where your website is hosted (free)

Total setup time: ~45 minutes

---

## PART 1: SET UP FIREBASE (Your Database)

### Step 1.1 — Create a Firebase Account
1. Go to **https://firebase.google.com**
2. Click **"Get started"** (top right)
3. Sign in with your Google account (create one if needed)

### Step 1.2 — Create a New Project
1. Click **"Add project"**
2. Project name: `newlight-breadworks-oms`
3. Click **Continue**
4. Disable Google Analytics (you don't need it) → **Create project**
5. Wait ~30 seconds, then click **Continue**

### Step 1.3 — Set Up the Database (Firestore)
1. In the left sidebar, click **"Build"** → **"Firestore Database"**
2. Click **"Create database"**
3. Select **"Start in production mode"** → **Next**
4. Choose location: **`us-east1`** (or closest to you) → **Enable**
5. Wait for it to provision

### Step 1.4 — Set Up Security Rules
1. In Firestore, click the **"Rules"** tab
2. Replace everything with this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only authenticated users can read/write
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Click **"Publish"**

### Step 1.5 — Set Up Authentication
1. In the left sidebar, click **"Build"** → **"Authentication"**
2. Click **"Get started"**
3. Under **"Sign-in method"**, click **"Email/Password"**
4. Toggle **Enable** → **Save**

### Step 1.6 — Create Your First User Accounts
1. Still in Authentication, click **"Users"** tab
2. Click **"Add user"**
3. Add each staff member:
   - Email: their work email
   - Password: a temporary password (they can't change it from the app yet, so make it something you'll remember)
4. After creating each user, copy their **User UID** (the long string like `abc123def456...`)
   — You'll need this in Step 1.7

### Step 1.7 — Set User Roles in Firestore
1. Go to Firestore → **"Data"** tab
2. Click **"Start collection"**
3. Collection ID: `users` → **Next**
4. For each user you created:
   - Document ID: paste the User UID from Step 1.6
   - Add these fields:
     - `name` (string): Their full name
     - `email` (string): Their email
     - `role` (string): `admin`, `staff`, or `baker`
     - `active` (boolean): `true`
     - `createdAt` (string): today's date like `2026-02-21`
5. Click **Save**

> **Role guide:**
> - `admin` — Can do everything including the Admin panel
> - `staff` — Can enter orders, see production, print stickers
> - `baker` — Can see production sheet and mix sheet only

### Step 1.8 — Get Your Firebase Config Keys
1. In Firebase, click the **gear icon** (⚙️) → **"Project settings"**
2. Scroll down to **"Your apps"**
3. Click the **"</>"** (Web) icon to add a web app
4. App nickname: `bakery-oms` → **Register app**
5. You'll see a code block with your config. Copy these values — you'll need them soon:
   ```
   apiKey: "AIza..."
   authDomain: "newlight-breadworks-oms.firebaseapp.com"
   projectId: "newlight-breadworks-oms"
   storageBucket: "newlight-breadworks-oms.appspot.com"
   messagingSenderId: "123456789"
   appId: "1:123456789:web:abc123"
   ```

---

## PART 2: SET UP GITHUB (Code Storage)

### Step 2.1 — Create a GitHub Account
1. Go to **https://github.com**
2. Click **"Sign up"** and create a free account

### Step 2.2 — Create a New Repository
1. Once logged in, click **"+"** (top right) → **"New repository"**
2. Repository name: `newlight-breadworks-oms`
3. Set to **Private**
4. Click **"Create repository"**

### Step 2.3 — Upload the Code
You'll need to install Git on your computer first:

**On Mac:**
1. Open Terminal (search "Terminal" in Spotlight)
2. Type: `git --version`
3. If it asks to install developer tools, click Install

**On Windows:**
1. Download Git from **https://git-scm.com/download/win**
2. Install it with default settings

**Upload the code:**
1. Open Terminal (Mac) or Git Bash (Windows)
2. Navigate to the `bakery-oms` folder you received:
   ```
   cd ~/Downloads/bakery-oms
   ```
3. Run these commands one by one:
   ```
   git init
   git add .
   git commit -m "Initial bakery OMS setup"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/newlight-breadworks-oms.git
   git push -u origin main
   ```
   (Replace `YOUR_GITHUB_USERNAME` with your GitHub username)

4. When prompted, enter your GitHub username and password
   - Note: GitHub now uses tokens instead of passwords. If it fails, go to GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic) → check "repo" → copy the token and use it as your password

---

## PART 3: DEPLOY TO NETLIFY (Your Live Website)

### Step 3.1 — Create a Netlify Account
1. Go to **https://netlify.com**
2. Click **"Sign up"** → **"Sign up with GitHub"** (use the same account)
3. Authorize Netlify to access GitHub

### Step 3.2 — Connect Your Repository
1. In Netlify dashboard, click **"Add new site"** → **"Import an existing project"**
2. Click **"GitHub"**
3. Search for and select `newlight-breadworks-oms`
4. Configure build settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `.next`
5. **DO NOT click Deploy yet** — first do Step 3.3

### Step 3.3 — Add Your Firebase Keys
This is the most important step — this connects your website to your database.

1. Still on the deploy settings page, click **"Add environment variables"**
2. Add each of these one by one (click "Add variable" for each):

| Key | Value (from Step 1.8) |
|-----|----------------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIza...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `newlight-breadworks-oms.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `newlight-breadworks-oms` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `newlight-breadworks-oms.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `123456789` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:123456789:web:abc123` |

3. Now click **"Deploy site"**
4. Wait 2-4 minutes for deployment
5. Netlify will give you a URL like `https://happy-bread-123456.netlify.app`

### Step 3.4 — Set a Custom Domain (Optional)
1. In Netlify, go to **"Domain settings"**
2. Click **"Add custom domain"**
3. Enter your domain (e.g., `orders.newlightbreadworks.com`)
4. Follow their DNS instructions (contact your domain registrar if needed)

---

## PART 4: SET UP ZAPIER FOR FRESHBOOKS

### Step 4.1 — Create a Zapier Account
1. Go to **https://zapier.com**
2. Sign up for a free account (free plan allows 100 tasks/month; paid plans for more)

### Step 4.2 — Create the Webhook Zap
1. Click **"Create Zap"**
2. **Trigger:** Search for "Webhooks by Zapier" → **"Catch Hook"**
3. Click **Continue** → **Copy the webhook URL** (looks like `https://hooks.zapier.com/hooks/catch/123456/abcdef/`)

### Step 4.3 — Add the Webhook URL to Netlify
1. Go back to Netlify → **Site settings** → **Environment variables**
2. Add a new variable:
   - Key: `NEXT_PUBLIC_ZAPIER_WEBHOOK_URL`
   - Value: your Zapier webhook URL from above
3. Click **Save**, then go to **Deploys** → **Trigger deploy** → **Deploy site**

### Step 4.4 — Connect Zapier to Freshbooks
1. Back in Zapier, after the trigger is set up, click **"+"** to add an action
2. Search for **"FreshBooks"**
3. Action: **"Create Invoice"** or **"Create Invoice Item"**
4. Connect your FreshBooks account
5. Map the fields:
   - Client: use `{{customerName}}` from the webhook data
   - Item name: use `{{items[0].name}}`
   - Quantity: use `{{items[0].quantity}}`
   - Unit price: use `{{items[0].unitPrice}}`
   - Notes: use `{{notes}}`
6. Test the Zap by submitting a test order in your bakery system
7. Turn on the Zap

> **Note:** For line items (multiple products per order), you may need Zapier's "Line Items" feature or a more complex Zap with a loop. The Starter plan ($20/mo) includes multi-step Zaps.

---

## PART 5: ADDING YOUR EXISTING CUSTOMERS

Rather than entering 400 customers one by one through the admin panel, you can bulk import them via Firebase Console:

### Option A — Use the Admin Panel (for small batches)
1. Go to your website → **Admin** → **New Customer**
2. Fill in all details → Save

### Option B — Bulk Import via Firebase Console (recommended for 400 customers)
1. Prepare a CSV with columns: name, type, route, code, address, deliveryInfo, callNumber, packagingType, email, phone
2. Contact us and we can provide a one-time import script to load all customers at once

---

## PART 6: DAY-TO-DAY USAGE

### How Staff Enter Orders
1. Go to your website URL
2. Log in with your email/password
3. Click **"Orders"** → Select customer → Select date → Enter quantities → Submit

### How Bakers See Production
1. Log in → Click **"Production"**
2. Select the delivery date
3. See all products needed and quantities per customer

### How to Print Stickers
1. Log in → Click **"Stickers"**
2. Select the delivery date
3. Check/uncheck which orders to print
4. Click **"Print"** → Your browser print dialog opens
5. Set paper size to label stock (3"×2") in your printer settings

### How Bakers Use the Mix Sheet
1. Log in → Click **"Mix Sheet"**
2. Select the production date
3. Enter gram weights for each dough category
4. See units ordered per category to cross-reference
5. Click **Save**

---

## TROUBLESHOOTING

**"Permission denied" error when logging in**
→ Make sure the user exists in Firestore's `users` collection with the correct UID

**Orders not appearing on production sheet**
→ Check the delivery date matches exactly (format: YYYY-MM-DD)

**Stickers printing wrong size**
→ In your browser print dialog, set paper to "Labels" and disable "Fit to page"

**Zapier not receiving data**
→ Check the webhook URL is correctly set in Netlify environment variables and re-deploy

**"Firebase not initialized" error**
→ Double-check all 6 environment variables are set correctly in Netlify

---

## GETTING HELP

For technical issues, contact your system administrator. For Freshbooks/Zapier integration support, Zapier has live chat support at zapier.com/help.

---

## SECURITY REMINDERS

- Never share Firebase API keys publicly (GitHub etc.) — they're safe in Netlify's environment variables
- Change temporary passwords after first login
- Admin role should only be given to trusted staff
- Firebase rules ensure only logged-in users can access any data
