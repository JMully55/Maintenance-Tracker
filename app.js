let taskData = []; 
const STORAGE_KEY = 'maintenanceTrackerTasks';

// --- Persistence ---
function loadTasks() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        taskData = JSON.parse(stored);
        taskData.forEach(t => {
            if (!t.completionHistory) t.completionHistory = [];
            if (typeof t.isOneTime === 'undefined') t.isOneTime = false;
            if (typeof t.initialLastCompleted === 'undefined') t.initialLastCompleted = t.lastCompleted;
            if (typeof t.targetDueDate === 'undefined') {
                t.targetDueDate = calculateDueDate(t.lastCompleted, t.frequencyDays, t.isOneTime);
                if (t.targetDueDate) t.targetDueDate = formatDate(t.targetDueDate);
            }
        });
    }
}

function saveTasks() { 
    // When saving, remove the temporary status flag to prevent persistence errors.
    const tasksToSave = taskData.map(t => {
        const { completedToday, ...rest } = t;
        return rest;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasksToSave));
}

// --- Initialization ---
function initTracker() {
    loadTasks();
    taskData.forEach((t, i) => {
        if (typeof t.id === 'undefined') {
            t.id = Date.now() + i + Math.floor(Math.random() * 1000); 
        }
    });
    
    const today = getToday();
    taskData = taskData.filter(t => {
        if (t.isOneTime) {
            if (t.completionHistory && t.completionHistory.length > 0) {
                const nextDue = calculateDueDate(t.lastCompleted, t.frequencyDays, t.isOneTime);
                if (nextDue && nextDue.getTime() < today) {
                    return false; 
                }
            }
        }
        return true; 
    });
    saveTasks(); 
    
    setupCalendarControls();
    registerFormListener();
    toggleCustomFrequency(); 
    sortTable('dueDate');
    
    renderDashboard(); 
}

// --- Utility & Date Helpers ---
const getToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0); 
    return d.getTime();
};

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

// *** CRITICAL FIX FOR CALENDAR STABILITY: Use a permanent anchor date. ***
function getScheduleAnchorDate(task) {
    if (task.completionHistory && task.completionHistory.length > 0) {
        // Anchor to the date one cycle BEFORE the oldest actual recorded completion.
        const firstCompletion = task.completionHistory[0].dateOnly;
        const firstDate = createLocalDate(firstCompletion);
        firstDate.setDate(firstDate.getDate() - task.frequencyDays);
        return firstDate;
    }
    
    // 1. If history is empty, anchor to the original date input during task creation (which is initialLastCompleted).
    if (task.initialLastCompleted) {
        return createLocalDate(task.initialLastCompleted);
    }
    
    // 2. Default fallback if task is missing all date context.
    if (task.lastCompleted) {
        return createLocalDate(task.lastCompleted);
    }
    
    const now = new Date();
    const fallbackAnchor = new Date(now.getFullYear(), 0, 1); 
    fallbackAnchor.setDate(fallbackAnchor.getDate() - task.frequencyDays);
    return fallbackAnchor;
}

