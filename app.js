/* =========================================================
   Life Planner 2027
   Everything runs in the browser. Data is saved in localStorage.
   ========================================================= */

/* ---------- Settings you can change ---------- */
const CONFIG = {
  // Paste your Google OAuth "Web application" client ID here. See README.md.
  // Leave it as is to use the planner without Google Calendar.
  googleClientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'
};

/* ---------- Constants ---------- */
const KEY = 'life-planner-2027-v2';
const OLD_KEY = 'life-planner-2027-v1';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DEFAULT_AREAS = ['Work','Career','Health','Relationships','Daily tasks','Hobbies','Habits','Finances'];
const MOODS = ['Low','Meh','Okay','Good','Great'];

/* ---------- Helpers ---------- */
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const todayISO = () => iso(new Date());
const weekKey = s => { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const monthOf = s => parseISO(s).getMonth();
const yearOf = s => parseISO(s).getFullYear();
const quarterOfMonth = m => Math.floor(m / 3);
const fmtDate = s => { const d = parseISO(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; };
const fmt = n => (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const defaultMonth = () => { const t = todayISO(); return yearOf(t) === 2027 ? monthOf(t) : 0; };

/* ---------- State ---------- */
function freshState() {
  return {
    started: false,
    areas: DEFAULT_AREAS.map(name => ({ id: uid(), name, active: true })),
    habits: [],          // { id, areaId, text }
    habitLog: {},       // { 'YYYY-MM-DD': [habitId] }
    quarters: { 0: [], 1: [], 2: [], 3: [] }, // quarterly goals: { id, areaId, title }
    celebrations: [],    // { id, areaId, text, reward, done }
    goals: [],           // monthly goals, see makeGoal()
    rewards: {},         // { [month]: { full, partial } }
    monthClosed: {},     // { [month]: true }
    claimed: {},         // { [month]: true }
    celebrated: {},      // { 'm0' | 'q0': true }
    tasks: [],           // { id, date, areaId, text, done, stepId, gcalId }
    moods: {},           // { 'YYYY-MM-DD': { score, note } }
    journals: {},        // { 'YYYY-MM-DD (Monday)': { recap, wins, reflection, saved } }
    finance: {},         // { [month]: { budget, target } }
    expenses: [],        // { id, date, amount, category, note }
    bills: [],           // { id, name, amount, dueDay }
    settings: { remindersOn: false, remindTime: '08:00', journalReminder: true, lastDaily: '', lastJournal: '' },
    gcal: { connected: false }
  };
}

function makeGoal({ month, areaId, title, parentId = null, carriedFrom = null }) {
  return {
    id: uid(), month, areaId, title, parentId, carriedFrom, status: 'open',
    steps: [0, 1, 2, 3].map(() => ({ id: uid(), text: '', done: false }))
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) return { ...freshState(), ...saved, settings: { ...freshState().settings, ...(saved.settings || {}) } };

    // Upgrade from the first test build, if it exists
    const old = JSON.parse(localStorage.getItem(OLD_KEY));
    if (old) {
      const f = freshState();
      f.started = !!old.started;
      if (old.areas) f.areas = old.areas;
      f.habits = old.habits || [];
      f.celebrations = (old.celebrations || []).map(c => ({ ...c, done: false }));
      f.rewards = old.rewards || {};
      f.goals = (old.goals || []).map(g => ({
        ...g,
        parentId: null,
        steps: [0, 1, 2, 3].map(i => ({ id: uid(), text: '', done: !!(g.steps || [])[i] }))
      }));
      return f;
    }
  } catch (e) { /* fall through to a fresh state */ }
  return freshState();
}

let state = loadState();
let ui = {
  tab: state.started ? 'today' : 'plan',
  step: 1,
  month: defaultMonth(),
  day: todayISO(),
  journalDay: todayISO()
};

function saveState() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    toast('Could not save on this device. Check your browser storage settings.');
  }
}

