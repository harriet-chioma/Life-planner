# Life Planner 2027

A browser-based personal planner with five sections:

- **Plan:** life areas, habits, quarterly goals, year-end celebrations, and backup tools.
- **Today:** daily mood, habit checklist, tasks, bills due, optional Google Calendar export, and best-effort reminders.
- **Months:** up to four goals per month, weekly steps, carried goals, reward tracking, and month/quarter milestones.
- **Journal:** weekly recap, wins, reflection, mood average, and completed tasks.
- **Money:** monthly budget, savings target, expenses, and recurring bills.

## Important data and privacy notes

- Planner data is stored in this browser on this device using `localStorage`.
- Data does **not** sync between devices or automatically back up to a server.
- Export a backup regularly, especially before changing phones or clearing browser data.
- Do not enter passwords, bank login details, or other highly sensitive information.
- Google Calendar access is optional. The OAuth access token is held in memory and is not written to planner storage.
- Notifications are best-effort only while the browser/app gets an opportunity to run. They are not guaranteed background alarms.

## Run locally

Do not open `index.html` using a `file://` URL. Use a local web server.

With Python installed, open a terminal in this folder and run:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy free with GitHub Pages

1. Create a GitHub repository (public repositories can use GitHub Pages on the free plan).
2. Upload all files in this folder to the repository root:
   `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, and `icon.svg`.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`, then save.
6. Wait for deployment and open `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

All internal asset paths are relative so the app can run from a repository subpath.

## Optional Google Calendar setup

The app uses Google's browser-based Identity Services token flow. It does not need a client secret in the frontend.

1. Create a project in Google Cloud Console.
2. Enable the Google Calendar API.
3. Configure the OAuth consent screen and add your Google account as a test user if the app remains in testing.
4. Create an OAuth Client ID with application type **Web application**.
5. Under **Authorized JavaScript origins**, add the origin only, for example:
   `https://YOUR-USERNAME.github.io`
   Do not include the repository path or a trailing slash.
6. In `app.js`, replace the placeholder `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` with your client ID.
7. Commit and deploy the change.

Never put a Google OAuth **client secret** in this repository. The client ID is public by design. Google may require additional consent-screen verification for wider distribution.

Tasks are added to Google Calendar as all-day events on their selected date. This is a one-way export; edits or deletions in Google Calendar are not synchronised back to this planner.

## Updating the app

After changing the source files, commit them to `main`. The service worker uses a versioned cache (`life-planner-shell-v3`). If you make another service-worker change that must replace installed caches, increment that cache version.

During development, if you see an old build:
- Reload the page while online.
- In Chrome, open DevTools → Application → Service Workers and unregister the old worker if necessary.
- Clear the site's cached data only if you have exported a backup first.

## Test checklist

- Add an area, habit, quarterly goal, monthly goal, and task.
- Tick a habit and task, then reload and confirm they remain.
- Add a journal entry and an expense.
- Export a backup, import it into a test browser profile, and verify the data.
- Test narrow mobile widths and keyboard navigation.
- Load once online, then switch offline and reload to test the app shell.
- If using Google Calendar, test only after configuring the OAuth client ID and authorized origin.
