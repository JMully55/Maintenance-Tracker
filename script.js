let taskData = []; 
const STORAGE_KEY = 'maintenanceTrackerTasks';

// --- Utility Functions ---

const getToday = () => new Date().setHours(0, 0, 0, 0);

function formatDate(date) {
    const d = new Date(date);
    let m = '' + (d.getMonth() + 1), day = '' + d.getDate(), y = d.getFullYear();
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return [y, m, day].join('-');
}

function formatTimestamp(isoString) {
    const date = new Date(isoString);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function createLocalDate(dateString) {
    const parts = dateString.split('-').map(p => parseInt(p, 10));
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function calculateDueDate(lastCompletedDate, frequencyDays, isOneTime) {
    if (isOneTime && frequencyDays === 0) return null;
    if (!lastCompletedDate) return null;
    const lastDate = createLocalDate(lastCompletedDate);
    const nextDate = new Date(lastDate);
    nextDate.setDate(lastDate.getDate() + parseInt(frequencyDays));
    return nextDate;
}

function getStatus(dueDate) {
    if (!dueDate) return { text: 'N/A', class: '', sortValue: 1000 };
    const diff = Math.ceil((dueDate.setHours(0,0,0,0) - getToday()) / 86400000);
    if (diff < 0) return { text: `OVERDUE (${Math.abs(diff)}d)`, class: 'status-overdue', sortValue: diff };
    if (diff <= 30) return { text: `DUE IN ${diff}d`, class: 'status-due', sortValue: diff };
    return { text: 'Upcoming', class: '', sortValue: diff };
}

// --- Persistence ---
function loadTasks() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        taskData = JSON.parse(stored);
        taskData.forEach(t => {
            if (!t.completionHistory) t.completionHistory = [];
            if (typeof t.isOneTime === 'undefined') t.isOneTime = false;
        });
    }
}
function saveTasks() { localStorage.setItem(STORAGE_KEY, JSON.stringify(taskData)); }


// --- Calendar Logic (FIXED RECURRENCE) ---

function setupCalendarControls() {
    const ms = document.getElementById('month-select'), ys = document.getElementById('year-select');
    const now = new Date();
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    ms.innerHTML = months.map((m, i) => `<option value="${i}" ${i===now.getMonth()?'selected':''}>${m}</option>`).join('');
    for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 5; y++) {
        const op = document.createElement('option'); op.value = y; op.text = y;
        if (y === now.getFullYear()) op.selected = true;
        ys.appendChild(op);
    }
}

function getRecurringDueDates(task, mStart, mEnd) {
    const events = {};
    if (task.isOneTime && task.frequencyDays === 0) return events;
    if (!task.lastCompleted) return events;
    
    const frequency = parseInt(task.frequencyDays);
    if (isNaN(frequency) || frequency <= 0) return events;

    let currentDate = calculateDueDate(task.lastCompleted, frequency, task.isOneTime);
    
    if (!currentDate) return events;
    currentDate.setHours(0, 0, 0, 0); 
    
    // Safety check to start the loop at an appropriate date
    if (currentDate.getTime() < mStart.getTime() && !task.isOneTime) {
        // Calculate the next recurrence date that is >= mStart
        const daysDiff = Math.ceil((mStart.getTime() - currentDate.getTime()) / 86400000);
        const cyclesToSkip = Math.ceil(daysDiff / frequency);
        currentDate.setDate(currentDate.getDate() + cyclesToSkip * frequency);
    }
    
    // Loop through all recurring dates within the view
    while (currentDate.getTime() <= mEnd.getTime()) {
        
        if (currentDate.getTime() >= mStart.getTime()) {
            const dateString = formatDate(currentDate);
            events[dateString] = { 
                name: task.taskName + (task.isOneTime ? ' (1-Time)':''), 
                overdue: currentDate.getTime() < getToday() 
            };
        }

        // Stop recurrence if it's a one-time event
        if (task.isOneTime) break;
        
        currentDate.setDate(currentDate.getDate() + frequency);
    }
    return events;
}