/* ---------- Lookups and calculations ---------- */
const activeAreas = () => state.areas.filter(a => a.active);
const areaName = id => (state.areas.find(a => a.id === id) || {}).name || 'Unassigned';
const areaOptions = sel => activeAreas().map(a =>
  `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
const ownGoals = m => state.goals.filter(g => g.month === m && !g.carriedFrom);
const carriedIn = m => state.goals.filter(g => g.month === m && g.carriedFrom);
const tasksOn = day => state.tasks.filter(t => t.date === day);

function stats(m) {
  const own = ownGoals(m);
  const wins = own.filter(g => g.status === 'done').length;
  const missed = own.filter(g => g.status === 'missed').length;
  const carried = own.filter(g => g.status === 'carried').length;
  const open = own.filter(g => g.status === 'open').length;
  const tier = wins === 4 ? 'full' : wins === 3 ? 'partial' : 'none';
  // Open goals count as missed once the month is closed. Carried goals are 50%.
  const losses = missed + carried * 0.5 + (state.monthClosed[m] ? open : 0);
  return { wins, missed, carried, open, losses, tier };
}

function findStep(id) {
  for (const g of state.goals) {
    const s = g.steps.find(x => x.id === id);
    if (s) return { g, s };
  }
  return null;
}

function quarterGoalById(id) {
  if (!id) return null;
  for (const k of Object.keys(state.quarters)) {
    const g = (state.quarters[k] || []).find(x => x.id === id);
    if (g) return g;
  }
  return null;
}

// Steps for the month that the day belongs to, for linking tasks to weekly steps
function openStepsForMonth(m) {
  const out = [];
  ownGoals(m).forEach(g => g.steps.forEach((s, i) => {
    if (!s.done) out.push({ id: s.id, label: `${g.title} · Week ${i + 1}${s.text ? ': ' + s.text : ''}` });
  }));
  return out;
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- Shared pieces ---------- */
function monthSelect() {
  return `<select data-change="month" aria-label="Month">
    ${MONTHS.map((n, i) => `<option value="${i}" ${i === ui.month ? 'selected' : ''}>${n} 2027</option>`).join('')}
  </select>`;
}

function banners() {
  const out = [];
  const today = todayISO();
  const d = parseISO(today);

  const claimM = [...Array(12).keys()].find(m =>
    state.monthClosed[m] && !state.claimed[m] && stats(m).tier !== 'none');
  if (claimM !== undefined) {
    const t = stats(claimM).tier === 'full' ? 'full' : 'partial';
    out.push(`<div class="banner">Your ${t} reward for ${MONTHS[claimM]} is ready. <button class="btn small" data-action="claim" data-m="${claimM}">Mark claimed</button></div>`);
  }

  if (yearOf(today) === 2027 && d.getDate() >= 15) {
    const m = monthOf(today);
    const idle = ownGoals(m).filter(g => g.status === 'open' && g.steps.every(s => !s.done));
    if (idle.length) {
      out.push(`<div class="banner">${idle.length} goal${idle.length > 1 ? 's' : ''} for ${MONTHS[m]} ${idle.length > 1 ? 'have' : 'has'} no weeks ticked yet. Tick one step to get moving.</div>`);
    }
  }

  if (d.getDay() === 0 && !state.journals[weekKey(today)]) {
    out.push(`<div class="banner">It's Sunday. Write this week's journal entry on the Journal tab.</div>`);
  }
  return out.join('');
}

/* =========================================================
   PLAN TAB (setup for Nov–Dec 2026, editable any time)
   ========================================================= */
function renderPlan() {
  const titles = ['Life areas', 'Daily habits', 'Quarterly goals', 'Year-end celebrations', 'Review and start'];
  const s = ui.step;
  let body = '';

  if (s === 1) {
    body = `
      <p class="hint">Keep the areas that matter to you. Add any others below.</p>
      ${state.areas.map(a => `
        <label class="check">
          <input type="checkbox" data-change="area-on" data-id="${a.id}" ${a.active ? 'checked' : ''}>
          ${esc(a.name)}
        </label>`).join('')}
      <form class="row" data-form="add-area">
        <input type="text" name="name" placeholder="New area, e.g. Faith" maxlength="40" required>
        <button class="btn ghost small" type="submit">Add area</button>
      </form>`;
  }

  if (s === 2) {
    const habitsHtml = activeAreas().map(a => {
      const list = state.habits.filter(h => h.areaId === a.id);
      if (!list.length) return '';
      return `<p class="sub">${esc(a.name)}</p>` + list.map(h => `
        <div class="item">
          <div class="text">${esc(h.text)}</div>
          <button class="btn ghost small" data-action="del-habit" data-id="${h.id}">Remove</button>
        </div>`).join('');
    }).join('');
    body = `
      <p class="hint">Write the habits you want to build in each area. Examples: drink hibiscus tea during your cleanse, sleep 10 hours before a stressful week, wash pillowcases and towels.</p>
      <form class="row" data-form="add-habit">
        <select name="areaId" aria-label="Life area">${areaOptions()}</select>
        <input type="text" name="text" placeholder="A habit, e.g. Drink hibiscus tea" maxlength="120" required>
        <button class="btn" type="submit">Add habit</button>
      </form>
      ${habitsHtml || '<p class="empty">No habits yet.</p>'}`;
  }

  if (s === 3) {
    body = `<p class="hint">Write one or more goals for each quarter. Monthly goals can link to them.</p>` +
      [0, 1, 2, 3].map(q => {
        const list = state.quarters[q] || [];
        return `
          <p class="sub">Q${q + 1}: ${MONTHS[q * 3]} to ${MONTHS[q * 3 + 2]}</p>
          ${list.map(g => `
            <div class="item">
              <div class="text">${esc(g.title)}<small>${esc(areaName(g.areaId))}</small></div>
              <button class="btn ghost small" data-action="del-qgoal" data-id="${g.id}">Remove</button>
            </div>`).join('') || '<p class="empty">None yet.</p>'}
          <form class="row" data-form="add-qgoal" data-q="${q}">
            <select name="areaId" aria-label="Life area">${areaOptions()}</select>
            <input type="text" name="title" placeholder="A goal for Q${q + 1}" maxlength="120" required>
            <button class="btn ghost small" type="submit">Add</button>
          </form>`;
      }).join('');
  }

  if (s === 4) {
    const list = state.celebrations.map(c => `
      <div class="item">
        <div class="text">${esc(c.text)}<small>${esc(areaName(c.areaId))}${c.reward ? ' · Reward: ' + esc(c.reward) : ''}</small></div>
        <button class="btn ghost small" data-action="del-celebration" data-id="${c.id}">Remove</button>
      </div>`).join('');
    body = `
      <p class="hint">What do you want to celebrate in December 2027? Add as many as you like.</p>
      <form class="stack" data-form="add-celebration">
        <input type="text" name="text" placeholder="What you want to celebrate" maxlength="120" required>
        <div class="row">
          <select name="areaId" aria-label="Life area">${areaOptions()}</select>
          <input type="text" name="reward" placeholder="Reward idea (optional)" maxlength="80">
        </div>
        <button class="btn small" type="submit" style="justify-self:start">Add celebration</button>
      </form>
      ${list || '<p class="empty">Nothing yet.</p>'}`;
  }

  if (s === 5) {
    body = `
      <div class="summary">
        <div><b>${activeAreas().length}</b><span>areas</span></div>
        <div><b>${state.habits.length}</b><span>habits</span></div>
        <div><b>${Object.values(state.quarters).flat().length}</b><span>quarter goals</span></div>
      </div>
      <p class="hint">You can change any of this later. Nothing in 2027 is locked.</p>
      ${state.started
        ? '<p class="hint">2027 has started. Use the Months tab to set monthly goals.</p>'
        : '<button class="btn" data-action="start">Start 2027</button>'}
      <div class="card" style="margin-top:16px">
        <h2>Backup</h2>
        <p class="hint">Your data lives on this phone. Export a backup now and then, and before you clear browser data.</p>
        <div class="row">
          <button class="btn ghost small" data-action="export">Export backup</button>
          <label class="btn ghost small file">Import backup
            <input type="file" accept="application/json" class="sr" data-change="import">
          </label>
        </div>
      </div>`;
  }

  return `
    <div class="card">
      <h2>Step ${s} of 5: ${titles[s - 1]}</h2>
      ${body}
    </div>
    <div class="nav">
      ${s > 1 ? `<button class="btn ghost" data-action="step" data-step="${s - 1}">Back</button>` : '<span></span>'}
      ${s < 5 ? `<button class="btn" data-action="step" data-step="${s + 1}">Next</button>` : '<span></span>'}
    </div>`;
}

/* =========================================================
   TODAY TAB
   ========================================================= */
function taskRow(t) {
  const link = t.stepId ? findStep(t.stepId) : null;
  const linkText = link ? ` · Linked: ${link.g.title}, Week ${link.g.steps.indexOf(link.s) + 1}` : '';
  return `
    <div class="item">
      <label class="check" style="flex:1;border:0;padding:0">
        <input type="checkbox" data-change="task" data-id="${t.id}" ${t.done ? 'checked' : ''}>
        <span class="text ${t.done ? 'struck' : ''}">${esc(t.text)}
          <small>${esc(areaName(t.areaId))}${esc(linkText)}${t.gcalId ? ' · in Google Calendar' : ''}</small>
        </span>
      </label>
      <button class="btn ghost small" data-action="del-task" data-id="${t.id}">Delete</button>
    </div>`;
}

function renderToday() {
  const day = ui.day;
  const m = monthOf(day);
  const isPlanningYear = yearOf(day) !== 2027;
  const mood = state.moods[day] || {};
  const log = state.habitLog[day] || [];
  const habits = state.habits.filter(h => state.areas.some(a => a.id === h.areaId && a.active));
  const steps = isPlanningYear ? [] : openStepsForMonth(m);
  const dayTasks = tasksOn(day);
  const bills = state.bills.filter(b => b.dueDay === parseISO(day).getDate());
  const s = state.settings;

  const gcal = state.gcal.connected
    ? `<button class="btn small" data-action="push-day">Add today's tasks to Google Calendar</button>
       <button class="btn ghost small" data-action="disconnect-gcal">Disconnect</button>`
    : `<button class="btn ghost small" data-action="connect-gcal">Connect Google Calendar</button>`;

  return `
    <div class="daybar">
      <button class="btn ghost small" data-action="day" data-n="-1" aria-label="Previous day">‹ Prev</button>
      <input type="date" data-change="day-pick" value="${day}" aria-label="Day">
      <button class="btn ghost small" data-action="day" data-n="1" aria-label="Next day">Next ›</button>
    </div>
    <p class="hint">${fmtDate(day)} · ${parseISO(day).toLocaleDateString(undefined, { weekday: 'long' })}</p>

    ${banners()}
    ${bills.length ? `<div class="banner">Bills due today: ${bills.map(b => `${esc(b.name)} (${fmt(b.amount)})`).join(', ')}</div>` : ''}

    <div class="card">
      <h2>How are you today?</h2>
      <div class="moods">
        ${MOODS.map((label, i) => `
          <button class="mood ${mood.score === i + 1 ? 'on' : ''}" data-action="mood" data-score="${i + 1}" aria-pressed="${mood.score === i + 1}">${label}</button>`).join('')}
      </div>
      <input type="text" data-change="mood-note" value="${esc(mood.note)}" placeholder="A note about today (optional)" maxlength="200" style="margin-top:10px">
    </div>

    <div class="card">
      <h2>Habits</h2>
      ${habits.length
        ? habits.map(h => `
          <label class="check">
            <input type="checkbox" data-change="habit" data-id="${h.id}" ${log.includes(h.id) ? 'checked' : ''}>
            <span class="text">${esc(h.text)}<small>${esc(areaName(h.areaId))}</small></span>
          </label>`).join('')
        : '<p class="empty">No habits yet. Add them on the Plan tab.</p>'}
    </div>

    <div class="card">
      <h2>Tasks</h2>
      ${dayTasks.length ? dayTasks.map(taskRow).join('') : '<p class="empty">Nothing for this day yet.</p>'}
      <form class="stack" data-form="add-task">
        <div class="row">
          <select name="areaId" aria-label="Life area">${areaOptions()}</select>
          <input type="text" name="text" placeholder="e.g. Wash pillowcases and towels" maxlength="140" required>
        </div>
        ${steps.length ? `
          <select name="stepId" aria-label="Link to a weekly step">
            <option value="">Not linked to a goal step</option>
            ${steps.map(x => `<option value="${x.id}">${esc(x.label)}</option>`).join('')}
          </select>` : ''}
        <button class="btn small" type="submit" style="justify-self:start">Add task</button>
      </form>
      <div class="row" style="margin-top:14px">${gcal}</div>
    </div>

    ${reminderCard(s)}`;
}

function reminderCard(s) {
  return `
    <div class="card">
      <h2>Reminders</h2>
      <label class="check"><input type="checkbox" data-change="remind-on" ${s.remindersOn ? 'checked' : ''}> Daily summary notification</label>
      <label class="check"><input type="checkbox" data-change="journal-remind" ${s.journalReminder ? 'checked' : ''}> Sunday journal reminder</label>
      <div class="row"><label class="inline">Daily time <input type="time" data-change="remind-time" value="${s.remindTime}"></label></div>
      <p class="hint">Notifications are best-effort. They appear only when the planner gets a chance to run. For a reliable daily reminder, also set a phone alarm for the same time.</p>
      <button class="btn ghost small" data-action="notify-perm">Allow notifications</button>
    </div>`;
}

/* =========================================================
   MONTHS TAB
   ========================================================= */
function goalCard(g) {
  const done = g.steps.filter(s => s.done).length;
  const pct = done / 4 * 100;
  const parent = quarterGoalById(g.parentId);
  const label = { open: 'Open', done: 'Done', missed: 'Missed', carried: 'Carried (50%)' }[g.status];
  const cls = { done: 's-done', missed: 's-missed', carried: 's-carried' }[g.status] || '';

  return `
    <div class="card">
      <div class="between">
        <span class="tag">${esc(areaName(g.areaId))}</span>
        <span class="pill ${cls}">${label}</span>
      </div>
      <h2 style="margin-top:8px">${esc(g.title)}</h2>
      ${parent ? `<p class="hint">Part of: ${esc(parent.title)}</p>` : ''}
      <div class="bar" aria-label="${done} of 4 weeks ticked"><span style="width:${pct}%"></span></div>
      <p class="hint" style="margin-top:6px">${done} of 4 weeks ticked</p>
      ${g.steps.map((s, i) => `
        <div class="step-row">
          <input type="checkbox" data-change="step-done" data-id="${s.id}" ${s.done ? 'checked' : ''} aria-label="Week ${i + 1} done">
          <span class="wk">Week ${i + 1}</span>
          <input type="text" data-change="step-text" data-id="${s.id}" value="${esc(s.text)}" placeholder="What will you do this week?" maxlength="120">
        </div>`).join('')}
      <div class="actions">
        ${g.status === 'open' ? `
          <button class="btn small" data-action="goal-status" data-id="${g.id}" data-status="done">Mark done</button>
          <button class="btn small ghost" data-action="goal-status" data-id="${g.id}" data-status="missed">Missed</button>
          <button class="btn small ghost" data-action="carry" data-id="${g.id}" ${g.month === 11 ? 'disabled title="December has no next month"' : ''}>Carry over (50%)</button>
          <button class="btn small ghost" data-action="del-goal" data-id="${g.id}">Delete</button>
        ` : `
          <button class="btn small ghost" data-action="undo" data-id="${g.id}">Reopen goal</button>
        `}
      </div>
    </div>`;
}

function carriedHtml(list) {
  return `
    <p class="sub">Carried over from last month. Still to finish. It doesn't take one of this month's four spots.</p>
    ${list.map(g => `
      <div class="item">
        <div class="text">${esc(g.title)}<small>${esc(areaName(g.areaId))} · from ${MONTHS[g.month - 1]}</small></div>
        ${g.status === 'open'
          ? `<button class="btn small" data-action="goal-status" data-id="${g.id}" data-status="done">Mark done</button>`
          : '<span class="pill s-done">Done</span>'}
      </div>`).join('')}`;
}

function milestonesHtml(m) {
  let out = '';
  if (state.monthClosed[m] && !state.celebrated['m' + m]) {
    out += `<div class="banner celebrate"><span>${MONTHS[m]} is closed with ${stats(m).wins} of 4 wins.</span>
      <button class="btn small" data-action="celebrate" data-key="m${m}">Celebrate</button></div>`;
  }
  const q = quarterOfMonth(m);
  const months = [q * 3, q * 3 + 1, q * 3 + 2];
  if (months.every(i => state.monthClosed[i]) && !state.celebrated['q' + q]) {
    const total = months.reduce((s, i) => s + stats(i).wins, 0);
    out += `<div class="banner celebrate"><span>Q${q + 1} is complete with ${total} of 12 wins.</span>
      <button class="btn small" data-action="celebrate" data-key="q${q}">Celebrate</button></div>`;
  }
  return out;
}

function renderMonths() {
  const m = ui.month;
  const st = stats(m);
  const rw = state.rewards[m] || {};
  const closed = !!state.monthClosed[m];
  const q = quarterOfMonth(m);
  const qGoals = state.quarters[q] || [];
  const own = ownGoals(m);
  const carried = carriedIn(m);
  const lossTotal = st.losses;
  const tierName = { full: 'Full reward', partial: 'Partial reward', none: 'No reward yet' }[st.tier];
  const tierDetail = st.tier === 'none'
    ? 'Three wins earn a partial reward. Four earn the full one.'
    : (rw[st.tier] ? esc(rw[st.tier]) : 'Add the reward below.');

  const addForm = own.length < 4 ? `
    <form class="card" data-form="add-goal">
      <h2>Add a goal for ${MONTHS[m]}</h2>
      <p class="hint">${4 - own.length} of 4 spots left. Each goal has four weekly steps.</p>
      <div class="stack">
        <div class="row">
          <select name="areaId" aria-label="Life area">${areaOptions()}</select>
          ${qGoals.length ? `
            <select name="parentId" aria-label="Quarterly goal">
              <option value="">No quarterly goal</option>
              ${qGoals.map(g => `<option value="${g.id}">${esc(g.title)}</option>`).join('')}
            </select>` : ''}
        </div>
        <div class="row">
          <input type="text" name="title" placeholder="e.g. Read four books" maxlength="120" required>
          <button class="btn" type="submit">Add goal</button>
        </div>
      </div>
    </form>` : `<p class="hint">Four goals set for ${MONTHS[m]}.</p>`;

  const december = m === 11 ? `
    <div class="card">
      <h2>Your December 2027 celebrations</h2>
      ${state.celebrations.length
        ? state.celebrations.map(c => `
          <label class="check">
            <input type="checkbox" data-change="celebrate-done" data-id="${c.id}" ${c.done ? 'checked' : ''}>
            <span class="text ${c.done ? 'struck' : ''}">${esc(c.text)}<small>${esc(areaName(c.areaId))}${c.reward ? ' · ' + esc(c.reward) : ''}</small></span>
          </label>`).join('')
        : '<p class="empty">Nothing planned yet. Add celebrations on the Plan tab.</p>'}
    </div>` : '';

  return `
    <div class="row" style="margin:0 0 12px">${monthSelect()}<span class="tag">Q${q + 1}</span></div>

    <div class="card">
      <div class="summary">
        <div><b>${st.wins}/4</b><span>wins</span></div>
        <div><b>${lossTotal}</b><span>loss points</span></div>
        <div><b>${closed ? 'Closed' : 'Open'}</b><span>${closed ? 'month' : 'in progress'}</span></div>
      </div>
      <p class="reward"><strong>${tierName}</strong> · ${tierDetail}</p>
      <div class="reward-grid">
        <label>All four goals done
          <input type="text" data-change="reward" data-tier="full" value="${esc(rw.full)}" placeholder="e.g. A cake" maxlength="80">
        </label>
        <label>Three goals done
          <input type="text" data-change="reward" data-tier="partial" value="${esc(rw.partial)}" placeholder="e.g. Dinner out" maxlength="80">
        </label>
      </div>
      <div class="actions">
        ${closed
          ? '<button class="btn ghost small" data-action="reopen-month">Reopen month</button>'
          : `<button class="btn small" data-action="close-month">Close ${MONTHS[m]}</button>`}
        ${closed && st.tier !== 'none'
          ? (state.claimed[m]
              ? '<span class="pill s-done">Reward claimed</span>'
              : '<button class="btn small" data-action="claim">Mark reward claimed</button>')
          : ''}
      </div>
    </div>

    ${milestonesHtml(m)}
    ${own.map(goalCard).join('') || `<p class="empty">No goals for ${MONTHS[m]} yet.</p>`}
    ${carried.length ? carriedHtml(carried) : ''}
    ${addForm}
    ${december}`;
}

/* =========================================================
   JOURNAL TAB
   ========================================================= */
function renderJournal() {
  const day = ui.journalDay;
  const wk = weekKey(day);
  const j = state.journals[wk] || {};
  const days = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(wk, i));
  const doneTasks = days.flatMap(d => tasksOn(d).filter(t => t.done).map(t => t.text));
  const scores = days.map(d => state.moods[d] && state.moods[d].score).filter(Boolean);
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '–';
  const past = Object.keys(state.journals).sort().reverse();

  return `
    <div class="card">
      <h2>Week of ${fmtDate(wk)}</h2>
      <label class="inline">Pick any day in the week <input type="date" data-change="journal-day" value="${day}"></label>
      <div class="summary" style="margin-top:12px">
        <div><b>${doneTasks.length}</b><span>tasks done</span></div>
        <div><b>${avg}</b><span>mood average</span></div>
        <div><b>${scores.length}</b><span>days logged</span></div>
      </div>
      ${doneTasks.length ? `<p class="sub">Done this week</p><ul class="plain">${doneTasks.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <form class="stack" data-form="journal" data-week="${wk}">
        <label>What happened this week<textarea name="recap" rows="4">${esc(j.recap)}</textarea></label>
        <label>Wins<textarea name="wins" rows="3" placeholder="Big or small">${esc(j.wins)}</textarea></label>
        <label>What I want to change next week<textarea name="reflection" rows="3">${esc(j.reflection)}</textarea></label>
        <button class="btn" type="submit" style="justify-self:start">Save journal</button>
      </form>
    </div>

    <p class="sub">Past entries</p>
    ${past.length
      ? past.map(k => {
          const recap = state.journals[k].recap || '';
          return `
            <div class="card">
              <h2>Week of ${fmtDate(k)}</h2>
              <p>${esc(recap.slice(0, 160))}${recap.length > 160 ? '…' : ''}</p>
              <button class="btn ghost small" data-action="open-journal" data-week="${k}">Open</button>
            </div>`;
        }).join('')
      : '<p class="empty">No journal entries yet.</p>'}`;
}

/* =========================================================
   MONEY TAB
   ========================================================= */
function renderMoney() {
  const m = ui.month;
  const prefix = `2027-${pad(m + 1)}`;
  const f = state.finance[m] || {};
  const exp = state.expenses.filter(e => e.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date));
  const spent = exp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const budget = Number(f.budget) || 0;
  const left = budget - spent;
  const billsTotal = state.bills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const defaultDate = todayISO().startsWith(prefix) ? todayISO() : `${prefix}-01`;

  return `
    <div class="row" style="margin:0 0 12px">${monthSelect()}</div>

    <div class="card">
      <h2>${MONTHS[m]} budget</h2>
      <div class="summary">
        <div><b>${fmt(budget)}</b><span>budget</span></div>
        <div><b>${fmt(spent)}</b><span>spent</span></div>
        <div><b class="${left < 0 ? 'neg' : ''}">${fmt(left)}</b><span>left</span></div>
      </div>
      <form class="stack" data-form="finance">
        <label>Monthly budget<input type="text" inputmode="decimal" name="budget" value="${esc(f.budget)}"></label>
        <label>Savings target for the month<input type="text" inputmode="decimal" name="target" value="${esc(f.target)}"></label>
        <button class="btn small" type="submit" style="justify-self:start">Save</button>
      </form>
    </div>

    <div class="card">
      <h2>Expenses</h2>
      ${exp.length
        ? exp.map(e => `
          <div class="item">
            <div class="text">${esc(e.category || 'Spending')} · ${fmt(e.amount)}<small>${fmtDate(e.date)}${e.note ? ' · ' + esc(e.note) : ''}</small></div>
            <button class="btn ghost small" data-action="del-expense" data-id="${e.id}">Delete</button>
          </div>`).join('')
        : '<p class="empty">No expenses logged this month.</p>'}
      <form class="stack" data-form="expense">
        <div class="row">
          <input type="date" name="date" value="${defaultDate}" aria-label="Date">
          <input type="text" inputmode="decimal" name="amount" placeholder="Amount" required>
        </div>
        <div class="row">
          <input type="text" name="category" placeholder="Category, e.g. Groceries" maxlength="40">
          <input type="text" name="note" placeholder="Note (optional)" maxlength="100">
        </div>
        <button class="btn small" type="submit" style="justify-self:start">Add expense</button>
      </form>
    </div>

    <div class="card">
      <h2>Monthly bills</h2>
      <p class="hint">Bills repeat every month and show on the Today tab on their due day. Total of all bills: ${fmt(billsTotal)}.</p>
      ${state.bills.length
        ? [...state.bills].sort((a, b) => a.dueDay - b.dueDay).map(b => `
          <div class="item">
            <div class="text">${esc(b.name)} · ${fmt(b.amount)}<small>Due on day ${b.dueDay}</small></div>
            <button class="btn ghost small" data-action="del-bill" data-id="${b.id}">Delete</button>
          </div>`).join('')
        : '<p class="empty">No bills yet.</p>'}
      <form class="stack" data-form="bill">
        <div class="row">
          <input type="text" name="name" placeholder="Bill, e.g. Phone data" maxlength="60" required>
          <input type="text" inputmode="decimal" name="amount" placeholder="Amount">
        </div>
        <div class="row">
          <input type="text" inputmode="numeric" name="dueDay" placeholder="Due day (1 to 31)">
          <button class="btn small" type="submit">Add bill</button>
        </div>
      </form>
    </div>`;
}

