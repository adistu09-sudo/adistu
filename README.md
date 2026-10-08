# Adistu

Adistu is a local marketplace with a static frontend, Firebase Authentication, and a Python HTTP API. Firebase Hosting serves the site and routes `/api/**` requests to a second-generation Google Cloud Function. The API stores marketplace records in Firestore.

Sellers set a flat delivery fee per order in **Shop details**. Buyers see the shop's fee (or **Free delivery**) on each product in the nearby feed. There is no cart or checkout yet, so this is an estimate shown with each product, not a charge or payment.

## Feed ads

The buyer feed inserts one responsive Google AdSense placement after each 10 products. To enable paid ads, set `data-adsense-client` on `#feed-list` in `index.html` to your AdSense publisher ID (`ca-pub-...`) and `data-adsense-slot` to the responsive ad unit's numeric slot ID. Google must approve the site and ad unit before ads can serve; follow AdSense policies and configure `ads.txt` for the production domain when required.

## Google Cloud setup

You need a Google Cloud project with billing enabled, the Google Cloud CLI, and the Firebase CLI. Link a Firebase project to the same Google Cloud project.

Set the project ID used by the commands below:

```sh
export GOOGLE_CLOUD_PROJECT="your-project-id"
```

1. Enable the required APIs:

   ```sh
   gcloud services enable cloudfunctions.googleapis.com cloudbuild.googleapis.com \
     artifactregistry.googleapis.com run.googleapis.com firestore.googleapis.com \
     identitytoolkit.googleapis.com firebasehosting.googleapis.com
   ```

2. Create a Firestore database in Native mode. In Firebase Authentication, enable **Email/Password**, **Phone**, and **Google** sign-in providers. Add your Firebase Hosting domain (`<project-id>.web.app`) to Authentication's authorized domains.

3. Create a runtime service account with access to Firestore and Firebase Authentication:

   ```sh
   gcloud iam service-accounts create adistu-runtime
   gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT" \
     --member="serviceAccount:adistu-runtime@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com" \
     --role="roles/datastore.user"
   gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT" \
     --member="serviceAccount:adistu-runtime@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com" \
     --role="roles/firebaseauth.admin"
   ```

4. Deploy the HTTP function. The Firebase web-app values are available from Firebase Project settings. The API key is public client configuration, not a server credential; restrict it to the Firebase Authentication API and your production domains.

   ```sh
   gcloud functions deploy adistu-api \
     --gen2 --runtime python312 --region us-central1 \
     --source backend --entry-point api --trigger-http --allow-unauthenticated \
     --service-account "adistu-runtime@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com" \
     --set-env-vars "GOOGLE_CLOUD_PROJECT=$GOOGLE_CLOUD_PROJECT,FIREBASE_PROJECT_ID=$GOOGLE_CLOUD_PROJECT,FIREBASE_API_KEY=YOUR_WEB_API_KEY,FIREBASE_AUTH_DOMAIN=$GOOGLE_CLOUD_PROJECT.firebaseapp.com,FIREBASE_APP_ID=YOUR_WEB_APP_ID,FIREBASE_MESSAGING_SENDER_ID=YOUR_SENDER_ID"
   ```

   The function is publicly reachable so the browser can call it; protected API routes verify Firebase ID tokens and enforce account permissions.

5. Select the Firebase project and deploy the static site with its API rewrite:

   ```sh
   firebase use --add
   firebase deploy --only hosting
   ```

   The rewrite in `firebase.json` sends `/api/**` to `adistu-api` in `us-central1`; all other requests are served from Firebase Hosting. For phone sign-in, configure Firebase's SMS region policy and billing/quota settings; registration and sign-in require SMS delivery and browser reCAPTCHA.

6. Seed the sample catalog from an authenticated Google Cloud CLI session:

   ```sh
   gcloud auth application-default login
   GOOGLE_CLOUD_PROJECT="$GOOGLE_CLOUD_PROJECT" python -m pip install -r backend/requirements.txt
   GOOGLE_CLOUD_PROJECT="$GOOGLE_CLOUD_PROJECT" python backend/seed_data.py
   ```

The app uses Firestore collections `shops`, `products`, and `users`, with `activities` under each product and `workers` under each shop. Location is used to calculate feed distances and is not saved for buyers.

## Test locally with Firebase emulators

This workflow serves the site and Python API on your computer and stores test accounts/data in local emulators. It does not deploy the website or write to a production Firebase project. Install Node.js, Java, and the Firebase CLI first:

```powershell
python -m venv .venv-local
.\.venv-local\Scripts\python.exe -m pip install -r backend/requirements.txt
npm install -g firebase-tools
```

Open one terminal in the project directory and start the Auth and Firestore emulators using a demo project ID:

```powershell
firebase emulators:start --only auth,firestore --project demo-adistu
```

In a second terminal, start the local website and API:

```powershell
.\.venv-local\Scripts\python.exe backend/dev_server.py
```

Open `http://127.0.0.1:5000`. Create a buyer or seller account there; the Auth emulator accepts test accounts without sending email or SMS. The API uses the Firestore emulator at `127.0.0.1:8080`. Emulator data is local and is cleared when the emulator is restarted unless you configure data export/import.

## Existing local data

The Google Cloud deployment does not migrate AWS, Django, or local SQLite accounts and records. Back up any data you need before removing the old deployment, then export and import it separately. Existing user passwords cannot be transferred to Firebase Authentication as usable credentials; users must create or recover an account with the new provider.
