let taskData = []; 
const STORAGE_KEY = 'maintenanceTrackerTasks';
// We no longer need a separate visual array, as markDone/markUndone will handle persistence.
// let visuallyCompleted = []; 

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

// NOTE: We remove loadVisualStatus and saveVisualStatus as the DB now drives the checkmark logic.

function saveTasks() { 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(taskData));
}

// --- Initialization ---
function initTracker() {
    loadTasks();
    taskData.forEach((t, i) => {
        if (typeof t.id === 'undefined') {
            t.id = Date.now() + i + Math.floor(Math.random() * 1000); 
        }
    });
    setupCalendarControls();
    registerFormListener();
    toggleCustomFrequency(); 
    sortTable('dueDate');
    renderDashboard(); 
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

// --- Calendar Logic (omitted for brevity) ---
function setupCalendarControls() { /* ... */ }
function getRecurringDueDates(task, mStart, mEnd) { /* ... */ }
window.renderCalendar = function() { /* ... */ };
window.openHistoryModal = () => { /* ... */ };
window.closeHistoryModal = () => { /* ... */ };
window.openCompletedModal = () => { /* ... */ };
window.closeCompletedModal = () => { /* ... */ };
window.onclick = (event) => { /* ... */ };
function renderHistoryModal() { /* ... */ }
function renderCompletedModal() { /* ... */ }

// --- Dashboard (Synchronized Post-it Rendering) ---
function renderNotepads() {
    const dl = document.getElementById('daily-tasks-list'), wl = document.getElementById('weekly-tasks-list');
    if (!dl || !wl) return; 
    
    dl.innerHTML = ''; wl.innerHTML = ''; 
    const now = new Date(); 
    const dailyH3 = document.querySelector('.daily-focus h3');
    if (dailyH3) dailyH3.textContent = `Today's Tasks (${formatDate(now)})`;
    
    const todayS = formatDate(now), start = new Date(now), end = new Date(start); 
    start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0); 
    end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);

    let dailyTasksCount = 0;
    let weeklyTasksCount = 0;
    
    taskData.forEach((t, i) => {
        const due = calculateDueDate(t.lastCompleted, t.frequencyDays, t.isOneTime);
        if (!due || (t.isOneTime && t.frequencyDays === 0)) return;
        const ds = formatDate(due);
        
        // CHECK VISUAL STATUS IS BASED PURELY ON DB
        const isCompletedToday = t.lastCompleted === todayS;
        const itemClass = isCompletedToday ? 'visually-complete' : '';
        const itemSymbol = isCompletedToday ? '✔️' : '◻️';
        
        // CRITICAL: The action now calls markDone/markUndone to update the DB
        const action = isCompletedToday ? `markUndone` : `markDone`;

        // 1. Check if due TODAY
        if (ds === todayS) {
            dailyTasksCount++;
            const item = `<li class="${itemClass}"><span class="notepad-checkbox" onclick="${action}(${t.id})">${itemSymbol}</span>${t.taskName}</li>`;
            dl.innerHTML += item;
        }
        
        // 2. Items for Weekly List
        if (due >= start && due <= end) {
             weeklyTasksCount++;
             const item = `<li class="${itemClass}"><span class="notepad-checkbox" onclick="${action}(${t.id})">${itemSymbol}</span>${t.taskName} (${ds})</li>`;
             wl.innerHTML += item;
        }
    });

    if (dailyTasksCount === 0) {
        dl.innerHTML = '<li>🎉 Nothing scheduled for today!</li>';
    } 

    if (weeklyTasksCount === 0) {
        wl.innerHTML = '<li>😌 Nothing scheduled for this week!</li>';
    }
}

function renderDashboard() {
    const list = document.getElementById('coming-up-list'); if (!list) return;
    list.innerHTML = '';
    taskData.forEach((t, i) => {
        const due = calculateDueDate(t.lastCompleted, t.frequencyDays, t.isOneTime);
        if (t.isOneTime && t.frequencyDays === 0) return;
        const status = getStatus(due);
        if (status.sortValue <= 30) {
            const row = document.createElement('tr'); row.className = status.class;
            // The action buttons in the main table still reflect the DB action
            row.innerHTML = `<td>${formatDate(due)}</td><td>${t.taskName}</td><td>${t.category}</td><td>${status.text}</td>
            <td><button onclick="markDone(${t.id})">Done</button> ${t.isOneTime?'':`<button class="skip-button" onclick="skipTask(${t.id})">Skip</button>`} <button class="delete-button" onclick="deleteTask(${t.id})">Delete</button></td>`;
            list.appendChild(row);
        }
    });
    renderCalendar(); renderNotepads(); saveTasks();
}

// --- Actions (MarkDone/MarkUndone - Formal Completion/Uncompletion) ---
window.markDone = (taskId) => {
    const t = taskData.find(task => task.id === taskId);
    if (!t) return;
    
    const now = new Date();
    const todayFormatted = formatDate(now);

    if (t.lastCompleted === todayFormatted) return; 
    
    // Formal Completion: Updates DB and fixes overdue issue
    t.completionHistory.push({ timestamp: now.toISOString(), dateOnly: todayFormatted });
    t.lastCompleted = todayFormatted;

    if (t.isOneTime) t.frequencyDays = 0;
    
    renderDashboard();
};

window.markUndone = (taskId) => {
    const t = taskData.find(task => task.id === taskId);
    if (!t) return;
    
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


window.skipTask = (taskId) => {
    const t = taskData.find(task => task.id === taskId);
    if (!t) return;
    
    const due = calculateDueDate(t.lastCompleted, t.frequencyDays, false);
    t.lastCompleted = formatDate(due);
    renderDashboard();
};

window.deleteTask = (taskId) => {
    if (confirm("Permanently delete this task?")) { 
        const indexToDelete = taskData.findIndex(t => t.id === taskId);
        if (indexToDelete > -1) {
            taskData.splice(indexToDelete, 1);
            taskData.forEach((t, i) => t.id = i);
        }
        renderDashboard(); 
    }
};

window.sortTable = (key, modal=false) => {
    taskData.sort((a,b) => (a[key] > b[key] ? 1 : -1));
    modal ? renderHistoryModal() : renderDashboard();
};

window.toggleCustomFrequency = () => {
    const customDiv = document.getElementById('customFrequencyDiv');
    if (customDiv) {
        customDiv.style.display = document.getElementById('frequencySelect').value === 'custom' ? 'block' : 'none';
    }
};

window.toggleFormVisibility = function() {
    const formContainer = document.getElementById('task-form-container');
    const button = document.querySelector('#add-task-toggle button');
    
    if (formContainer && button) {
        if (formContainer.style.display === 'none' || formContainer.style.display === '') {
            formContainer.style.display = 'block';
            button.textContent = '— Hide Task Input';
        } else {
            formContainer.style.display = 'none';
            button.textContent = '+ Add New Task / Event';
        }
    }
}


// --- Form Handling ---
function registerFormListener() {
    document.getElementById('task-form').onsubmit = (e) => {
        e.preventDefault();
        const fv = document.getElementById('frequencySelect').value;
        const oneTime = fv === 'single';
        let freq = oneTime ? 1 : (fv === 'custom' ? parseInt(document.getElementById('customDays').value) : parseInt(fv));
        const inputDate = document.getElementById('dateInput').value; 

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
        
        const initialHistory = [];

        taskData.push({
            id: Date.now() + Math.floor(Math.random() * 1000), 
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