/* =========================================================
   RENDER
   ========================================================= */
function render() {
  document.querySelectorAll('.tab').forEach(t => {
    t.setAttribute('aria-selected', String(t.dataset.tab === ui.tab));
  });
  const views = { plan: renderPlan, today: renderToday, months: renderMonths, journal: renderJournal, money: renderMoney };
  document.getElementById('app').innerHTML = views[ui.tab]();
}

/* =========================================================
   GOOGLE CALENDAR
   Needs a Google OAuth client ID (see README). Tasks are added as all-day events.
   ========================================================= */
let accessToken = null;

function connectGoogle(then) {
  if (CONFIG.googleClientId.startsWith('YOUR_')) {
    toast('Add your Google client ID in app.js first. See the README.');
    return;
  }
  if (!window.google || !google.accounts || !google.accounts.oauth2) {
    toast('Google sign-in is still loading. Try again in a moment.');
    return;
  }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.googleClientId,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    callback: resp => {
      if (resp.error) { toast('Google sign-in was cancelled.'); return; }
      accessToken = resp.access_token;
      state.gcal.connected = true;
      saveState();
      render();
      toast('Connected to Google Calendar.');
      if (then) then();
    }
  });
  client.requestAccessToken({ prompt: '' });
}

async function pushDay(day) {
  if (!accessToken) { connectGoogle(() => pushDay(day)); return; }
  const pending = tasksOn(day).filter(t => !t.gcalId);
  if (!pending.length) { toast('Nothing new to add for this day.'); return; }

  let sent = 0;
  for (const t of pending) {
    try {
      const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: `${areaName(t.areaId)}: ${t.text}`,
          start: { date: day },
          end: { date: addDays(day, 1) }
        })
      });
      if (r.status === 401) {
        accessToken = null;
        state.gcal.connected = false;
        toast('The Google session ended. Connect again.');
        break;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const ev = await r.json();
      t.gcalId = ev.id;
      sent++;
    } catch (err) {
      toast('Could not add one event. Check your connection and try again.');
      break;
    }
  }
  saveState();
  render();
  if (sent) toast(`Added ${sent} event${sent > 1 ? 's' : ''} to Google Calendar.`);
}

