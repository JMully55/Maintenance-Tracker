let taskData = []; 
const STORAGE_KEY = 'maintenanceTrackerTasks';
const VISUAL_KEY = 'notepadVisualState'; // New key for session-only visual state

// --- Initialization ---
function initTracker() {
    loadTasks();
    taskData.forEach((t, i) => t.id = i);
    setupCalendarControls();
    registerFormListener();
    toggleCustomFrequency(); 
    sortTable('dueDate');
}

// --- Utility & Date Helpers (omitted for brevity) ---
const getToday = () => new Date().setHours(0, 0, 0, 0);
function formatDate(date) { /* ... */ }
function formatTimestamp(isoString) { /* ... */ }
function createLocalDate(dateString) { /* ... */ }
function calculateDueDate(lastComp, freqDays, isOneTime) { /* ... */ }
function getStatus(dueDate) { /* ... */ }

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

// --- Visual State Persistence (NEW) ---
function loadVisualState() {
    // Loads the visual state array, which resets if the day changes or session ends
    const state = sessionStorage.getItem(VISUAL_KEY);
    return state ? JSON.parse(state) : [];
}
function saveVisualState(state) {
    sessionStorage.setItem(VISUAL_KEY, JSON.stringify(state));
}

// --- Calendar & Modal Functions (omitted for brevity) ---
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

// --- Dashboard ---
function renderNotepads() {
    const dl = document.getElementById('daily-tasks-list'), wl = document.getElementById('weekly-tasks-list');
    dl.innerHTML = ''; wl.innerHTML = '';
    const now = new Date(); document.querySelector('.daily-focus h3').textContent = `Today's Tasks (${formatDate(now)})`;
    const todayS = formatDate(now), start = new Date(now), end = new Date(start); 
    start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0); 
    end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
    
    const visualState = loadVisualState(); // Load session-only visual checkmarks

    taskData.forEach((t, i) => {
        const due = calculateDueDate(t.lastCompleted, t.frequencyDays, t.isOneTime);
        if (!due || (t.isOneTime && t.frequencyDays === 0)) return;
        const ds = formatDate(due);
        
        // Check if task is visually checked in THIS session
        const isVisuallyChecked = visualState.includes(t.id);
        
        // We still use the *actual* lastCompleted date for the table/DB completion
        const isCompletedTodayByDB = t.lastCompleted === todayS; 
        
        // 🏆 NEW LOGIC: Toggles the VISUAL state using the session ID, but only triggers DB update if due TODAY.
        const completionAction = `toggleVisualDone(${t.id}, '${ds}')`; // Pass task ID and due date

        const item = `<li><span class="notepad-checkbox" onclick="${completionAction}">${isVisuallyChecked?'✔️':'◻️'}</span>${t.taskName}</li>`;
        
        // DAILY TASKS
        if (ds === todayS) {
            dl.innerHTML += item;
        }

        // WEEKLY TASKS (Shows up with checkmark if done in session or if due today/later this week)
        if (due >= start && due <= end) {
            wl.innerHTML += item;
        }
    });

    if (!dl.innerHTML) { dl.innerHTML = '<li>🎉 No tasks due today!</li>'; }
    if (!wl.innerHTML) { wl.innerHTML = '<li>😌 No tasks due this week!</li>'; }
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

// --- Actions (MODIFIED) ---

// 🏆 NEW: Handles the visual toggle and conditionally triggers markDone
window.toggleVisualDone = (taskId, dueDateStr) => {
    const todayS = formatDate(new Date());
    const visualState = loadVisualState();
    const taskIndex = visualState.indexOf(taskId);

    if (taskIndex === -1) {
        // If UNCHECKED, mark visually checked
        visualState.push(taskId);

        // If the task is due TODAY, trigger the full database completion.
        if (dueDateStr === todayS) {
            markDone(taskId);
        }
    } else {
        // If CHECKED, remove visual checkmark
        visualState.splice(taskIndex, 1);
        
        // If the task was due TODAY, reverse the database completion.
        if (dueDateStr === todayS) {
            markUndone(taskId);
        }
    }
    
    saveVisualState(visualState);
    renderDashboard(); // Rerender to show the new checkmark status
};


window.markDone = (idx) => {
    const t = taskData.find(t => t.id === idx);
    const now = new Date();
    const todayFormatted = formatDate(now);

    if (!t || t.lastCompleted === todayFormatted) return; 
    
    // Check if the task is currently checked visually, if not, check it visually first.
    const visualState = loadVisualState();
    if (!visualState.includes(t.id)) {
        visualState.push(t.id);
        saveVisualState(visualState);
    }
    
    t.completionHistory.push({ timestamp: now.toISOString(), dateOnly: todayFormatted });
    t.lastCompleted = todayFormatted;

    if (t.isOneTime) t.frequencyDays = 0;
    
    renderDashboard();
};

window.markUndone = (idx) => {
    const t = taskData.find(t => t.id === idx);
    const todayFormatted = formatDate(new Date());

    if (!t) return;
    
    // 1. Remove today's completion entry from the DB
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


window.skipTask = (idx) => { /* ... */ };
window.deleteTask = (idx) => { /* ... */ };
window.sortTable = (key, modal=false) => { /* ... */ };

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
function registerFormListener() { /* ... */ }