// --- Calendar Logic ---
function setupCalendarControls() {
    const ms = document.getElementById('month-select'), ys = document.getElementById('year-select');
    if (!ms || !ys) return; 
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
    
    const frequency = parseInt(task.frequencyDays);
    if (isNaN(frequency) || frequency <= 0) {
        if(task.isOneTime && frequency === 1 && task.lastCompleted) {
            const nextDueDate = calculateDueDate(task.lastCompleted, 1, true);
            if (nextDueDate && nextDueDate >= mStart && nextDueDate <= mEnd) {
                 events[formatDate(nextDueDate)] = { name: `${task.taskName} (1-Time)`, overdue: nextDueDate.getTime() < getToday() };
            }
            return events;
        }
        return events;
    }

    // --- CRITICAL RECURRENCE CALCULATION ---
    
    const msPerDay = 86400000;
    
    const anchorDate = getScheduleAnchorDate(task);
    anchorDate.setHours(0, 0, 0, 0); 

    const mStartMidnight = mStart.getTime(); 
    const anchorMidnight = anchorDate.getTime(); 
    
    // Use Math.round to handle floating point issues caused by time zones/DST
    const daysSinceAnchor = Math.round((mStartMidnight - anchorMidnight) / msPerDay);
    
    const cyclesElapsed = Math.floor(daysSinceAnchor / frequency);
    
    let currentDate = new Date(anchorDate);
    currentDate.setHours(0, 0, 0, 0); 
    
    currentDate.setDate(currentDate.getDate() + (cyclesElapsed * frequency));

    // Advance one more cycle to ensure we start plotting ON or AFTER mStart.
    currentDate.setDate(currentDate.getDate() + frequency);
    currentDate.setHours(0, 0, 0, 0); 
    // --- END CRITICAL RECURRENCE CALCULATION ---

    // Get the first expected due date (the floor date)
    const targetDueTime = task.targetDueDate ? createLocalDate(task.targetDueDate).getTime() : 0;

    while (currentDate.getTime() <= mEnd.getTime()) {
        
        const dateString = formatDate(currentDate);
        
        // Only plot if the date is within the calendar view AND is not a historical date before the user's intended start date.
        if (currentDate.getTime() >= mStart.getTime() && currentDate.getTime() >= targetDueTime) {
             events[dateString] = { 
                name: task.taskName + (task.isOneTime ? ' (1-Time)':''), 
                overdue: currentDate.getTime() < getToday() 
            };
        }

        if (task.isOneTime) break;
        
        currentDate.setDate(currentDate.getDate() + frequency);
    }
    return events;
}


window.renderCalendar = function() {
    const view = document.getElementById('calendar-view');
    const monthSelect = document.getElementById('month-select');
    const yearSelect = document.getElementById('year-select');

    if (!view || !monthSelect || !yearSelect) return; 
    
    view.innerHTML = '';
    const m = parseInt(monthSelect.value);
    const y = parseInt(yearSelect.value);

    if (isNaN(m) || isNaN(y)) return;

    const start = new Date(y, m, 1);
    
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0); 

    const end = new Date(start); end.setDate(end.getDate() + 42);
    end.setHours(0, 0, 0, 0); 

    const allEvents = {};
    taskData.forEach(t => {
        const evs = getRecurringDueDates(t, start, end);
        for (let d in evs) { if (!allEvents[d]) allEvents[d] = []; allEvents[d].push(evs[d]); }
    });

    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
        const h = document.createElement('div'); h.className='calendar-header'; h.innerText=d; view.appendChild(h);
    });

    let curr = new Date(start);
    for (let i=0; i<42; i++) {
        const ds = formatDate(curr);
        const dDiv = document.createElement('div'); 
        dDiv.className='calendar-day' + (curr.getMonth()!==m?' empty-day':'');
        dDiv.innerHTML = `<strong>${curr.getDate()}</strong>`;
        
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

// --- Modal Functions ---
window.openHistoryModal = () => { 
    const modal = document.getElementById('history-modal');
    if (modal) { modal.style.display = 'block'; renderHistoryModal(); }
};
window.closeHistoryModal = () => { 
    const modal = document.getElementById('history-modal');
    if (modal) modal.style.display = 'none'; 
};

window.openCompletedModal = () => { 
    const modal = document.getElementById('completed-modal');
    if (modal) {
        modal.style.display = 'block'; 
        const searchInput = document.getElementById('completed-search');
        if (searchInput) searchInput.value = ''; 
        renderCompletedModal();
    }
};
window.closeCompletedModal = () => { 
    const modal = document.getElementById('completed-modal');
    if (modal) modal.style.display = 'none'; 
};

window.onclick = (event) => { 
    const modalH = document.getElementById('history-modal');
    const modalC = document.getElementById('completed-modal');
    if (event.target === modalH) closeHistoryModal(); 
    if (event.target === modalC) closeCompletedModal(); 
};

function renderHistoryModal() {
    const list = document.getElementById('history-list'); if (!list) return;
    list.innerHTML = '';
    taskData.forEach((t, i) => {
        if (t.isOneTime && t.frequencyDays === 0) return;
        const row = document.createElement('tr');
        row.innerHTML = `<td>${t.lastCompleted}</td><td>${t.taskName}</td><td>${t.category}</td><td>${t.frequencyDays}d</td><td>${t.description}</td><td><button class="delete-button-history" onclick="deleteTask(${t.id})">Delete</button></td>`;
        list.appendChild(row);
    });
}
function renderCompletedModal() {
    const list = document.getElementById('completed-list'); if (!list) return;
    list.innerHTML = '';
    const q = document.getElementById('completed-search')?.value.toLowerCase() || '';
    let history = [];
    taskData.forEach(t => t.completionHistory.forEach(h => {
        if (t.taskName.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)) history.push({ name: t.taskName, cat: t.category, time: h.timestamp });
    }));
    history.sort((a,b) => new Date(b.time) - new Date(a.time)).forEach(h => {
        list.innerHTML += `<tr><td>${formatTimestamp(h.time)}</td><td>${h.name}</td><td>${h.cat}</td></tr>`;
    });
}