/* =========================================================
   REMINDERS AND NOTIFICATIONS
   ========================================================= */
function requestNotifications() {
  if (!('Notification' in window)) {
    toast('Notifications are not supported in this browser.');
    return;
  }
  Notification.requestPermission().then(p => {
    toast(p === 'granted' ? 'Notifications are on.' : 'Notifications are off. Allow them in your browser settings.');
  });
}

function notify(title, body) {
  const opts = { body, tag: title, icon: 'icon.svg', badge: 'icon.svg' };
  if (navigator.serviceWorker) {
    navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opts)).catch(() => {});
  } else if ('Notification' in window) {
    new Notification(title, opts);
  }
}

function checkReminders() {
  const s = state.settings;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const today = todayISO();

  if (s.remindersOn) {
    const [h, mi] = (s.remindTime || '08:00').split(':').map(Number);
    const due = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= mi);
    if (due && s.lastDaily !== today) {
      const habitsLeft = state.habits.filter(h => !(state.habitLog[today] || []).includes(h.id)).length;
      const tasksLeft = tasksOn(today).filter(t => !t.done).length;
      const total = habitsLeft + tasksLeft;
      notify('Today', `${total} thing${total === 1 ? '' : 's'} to do today. Open the planner to tick them off.`);
      s.lastDaily = today;
      saveState();
    }
  }

  if (s.journalReminder && now.getDay() === 0 && now.getHours() >= 18 &&
      s.lastJournal !== today && !state.journals[weekKey(today)]) {
    notify('Weekly journal', 'Write this week\'s recap before the week closes.');
    s.lastJournal = today;
    saveState();
  }
}