window.renderCalendar = function() {
    const view = document.getElementById('calendar-view');
    view.innerHTML = '';
    const m = parseInt(document.getElementById('month-select').value);
    const y = parseInt(document.getElementById('year-select').value);
    const start = new Date(y, m, 1);
    
    // Calculate calendar grid start (Sunday of the first week)
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0); 

    const end = new Date(start); end.setDate(end.getDate() + 42);
    end.setHours(0, 0, 0, 0); 

    const allEvents = {};
    taskData.forEach(t => {
        const evs = getRecurringDueDates(t, start, end);
        for (let d in evs) { if (!allEvents[d]) allEvents[d] = []; allEvents[d].push(evs[d]); }
    });

    // Render Headers
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
        const h = document.createElement('div'); h.className='calendar-header'; h.innerText=d; view.appendChild(h);
    });

    let curr = new Date(start);
    for (let i=0; i<42; i++) {
        const ds = formatDate(curr);
        const dDiv = document.createElement('div'); 
        dDiv.className='calendar-day' + (curr.getMonth()!==m?' empty-day':'');
        dDiv.innerHTML = `<strong>${curr.getDate()}</strong>`;
        
        // Add events
        if (allEvents[ds]) {
            allEvents[ds].forEach(e => {
                const eDiv = document.createElement('div'); eDiv.className='task-event' + (e.overdue?' overdue':'');
                eDiv.innerText = e.name; dDiv.appendChild(eDiv);
            });
        }
        view.appendChild(dDiv);
        curr.setDate(curr.getDate()+1);
    }
};

// --- Modal Functions (omitted for brevity, assume correct) ---
window.openHistoryModal = () => { document.getElementById('history-modal').style.display='block'; renderHistoryModal(); };
window.closeHistoryModal = () => { document.getElementById('history-modal').style.display='none'; };
window.openCompletedModal = () => { document.getElementById('completed-modal').style.display='block'; renderCompletedModal(); };
window.closeCompletedModal = () => { document.getElementById('completed-modal').style.display='none'; };
window.onclick = (event) => { /* ... */ };


// --- Rendering and Sorting ---
function renderHistoryModal() {
    const list = document.getElementById('history-list'); list.innerHTML = '';
    taskData.forEach((t, i) => {
        if (t.isOneTime && t.frequencyDays === 0) return;
        const row = document.createElement('tr');
        row.innerHTML = `<td>${t.lastCompleted}</td><td>${t.taskName}</td><td>${t.category}</td><td>${t.frequencyDays}d</td><td>${t.description}</td><td><button class="delete-button-history" onclick="deleteTask(${i})">Delete</button></td>`;
        list.appendChild(row);
    });
}
function renderCompletedModal() {
    const list = document.getElementById('completed-list'); list.innerHTML = '';
    const q = document.getElementById('completed-search').value.toLowerCase();
    let history = [];
    taskData.forEach(t => t.completionHistory.forEach(h => {
        if (t.taskName.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)) history.push({ name: t.taskName, cat: t.category, time: h.timestamp });
    }));
    history.sort((a,b) => new Date(b.time) - new Date(a.time)).forEach(h => {
        list.innerHTML += `<tr><td>${formatTimestamp(h.time)}</td><td>${h.name}</td><td>${h.cat}</td></tr>`;
    });
}

