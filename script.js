let taskData = []; 
const STORAGE_KEY = 'maintenanceTrackerTasks';

// --- Initialization ---
function initTracker() {
    loadTasks();
    taskData.forEach((t, i) => t.id = i);
    setupCalendarControls();
    registerFormListener();
    toggleCustomFrequency(); 
    sortTable('dueDate');
}

// --- Utility & Date Helpers ---
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

function calculateDueDate(lastComp, freqDays, isOneTime) {
    if (isOneTime && freqDays === 0) return null;
    if (!lastComp) return null;
    const lastDate = createLocalDate(lastComp);
    const nextDate = new Date(lastDate);
    const frequency = parseInt(freqDays);
    if (isNaN(frequency)) return null;

    nextDate.setDate(lastDate.getDate() + frequency);
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

// --- Calendar Logic (omitted for brevity) ---
function setupCalendarControls() { /* ... */ }
function getRecurringDueDates(task, mStart, mEnd) { /* ... */ }
window.renderCalendar = function() { /* ... */ };

// --- Modal Functions (omitted for brevity) ---
window.openHistoryModal = () => { document.getElementById('history-modal').style.display='block'; renderHistoryModal(); };
window.closeHistoryModal = () => { document.getElementById('history-modal').style.display='none'; };
window.openCompletedModal = () => { document.getElementById('completed-modal').style.display='block'; document.getElementById('completed-search').value = ''; renderCompletedModal(); };
window.closeCompletedModal = () => { document.getElementById('completed-modal').style.display='none'; };
window.onclick = (event) => { const modalH = document.getElementById('history-modal'), modalC = document.getElementById('completed-modal'); if (event.target === modalH) closeHistoryModal(); if (event.target === modalC) closeCompletedModal(); };

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

// --- Dashboard ---
function renderNotepads() {
    const dl = document.getElementById('daily-tasks-list'), wl = document.getElementById('weekly-tasks-list');
    dl.innerHTML = ''; wl.innerHTML = '';
    const now = new Date(); document.querySelector('.daily-focus h3').textContent = `Today's Tasks (${formatDate(now)})`;
    const todayS = formatDate(now), start = new Date(now), end = new Date(start); 
    start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0); 
    end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);

    let dailyTasksCount = 0;
    let dailyTasksCompletedCount = 0;
    let weeklyTasksCount = 0;
    let weeklyTasksCompletedCount = 0;


    taskData.forEach((t, i) => {
        const due = calculateDueDate(t.lastCompleted, t.frequencyDays, t.isOneTime);
        if (!due || (t.isOneTime && t.frequencyDays === 0)) return;
        const ds = formatDate(due);
        
        const isCompletedToday = t.lastCompleted === todayS;
        
        const item = `<li><span class="notepad-checkbox" onclick="${isCompletedToday ? `markUndone(${i})` : `markDone(${i})`}">${isCompletedToday?'✔️':'◻️'}</span>${t.taskName}</li>`;
        
        if (ds === todayS) {
            dailyTasksCount++;
            if (isCompletedToday) dailyTasksCompletedCount++;
            dl.innerHTML += item;
        }
        
        if (due >= start && due <= end) {
            weeklyTasksCount++;
            if (isCompletedToday) weeklyTasksCompletedCount++;
            wl.innerHTML += item;
        }
    });

    // 🏆 NEW MESSAGE LOGIC 🏆
    if (dailyTasksCount === 0) {
        dl.innerHTML = '<li>🎉 Nothing scheduled for today!</li>';
    } else if (dailyTasksCount > 0 && dailyTasksCount === dailyTasksCompletedCount) {
        dl.innerHTML = '<li>✅ Daily Goal Reached! Everything completed.</li>';
    } else if (dailyTasksCount > 0 && dailyTasksCompletedCount > 0) {
        // Display partially completed tasks list
    }

    if (weeklyTasksCount === 0) {
        wl.innerHTML = '<li>😌 Nothing scheduled for this week!</li>';
    } else if (weeklyTasksCount > 0 && weeklyTasksCount === weeklyTasksCompletedCount) {
        wl.innerHTML = '<li>🏆 Weekly Goal Reached! All current tasks complete.</li>';
    }
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
    const todayFormatted = formatDate(now);

    if (t.lastCompleted === todayFormatted) return; 
    
    t.completionHistory.push({ timestamp: now.toISOString(), dateOnly: todayFormatted });
    t.lastCompleted = todayFormatted;

    if (t.isOneTime) t.frequencyDays = 0;
    
    renderDashboard();
};

window.markUndone = (idx) => {
    const t = taskData[idx];
    const todayFormatted = formatDate(new Date());

    // 1. Remove today's completion entry
    const historyIndex = t.completionHistory.findIndex(h => h.dateOnly === todayFormatted);
    if (historyIndex > -1) {
        t.completionHistory.splice(historyIndex, 1);
    }
    
    // 2. Revert lastCompleted to the previous date in the history
    if (t.completionHistory.length > 0) {
        const previousCompletion = t.completionHistory[t.completionHistory.length - 1];
        t.lastCompleted = previousCompletion.dateOnly;
    } else {
        t.lastCompleted = '';
    }

    // 3. Revert one-time status 
    if (t.isOneTime && t.frequencyDays === 0) {
        t.frequencyDays = 1; 
    }

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

window.toggleFormVisibility = function() {
    const formContainer = document.getElementById('task-form-container');
    const button = document.querySelector('#add-task-toggle button');
    
    if (formContainer.style.display === 'none' || formContainer.style.display === '') {
        formContainer.style.display = 'block';
        button.textContent = '— Hide Task Input';
    } else {
        formContainer.style.display = 'none';
        button.textContent = '+ Add New Task / Event';
    }
}


// --- Form Handling ---
function registerFormListener() {
    document.getElementById('task-form').onsubmit = (e) => {
        e.preventDefault();
        const fv = document.getElementById('frequencySelect').value;
        const oneTime = fv === 'single';
        let freq = oneTime ? 1 : (fv === 'custom' ? parseInt(document.getElementById('customDays').value) : parseInt(fv));
        const inputDate = document.getElementById('dateInput').value; // Combined input

        let lastCompletedDate = '';

        if (isNaN(freq) || freq <= 0) {
            alert("Please enter a valid positive number for Frequency or select a standard interval.");
            return;
        }
        if (!inputDate) {
            alert("Please enter a Date.");
            return;
        }

        const targetDate = createLocalDate(inputDate);
        const initialLastCompleted = new Date(targetDate);
            
        initialLastCompleted.setDate(targetDate.getDate() - freq);
        lastCompletedDate = formatDate(initialLastCompleted);
        
        // Prepare initial history
        const initialHistory = [];
        if (lastCompletedDate) {
             initialHistory.push({
                timestamp: new Date(lastCompletedDate).toISOString(),
                dateOnly: lastCompletedDate
            });
        }

        taskData.push({
            taskName: document.getElementById('taskName').value,
            category: document.getElementById('category').value,
            description: document.getElementById('description').value,
            frequencyDays: freq, 
            lastCompleted: lastCompletedDate, 
            isOneTime: oneTime, 
            completionHistory: initialHistory 
        });
        renderDashboard(); 
        e.target.reset(); 
        toggleCustomFrequency();
    };
}