/* ---------- Backup ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `life-planner-backup-${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (!Array.isArray(obj.goals) || !Array.isArray(obj.areas)) throw new Error('not a backup');
      state = { ...freshState(), ...obj };
      saveState();
      toast('Backup restored.');
      render();
    } catch (e) {
      toast('That file is not a planner backup.');
    }
  };
  reader.readAsText(file);
}

/* =========================================================
   EVENTS
   ========================================================= */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  const goal = d.id ? state.goals.find(g => g.id === d.id) : null;

  switch (d.action) {
    case 'connect-gcal': connectGoogle(); return;
    case 'push-day': pushDay(ui.day); return;
    case 'notify-perm': requestNotifications(); return;
    case 'export': exportData(); return;

    case 'tab': ui.tab = d.tab; break;
    case 'step': ui.step = Number(d.step); break;
    case 'start':
      state.started = true;
      ui.tab = 'months';
      ui.month = 0;
      toast('2027 is set. Add your January goals.');
      break;
    case 'del-habit': state.habits = state.habits.filter(h => h.id !== d.id); break;
    case 'del-celebration': state.celebrations = state.celebrations.filter(c => c.id !== d.id); break;
    case 'del-qgoal':
      for (const k of Object.keys(state.quarters)) {
        state.quarters[k] = (state.quarters[k] || []).filter(g => g.id !== d.id);
      }
      break;

    case 'day': ui.day = addDays(ui.day, Number(d.n)); break;
    case 'mood': {
      const cur = state.moods[ui.day] || {};
      state.moods[ui.day] = { ...cur, score: Number(d.score) };
      break;
    }
    case 'del-task': state.tasks = state.tasks.filter(t => t.id !== d.id); break;

    case 'goal-status': if (goal) goal.status = d.status; break;
    case 'undo':
      if (goal) {
        goal.status = 'open';
        state.goals = state.goals.filter(x => x.carriedFrom !== goal.id);
      }
      break;
    case 'carry':
      if (!goal) return;
      if (goal.month === 11) { toast('December has no next month. Mark it missed instead.'); return; }
      goal.status = 'carried';
      state.goals.push(makeGoal({ month: goal.month + 1, areaId: goal.areaId, title: goal.title, carriedFrom: goal.id }));
      toast(`Carried over to ${MONTHS[goal.month + 1]}. That counts as a 50% loss here.`);
      break;
    case 'del-goal':
      state.goals = state.goals.filter(g => g.id !== d.id && g.carriedFrom !== d.id);
      break;

    case 'close-month':
      if (!confirm(`Close ${MONTHS[ui.month]}? Any open goals will count as missed.`)) return;
      state.monthClosed[ui.month] = true;
      break;
    case 'reopen-month': state.monthClosed[ui.month] = false; break;
    case 'claim': {
      const m = d.m !== undefined ? Number(d.m) : ui.month;
      state.claimed[m] = true;
      toast('Reward marked claimed. Enjoy it.');
      break;
    }
    case 'celebrate': state.celebrated[d.key] = true; toast('Celebrated. Well done.'); break;

    case 'del-expense': state.expenses = state.expenses.filter(x => x.id !== d.id); break;
    case 'del-bill': state.bills = state.bills.filter(b => b.id !== d.id); break;
    case 'disconnect-gcal':
      state.gcal.connected = false;
      accessToken = null;
      break;
    case 'open-journal': ui.journalDay = d.week; break;
    default: return;
  }
  saveState();
  render();
});