// --- Dashboard Rendering ---
function renderNotepads() {
    const dl = document.getElementById('daily-tasks-list'), wl = document.getElementById('weekly-tasks-list');
    if (!dl || !wl) return; 
    
    dl.innerHTML = ''; wl.innerHTML = ''; 
    const now = new Date(); 
    const dailyH3 = document.querySelector('.daily-focus h3');
    if (dailyH3) dailyH3.textContent = `Today's Tasks (${formatDate(now)})`;
    
    const todayS = formatDate(now);
    const start = new Date(now), end = new Date(start); 
    start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0); 
    end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);

    let dailyTasksCount = 0;
    let weeklyTasksCount = 0;
    
    taskData.forEach((t) => {
        if (t.isOneTime && t.frequencyDays === 0) return;

        const lastCompDate = t.lastCompleted;
        const frequency = t.frequencyDays;
        
        let expectedDue = null;
        if (lastCompDate) {
            expectedDue = calculateDueDate(lastCompDate, frequency, t.isOneTime);
        } else {
            expectedDue = now; 
        }

        if (!expectedDue) return;

        const expectedDueS = formatDate(expectedDue);
        
        const isCompletedToday = lastCompDate === todayS; 
        const isCurrentlyDueToday = expectedDueS === todayS || expectedDue.getTime() < getToday();
        const isDueThisWeek = expectedDue >= start && expectedDue <= end;


        const itemClass = isCompletedToday ? 'visually-complete' : '';
        const itemSymbol = isCompletedToday ? '✔️' : '◻️';
        const action = isCompletedToday ? `markUndone` : `markDone`;

        // ----------------------------------------------------------------------
        // DAILY TASK LIST LOGIC: Keep task visible IF it's due today/overdue OR if it was just completed today.
        if (isCurrentlyDueToday || isCompletedToday) { 
            dailyTasksCount++;
            const item = `<li class="${itemClass}"><span class="notepad-checkbox" onclick="${action}(${t.id})">${itemSymbol}</span>${t.taskName}</li>`;
            dl.innerHTML += item;
        }

        // ----------------------------------------------------------------------
        // WEEKLY TASK LIST LOGIC
        if (isDueThisWeek || isCompletedToday) {
             weeklyTasksCount++;
             const dueDisplay = isCompletedToday ? todayS : expectedDueS; 
             const item = `<li class="${itemClass}"><span class="notepad-checkbox" onclick="${action}(${t.id})">${itemSymbol}</span>${t.taskName} (${dueDisplay})</li>`;
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
    
    taskData.sort((a,b) => {
        const dueA = calculateDueDate(a.lastCompleted, a.frequencyDays, a.isOneTime);
        const dueB = calculateDueDate(b.lastCompleted, b.frequencyDays, b.isOneTime);
        if (!dueA) return 1;
        if (!dueB) return -1;
        return dueA.getTime() - dueB.getTime();
    });

    taskData.forEach((t) => {
        const due = calculateDueDate(t.lastCompleted, t.frequencyDays, t.isOneTime);
        if (t.isOneTime && t.frequencyDays === 0) return;
        
        const status = getStatus(due);
        
        if (status.sortValue <= 30) {
            
            const dueDisplay = formatDate(due);
            
            const statusColor = status.class === 'status-overdue' ? '#a94442' : '#333';
            
            const skipButton = t.isOneTime ? '' : `<button class="skip-btn" onclick="skipTask(${t.id})">Skip</button>`;
            
            const actions = `
                <div class="notepad-actions">
                    <span style="color: ${statusColor}; font-weight: bold;">${status.text}</span>
                    <button class="done-btn" onclick="markDone(${t.id})">Done</button>
                    ${skipButton}
                    <button class="delete-btn" onclick="deleteTask(${t.id})">Delete</button>
                </div>
            `;
            
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <div>
                    <span style="font-weight: bold;">[${dueDisplay}] ${t.taskName}</span> 
                    <span style="font-size: 0.9em; color: #777;">(${t.category})</span>
                </div>
                ${actions}
            `;
            list.appendChild(listItem);
        }
    });

    if (list.children.length === 0) {
         list.innerHTML = '<li>🥳 Nothing urgent coming up in the next 30 days!</li>';
    }

    renderCalendar(); 
    renderNotepads(); 
    saveTasks();
}

// --- Actions (Formal Completion/Uncompletion) ---
window.markDone = (taskId) => {
    const t = taskData.find(task => task.id === taskId);
    if (!t) return;
    
    const now = new Date();
    const todayFormatted = formatDate(now);

    if (t.lastCompleted === todayFormatted) {
        renderDashboard();
        return; 
    }
    
    t.completionHistory.push({ timestamp: now.toISOString(), dateOnly: todayFormatted });
    t.lastCompleted = todayFormatted;

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

    // 3. Revert one-time status (if applicable and necessary)
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


// --- Form Handling (FIXED to manually clear fields and preserve anchor) ---
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
        
        // Calculate initialLastCompleted (the date one cycle before the target date)
        const initialLastCompleted = new Date(targetDate);
        initialLastCompleted.setDate(targetDate.getDate() - freq);
        lastCompletedDate = formatDate(initialLastCompleted);
        
        // Calculate the target due date (the date the user entered)
        const targetDueS = formatDate(targetDate);
        
        const initialHistory = [];

        taskData.push({
            id: Date.now() + Math.floor(Math.random() * 1000), 
            taskName: document.getElementById('taskName').value,
            category: document.getElementById('category').value,
            description: document.getElementById('description').value,
            frequencyDays: freq, 
            lastCompleted: lastCompletedDate, 
            initialLastCompleted: lastCompletedDate, // Permanent anchor
            targetDueDate: targetDueS, // New property for calendar floor
            isOneTime: oneTime, 
            completionHistory: initialHistory 
        });
        renderDashboard(); 
        
        // *** FIX: Manually clear critical input fields for reliability ***
        document.getElementById('taskName').value = '';
        document.getElementById('category').value = ''; 
        document.getElementById('description').value = '';
        document.getElementById('dateInput').value = '';
        document.getElementById('customDays').value = ''; 
        document.getElementById('frequencySelect').value = '7'; // Set frequency back to default (Weekly)
        toggleCustomFrequency(); // Hide custom input if it was visible
        // *** END FIX ***
        
    };
}
