# Life Planner 2027

A planner for your 2027 goals. It covers:

- **Plan:** life areas, daily habits, quarterly goals, December celebrations, and a backup tool.
- **Today:** mood, habits, tasks (optionally linked to a weekly step), bills due, and reminders.
- **Months:** four goals per month, each with four weekly steps. Mark goals done, missed, or carried over (50%). Win count, loss points, rewards, month and quarter milestones.
- **Journal:** a weekly entry with recap, wins, and reflection. Mood average and tasks done that week fill in automatically.
- **Money:** monthly budget, savings target, expenses, and recurring bills.

All data is saved in the browser on the device you use.

---

## 1. Put it on GitHub Pages

1. Create a **public** repository on GitHub, for example `life-planner`. Pages on the free plan requires a public repo.
2. Upload these files to the root of the repository: `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`, and `README.md`.
3. Go to **Settings > Pages**. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
4. Wait about a minute. Your link will be `https://<your-username>.github.io/life-planner/`.

**Working live on GitHub:** open any file on github.com, tap the pencil icon, edit, and commit. The site updates within a minute or two. Reload the app on your phone to see the change.

## 2. Install on the Galaxy A17

1. Open your link in Chrome.
2. Tap the menu (three dots), then **Install app** or **Add to Home screen**.
3. Open it from the home screen. It runs full screen.

Open the app once while online. After that it opens and works offline, and it fetches the newest version whenever you're online.

## 3. Google Calendar (optional)

Google requires you to register the app once. This takes about ten minutes and is free.

1. Go to **console.cloud.google.com** and create a project, for example "Life Planner".
2. Open **APIs & Services > Library**, search for **Google Calendar API**, and click **Enable**.
3. Open **APIs & Services > OAuth consent screen**. Choose **External**, fill in an app name and your email, and save. Under **Test users**, add your own Gmail address. While the app is in testing mode, only test users can sign in.
4. Open **APIs & Services > Credentials > Create credentials > OAuth client ID**. Choose **Web application**.
5. Under **Authorized JavaScript origins**, add your site's origin exactly, for example `https://<your-username>.github.io`. No path and no trailing slash.
6. Copy the **Client ID**. Open `app.js` on GitHub, click the pencil, and replace `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` with it. Commit.

Then on the Today tab, tap **Connect Google Calendar**. Tasks are added as all-day events on their date. Each task is added only once.

## 4. Reminders

On the Today tab, turn on the daily summary and the Sunday journal reminder, set a time, and tap **Allow notifications**.

Browsers can only show notifications when they get a chance to run. For a reliable daily reminder, also set a phone alarm for the same time. Full background reminders would need a server, which this free setup does not have.

## 5. Backup

Your data lives on the phone. Use **Plan > Step 5 > Export backup** regularly, and before clearing browser data or switching phones. Import restores a backup file.

---

## Known limits in this version

- Data stays on each device. It does not sync between a phone and a computer. Use export and import to move it.
- Notifications are best-effort, as described above.
- Google Calendar sign-in lasts about an hour. If you see "session ended", tap **Add today's tasks** again to reconnect.
- Habits repeat every day. Weekly habits (for example, "sleep 10 hours" only in a stressful week) can be ticked on the days you need them.
- Carrying a goal over creates a single carried item in the next month. It doesn't take one of that month's four spots.
- Month close marks open goals as missed for the loss count. You can reopen the month if you closed it by mistake.