document.addEventListener('change', e => {
  const el = e.target;
  const c = el.dataset.change;
  if (!c) return;

  switch (c) {
    case 'area-on': {
      const a = state.areas.find(x => x.id === el.dataset.id);
      if (a) a.active = el.checked;
      break;
    }
    case 'habit': {
      const day = ui.day;
      const log = state.habitLog[day] || [];
      state.habitLog[day] = el.checked
        ? [...new Set([...log, el.dataset.id])]
        : log.filter(x => x !== el.dataset.id);
      break;
    }
    case 'task': {
      const t = state.tasks.find(x => x.id === el.dataset.id);
      if (t) {
        t.done = el.checked;
        if (t.done && t.stepId) {
          const f = findStep(t.stepId);
          if (f) f.s.done = true;
        }
      }
      break;
    }
    case 'mood-note': {
      const cur = state.moods[ui.day] || {};
      state.moods[ui.day] = { ...cur, note: el.value.trim() };
      break;
    }
    case 'day-pick': if (el.value) ui.day = el.value; break;
    case 'journal-day': if (el.value) ui.journalDay = el.value; break;
    case 'remind-on':
      state.settings.remindersOn = el.checked;
      if (el.checked) requestNotifications();
      break;
    case 'journal-remind': state.settings.journalReminder = el.checked; break;
    case 'remind-time': state.settings.remindTime = el.value || '08:00'; break;

    case 'month': ui.month = Number(el.value); break;
    case 'step-done': {
      const f = findStep(el.dataset.id);
      if (f) f.s.done = el.checked;
      break;
    }
    case 'step-text': {
      const f = findStep(el.dataset.id);
      if (f) f.s.text = el.value.trim();
      break;
    }
    case 'reward': {
      const r = state.rewards[ui.month] || {};
      r[el.dataset.tier] = el.value.trim();
      state.rewards[ui.month] = r;
      break;
    }
    case 'celebrate-done': {
      const item = state.celebrations.find(x => x.id === el.dataset.id);
      if (item) item.done = el.checked;
      break;
    }
    case 'import': importFile(el.files[0]); el.value = ''; return;
    default: return;
  }
  saveState();
  render();
});