function renderNotepads() {
    const dl = document.getElementById('daily-tasks-list'), wl = document.getElementById('weekly-tasks-list');
    dl.innerHTML = ''; wl.innerHTML = '';
    const now = new Date(); document.querySelector('.daily-focus h3').textContent = `Today's Tasks (${formatDate(now)})`;
    const todayS = formatDate(now), start = new Date(now), end = new Date(start); 
    start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0); 
    end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);

    taskData.forEach((t, i) => {
        const due = calculateDueDate(t.lastCompleted, t.frequencyDays, t.isOneTime);
        if (!due || (t.isOneTime && t.frequencyDays === 0)) return;
        const ds = formatDate(due);
        const item = `<li><span class="notepad-checkbox" onclick="markDone(${i})">${t.lastCompleted===todayS?'✔️':'◻️'}</span>${t.taskName}</li>`;
        if (ds === todayS) dl.innerHTML += item;
        if (due >= start && due <= end) wl.innerHTML += item;
    });
}

function renderDashboard() {
    const list = document.getElementById('coming-up-list'); list.innerHTML = '';
    taskData.forEach((t, i) => {
        const due = calculateDueDate(t.lastCompleted, t.frequencyDays, t.isOneTime);
        if (t.isOneTime && t.frequencyDays === 0) return;
        const status = getStatus(due);
        if (status.sortValue <= 30) {
            const row = document.createElement('tr'); row.className = status.class;
            row.innerHTML = `<td>${formatDate(due)}</td><td>${t.taskName}</td><td>${t.category}</td><td>${status.text}</td>
            <td><button onclick="markDone(${i})">Done</button> ${t.isOneTime?'':`<button class="skip-button" onclick="skipTask(${i})">Skip</button>`} <button class="delete-button" onclick="deleteTask(${i})">Delete</button></td>`;
            list.appendChild(row);
        }
    });
    renderCalendar(); renderNotepads(); saveTasks();
}

// --- Actions ---
window.markDone = (idx) => {
    const t = taskData[idx];
    const now = new Date();
    t.completionHistory.push({ timestamp: now.toISOString() });
    t.lastCompleted = formatDate(now);
    if (t.isOneTime) t.frequencyDays = 0;
    renderDashboard();
};

window.skipTask = (idx) => {
    const t = taskData[idx];
    const due = calculateDueDate(t.lastCompleted, t.frequencyDays, false);
    t.lastCompleted = formatDate(due);
    renderDashboard();
};

window.deleteTask = (idx) => {
    if (confirm("Permanently delete this task?")) { taskData.splice(idx, 1); renderDashboard(); }
};

window.sortTable = (key, modal=false) => {
    taskData.sort((a,b) => (a[key] > b[key] ? 1 : -1));
    modal ? renderHistoryModal() : renderDashboard();
};

window.toggleCustomFrequency = () => {
    document.getElementById('customFrequencyDiv').style.display = document.getElementById('frequencySelect').value === 'custom' ? 'block' : 'none';
};


// --- Form Handling ---
function registerFormListener() {
    document.getElementById('task-form').onsubmit = (e) => {
        e.preventDefault();
        const fv = document.getElementById('frequencySelect').value;
        const oneTime = fv === 'single';
        let freq = oneTime ? 1 : (fv === 'custom' ? parseInt(document.getElementById('customDays').value) : parseInt(fv));
        let last = document.getElementById('lastCompleted').value;
        const target = document.getElementById('targetDueDate').value;

        if (isNaN(freq) || freq <= 0) {
            alert("Please enter a valid positive number for Frequency or select a standard interval.");
            return;
        }
        if (oneTime && !target) {
            alert("Please specify a Target Next Due Date for a single event.");
            return;
        }

        if (oneTime) {
            const d = createLocalDate(target); d.setDate(d.getDate()-1); last = formatDate(d);
        } else if (!last) {
            const d = target ? createLocalDate(target) : new Date();
            if (target) d.setDate(d.getDate()-freq); else d.setDate(d.getDate()+7-freq);
            last = formatDate(d);
        }

        taskData.push({
            taskName: document.getElementById('taskName').value,
            category: document.getElementById('category').value,
            description: document.getElementById('description').value,
            frequencyDays: freq, lastCompleted: last, isOneTime: oneTime, completionHistory: []
        });
        renderDashboard(); e.target.reset(); toggleCustomFrequency();
    };
}