document.addEventListener('submit', e => {
  const form = e.target;
  const type = form.dataset.form;
  if (!type) return;
  e.preventDefault();

  const data = Object.fromEntries(new FormData(form));
  const val = k => (data[k] || '').toString().trim();

  switch (type) {
    case 'add-area':
      if (val('name')) state.areas.push({ id: uid(), name: val('name'), active: true });
      break;
    case 'add-habit':
      if (val('text')) state.habits.push({ id: uid(), areaId: data.areaId, text: val('text') });
      break;
    case 'add-qgoal': {
      const q = Number(form.dataset.q);
      if (!val('title')) return;
      state.quarters[q] = [...(state.quarters[q] || []), { id: uid(), areaId: data.areaId, title: val('title') }];
      break;
    }
    case 'add-celebration':
      if (val('text')) state.celebrations.push({ id: uid(), areaId: data.areaId, text: val('text'), reward: val('reward'), done: false });
      break;
    case 'add-goal': {
      if (!val('title')) return;
      if (ownGoals(ui.month).length >= 4) { toast('A month has four goals. Remove one to add another.'); return; }
      state.goals.push(makeGoal({ month: ui.month, areaId: data.areaId, title: val('title'), parentId: data.parentId || null }));
      break;
    }
    case 'add-task':
      if (val('text')) state.tasks.push({
        id: uid(), date: ui.day, areaId: data.areaId, text: val('text'),
        done: false, stepId: data.stepId || null, gcalId: null
      });
      break;
    case 'journal': {
      state.journals[form.dataset.week] = {
        recap: val('recap'), wins: val('wins'), reflection: val('reflection'), saved: todayISO()
      };
      toast('Journal saved.');
      break;
    }
    case 'finance':
      state.finance[ui.month] = { budget: val('budget'), target: val('target') };
      toast('Saved.');
      break;
    case 'expense': {
      if (!val('amount')) return;
      const date = val('date') || `2027-${pad(ui.month + 1)}-01`;
      state.expenses.push({ id: uid(), date, amount: Number(val('amount')) || 0, category: val('category'), note: val('note') });
      break;
    }
    case 'bill': {
      if (!val('name')) return;
      const dueDay = Math.min(31, Math.max(1, Number(val('dueDay')) || 1));
      state.bills.push({ id: uid(), name: val('name'), amount: Number(val('amount')) || 0, dueDay });
      break;
    }
    default: return;
  }
  saveState();
  render();
});

/* ---------- Start ---------- */
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });
setInterval(checkReminders, 60000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

render();
checkReminders();
