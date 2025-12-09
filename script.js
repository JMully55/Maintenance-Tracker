let taskData = []; 
const STORAGE_KEY = 'maintenanceTrackerTasks';

// --- Utility Functions ---

const getToday = () => new Date().setHours(0, 0, 0, 0);

function formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
}

// Function to format ISO string to readable format (date and time)
function formatTimestamp(isoString) {
    const date = new Date(isoString);
    const datePart = date.toLocaleDateString();
    const timePart = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
}

// Helper to create a date object correctly from YYYY-MM-DD string
function createLocalDate(dateString) {
    const parts = dateString.split('-').map(p => parseInt(p, 10));
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function calculateDueDate(lastCompletedDate, frequencyDays, isOneTime) {
    // Logic: If it's a one-time event, the task should only appear once (based on its initial lastCompletedDate)
    // After completion, the frequency is set to 0, which prevents recurrence here.
    if (isOneTime && frequencyDays === 0) {
        return null; 
    }
    
    if (!lastCompletedDate) return null;
    const lastDate = createLocalDate(lastCompletedDate);
    const nextDate = new Date(lastDate);
    nextDate.setDate(lastDate.getDate() + parseInt(frequencyDays));
    return nextDate;
}

function getStatus(dueDate) {
    if (!dueDate) return { text: 'Date Not Set', class: '', sortValue: 1000 };
    
    const dueDateTime = dueDate.setHours(0, 0, 0, 0);
    const TODAY = getToday();
    const daysUntilDue = Math.ceil((dueDateTime - TODAY) / (1000 * 60 * 60 * 24));

    if (daysUntilDue < 0) {
        return { text: `OVERDUE (${Math.abs(daysUntilDue)}d)`, class: 'status-overdue', sortValue: daysUntilDue };
    } else if (daysUntilDue <= 30) {
        return { text: `DUE IN ${daysUntilDue} DAYS`, class: 'status-due', sortValue: daysUntilDue };
    } else {
        return { text: 'Upcoming', class: '', sortValue: daysUntilDue };
    }
}

// --- Persistence ---

function loadTasks() {
    const storedData = localStorage.getItem(STORAGE_KEY);
    if (storedData) {
        taskData = JSON.parse(storedData); 
        taskData.forEach(task => {
            if (!task.completionHistory) {
                task.completionHistory = [];
                if (task.lastCompleted) {
                    task.completionHistory.push({
                        timestamp: new Date(task.lastCompleted).toISOString(),
                        dateOnly: task.lastCompleted
                    });
                }
            }
            if (typeof task.isOneTime === 'undefined') {
                task.isOneTime = false;
            }
        });
    }
}

function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(taskData));
}

// --- Dynamic Calendar Logic ---

function setupCalendarControls() {
    const monthSelect = document.getElementById('month-select');
    const yearSelect = document.getElementById('year-select');
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const months = ["January", "February", "March", "April", "May", "June", 
                    "July", "August", "September", "October", "November", "December"];

    monthSelect.innerHTML = months.map((m, i) => 
        `<option value="${i}" ${i === currentMonth ? 'selected' : ''}>${m}</option>`
    ).join('');

    yearSelect.innerHTML = '';
    for (let year = currentYear - 5; year <= currentYear + 10; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === currentYear) {
            option.selected = true;
        }
        yearSelect.appendChild(option);
    }
}

function getRecurringDueDates(task, monthStart, monthEnd) {
    const events = {};
    
    // If one-time AND completed (frequency is 0), skip rendering
    if (task.isOneTime && task.frequencyDays === 0) {
        return events;
    }
    if (!task.lastCompleted) return events;

    const frequency = parseInt(task.frequencyDays);
    if (isNaN(frequency) || frequency <= 0) {
         // Handle one-time uncompleted task which has a frequency of 1
         if(task.isOneTime && frequency === 1) {
            const nextDueDate = calculateDueDate(task.lastCompleted, 1, true);
            if (nextDueDate >= monthStart && nextDueDate <= monthEnd) {
                 const dateString = formatDate(nextDueDate);
                 events[dateString] = {
                    taskName: `${task.taskName} (One-Time)`,
                    isOverdue: nextDueDate.getTime() < getToday(),
                 };
            }
            return events;
         }
         return events;
    }

    // Start with the calculated next due date
    let currentDate = calculateDueDate(task.lastCompleted, frequency, false);
    currentDate.setHours(0, 0, 0, 0); 

    // Loop through all recurring dates
    while (currentDate.getTime() <= monthEnd.getTime()) {
        
        if (currentDate.getTime() >= monthStart.getTime()) {
            const dateString = formatDate(currentDate);
            events[dateString] = {
                taskName: task.taskName,
                isOverdue: currentDate.getTime() < getToday(),
            };
        }

        currentDate.setDate(currentDate.getDate() + frequency);
    }
    return events;
}


window.renderCalendar = function() {
    const calendarView = document.getElementById('calendar-view');
    calendarView.innerHTML = '';

    const month = parseInt(document.getElementById('month-select').value);
    const year = parseInt(document.getElementById('year-select').value);
    
    if (isNaN(month) || isNaN(year)) return;

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDayOfMonth.getDay(); 
    
    const calendarStartDate = new Date(firstDayOfMonth);
    calendarStartDate.setDate(firstDayOfMonth.getDate() - startingDayOfWeek);
    calendarStartDate.setHours(0, 0, 0, 0); 
    
    const calendarEndDate = new Date(calendarStartDate);
    calendarEndDate.setDate(calendarStartDate.getDate() + 42); 
    calendarEndDate.setHours(0, 0, 0, 0); 

    const allEvents = {};
    taskData.forEach(task => {
        const eventsForTask = getRecurringDueDates(task, calendarStartDate, calendarEndDate);
        
        for (const dateString in eventsForTask) {
            if (!allEvents[dateString]) {
                allEvents[dateString] = [];
            }
            allEvents[dateString].push(eventsForTask[dateString]);
        }
    });

    let currentDate = new Date(calendarStartDate);
    let daysRendered = 0;

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    daysOfWeek.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = day;
        calendarView.appendChild(header);
    });
    
    while (daysRendered < 42 && currentDate.getTime() < calendarEndDate.getTime()) {
        const dateString = formatDate(currentDate);
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';

        if (currentDate.getMonth() !== month) {
             dayDiv.classList.add('empty-day');
        }

        dayDiv.innerHTML = `<strong>${currentDate.getDate()}</strong>`;
        
        if (allEvents[dateString]) {
            allEvents[dateString].forEach(event => {
                const eventDiv = document.createElement('div');
                eventDiv.className = 'task-event';
                
                if (event.isOverdue) {
                    eventDiv.classList.add('overdue');
                }
                
                eventDiv.textContent = event.taskName;
                dayDiv.appendChild(eventDiv);
            });
        }
        
        calendarView.appendChild(dayDiv);
        currentDate.setDate(currentDate.getDate() + 1);
        daysRendered++;
    }
}


// --- Modal Functions (No change) ---

window.openHistoryModal = function() {
    document.getElementById('history-modal').style.display = 'block';
    renderHistoryModal(); 
}

window.closeHistoryModal = function() {
    document.getElementById('history-modal').style.display = 'none';
}

window.openCompletedModal = function() {
    document.getElementById('completed-modal').style.display = 'block';
    document.getElementById('completed-search').value = ''; 
    renderCompletedModal(); 
}

window.closeCompletedModal = function() {
    document.getElementById('completed-modal').style.display = 'none';
}

window.onclick = function(event) {
    const modalH = document.getElementById('history-modal');
    const modalC = document.getElementById('completed-modal');
    if (event.target === modalH) {
        closeHistoryModal();
    }
    if (event.target === modalC) {
        closeCompletedModal();
    }
}


// --- Rendering and Sorting ---

function renderNotepads() {
    const dailyList = document.getElementById('daily-tasks-list');
    const weeklyList = document.getElementById('weekly-tasks-list');
    dailyList.innerHTML = '';
    weeklyList.innerHTML = '';

    const TODAY = new Date();
    document.querySelector('.daily-focus h3').textContent = `Today's Tasks (${formatDate(TODAY)})`;

    const TODAY_STR = formatDate(TODAY);
    const TODAY_TIME = getToday();
    
    // Determine current Sunday-to-Saturday week
    const currentDayOfWeek = TODAY.getDay();
    const weekStart = new Date(TODAY);
    weekStart.setDate(TODAY.getDate() - currentDayOfWeek);
    weekStart.setHours(0, 0, 0, 0); 
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    
    const WEEK_START_TIME = weekStart.getTime();
    const WEEK_END_TIME = weekEnd.getTime();


    // Filter tasks that are due today or this week
    taskData.forEach(task => {
        // Pass isOneTime flag
        const nextDueDate = calculateDueDate(task.lastCompleted, task.frequencyDays, task.isOneTime);
        
        // Skip rendering one-time tasks that have already been completed
        if (task.isOneTime && task.frequencyDays === 0) return; 
        if (!nextDueDate) return;

        const dueTime = nextDueDate.setHours(0, 0, 0, 0);
        const isCompletedToday = (task.lastCompleted === TODAY_STR);
        const isOverdue = dueTime < TODAY_TIME;
        
        const statusClass = isOverdue ? 'status-overdue' : '';
        const taskStatusClass = isCompletedToday ? 'completed-task-note' : statusClass;
        const taskDisplay = task.isOneTime ? `${task.taskName} (One-Time)` : task.taskName;


        // Generate the list item HTML for both notepads
        const listItemHTML = `
            <li class="${taskStatusClass}">
                <span 
                    class="notepad-checkbox" 
                    data-id="${task.id}" 
                    title="Mark Complete"
                >
                    ${isCompletedToday ? '✔️' : (isOverdue ? '❌' : '◻️')}
                </span>
                ${taskDisplay} (${task.category})
            </li>
        `;
        
        // 1. DAILY TASKS
        if (formatDate(nextDueDate) === TODAY_STR) {
            dailyList.innerHTML += listItemHTML;
        }

        // 2. WEEKLY TASKS (Due within the current Sunday-to-Saturday span)
        if (dueTime >= WEEK_START_TIME && dueTime <= WEEK_END_TIME) {
            weeklyList.innerHTML += listItemHTML;
        }
    });

    if (!dailyList.innerHTML) {
        dailyList.innerHTML = '<li>🎉 No tasks due today!</li>';
    }
    if (!weeklyList.innerHTML) {
        weeklyList.innerHTML = '<li>😌 No tasks due this week!</li>';
    }
}


function renderHistoryModal() {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';
    
    taskData.forEach((task, index) => {
        // Skip rendering one-time tasks that have already been completed
        if (task.isOneTime && task.frequencyDays === 0) return; 
        
        task.id = taskData.indexOf(task); 
        const taskDisplay = task.isOneTime ? `${task.taskName} (One-Time)` : task.taskName;


        const historyRow = document.createElement('tr');
        historyRow.innerHTML = `
            <td>${task.lastCompleted || 'N/A'}</td>
            <td>${taskDisplay}</td>
            <td>${task.category}</td>
            <td>${task.frequencyDays} days</td>
            <td>${task.description}</td>
            <td><button class="delete-button-history" data-id="${task.id}" title="Delete Task">Delete</button></td>
        `;
        historyList.appendChild(historyRow);
    });
}

function renderCompletedModal() {
    const completedListBody = document.getElementById('completed-list');
    completedListBody.innerHTML = '';
    const searchFilter = document.getElementById('completed-search').value.toLowerCase();

    // Flatten the completion history from all tasks into a single array
    let allCompletedEvents = [];
    taskData.forEach(task => {
        task.completionHistory.forEach(historyItem => {
            // Check if the task name or category contains the search term
            if (task.taskName.toLowerCase().includes(searchFilter) || 
                task.category.toLowerCase().includes(searchFilter)) {
                
                allCompletedEvents.push({
                    name: task.taskName,
                    category: task.category,
                    timestamp: historyItem.timestamp
                });
            }
        });
    });

    // Sort by timestamp (most recent first)
    allCompletedEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (allCompletedEvents.length === 0 && searchFilter) {
        completedListBody.innerHTML = `<tr><td colspan="3">No completed tasks match your search: "${searchFilter}"</td></tr>`;
        return;
    }
    if (allCompletedEvents.length === 0) {
        completedListBody.innerHTML = `<tr><td colspan="3">No tasks have been completed yet.</td></tr>`;
        return;
    }


    allCompletedEvents.forEach(event => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatTimestamp(event.timestamp)}</td>
            <td>${event.name}</td>
            <td>${event.category}</td>
        `;
        completedListBody.appendChild(row);
    });
}


function renderDashboard() { 
    const comingUpList = document.getElementById('coming-up-list');
    comingUpList.innerHTML = ''; 

    // Filter and render Coming Up List
    taskData.forEach((task, index) => {
        // Pass isOneTime flag to calculateDueDate
        const dueDate = calculateDueDate(task.lastCompleted, task.frequencyDays, task.isOneTime);
        
        // Skip rendering if it's a completed one-time task
        if (task.isOneTime && task.frequencyDays === 0) return;
        
        const status = getStatus(dueDate);
        
        task.dueDate = dueDate ? dueDate.getTime() : null;
        task.statusSortValue = status.sortValue;
        task.statusText = status.text;
        task.statusClass = status.class;
        task.id = index;

        const taskDisplay = task.isOneTime ? `${task.taskName} (One-Time)` : task.taskName;


        // --- 1. Coming Up Table ---
        if (status.sortValue <= 30) {
            const row = document.createElement('tr');
            row.className = status.class;
            row.innerHTML = `
                <td>${dueDate ? formatDate(dueDate) : 'N/A'}</td>
                <td>${taskDisplay}</td>
                <td>${task.category}</td>
                <td>${status.text}</td>
                <td>
                    <input type="checkbox" class="complete-checkbox" data-id="${task.id}" title="Mark Complete" />
                    ${task.isOneTime ? '' : `<button class="skip-button" data-id="${task.id}" title="Skip one cycle">Skip</button>`}
                    <button class="delete-button" data-id="${task.id}" title="Delete Task">Delete</button>
                </td>
            `;
            comingUpList.appendChild(row);
        } 
    });
    
    renderCalendar();
    renderNotepads(); 
    saveTasks();
}

let sortDirection = {}; 

window.sortTable = function(key, isModal = false) {
    let direction = sortDirection[key] === 'asc' ? 'desc' : 'asc';
    sortDirection[key] = direction;

    taskData.sort((a, b) => {
        let aVal, bVal;
        
        if (key === 'dueDate' || key === 'lastCompleted') {
            aVal = a[key] || 0; 
            bVal = b[key] || 0;
        } else {
            aVal = a[key].toUpperCase();
            bVal = b[key].toUpperCase();
        }

        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
    });
    
    if (isModal) {
        renderHistoryModal();
    } else {
        renderDashboard(); 
    }
}

// --- Task Action Listeners ---

document.getElementById('coming-up-list').addEventListener('click', handleTaskAction);
document.getElementById('history-modal').addEventListener('click', handleTaskAction); 
document.getElementById('focus-notepads').addEventListener('click', handleTaskAction); 

function handleTaskAction(event) {
    let target = event.target;
    while (target && !target.hasAttribute('data-id') && target.id !== 'focus-notepads') {
        target = target.parentElement;
    }
    if (!target || target.id === 'focus-notepads') return;

    const taskId = parseInt(target.getAttribute('data-id'));
    const task = taskData.find(t => t.id === taskId);
    
    const isCompleteAction = target.classList.contains('complete-checkbox') || target.classList.contains('notepad-checkbox');

    if (isCompleteAction) {
        if (task) {
            const nowISO = new Date().toISOString();
            const nowFormatted = formatDate(new Date()); 

            // Record completion with full timestamp
            task.completionHistory.push({
                timestamp: nowISO,
                dateOnly: nowFormatted
            });
            
            task.lastCompleted = nowFormatted;
            
            // If one-time, set frequency to 0 to prevent future recurrence checks
            if (task.isOneTime) {
                task.frequencyDays = 0; 
            }
            
            renderDashboard(); 
            if(document.getElementById('history-modal').style.display === 'block') {
                 renderHistoryModal();
            }
            if(document.getElementById('completed-modal').style.display === 'block') {
                 renderCompletedModal();
            }
        }
    } else if (target.classList.contains('skip-button')) {
        if (task) {
            const currentDueDate = calculateDueDate(task.lastCompleted, task.frequencyDays, task.isOneTime);
            const newDueDate = new Date(currentDueDate);
            newDueDate.setDate(currentDueDate.getDate() + parseInt(task.frequencyDays));
            
            task.lastCompleted = formatDate(currentDueDate);
            
            renderDashboard(); 
            if(document.getElementById('history-modal').style.display === 'block') {
                 renderHistoryModal();
            }
            alert(`Task "${task.taskName}" skipped. New due date is ${formatDate(newDueDate)}.`);
        }
    } else if (target.classList.contains('delete-button') || target.classList.contains('delete-button-history')) {
        if (task && confirm(`Are you sure you want to permanently delete task "${task.taskName}"? This cannot be undone.`)) {
            const indexToDelete = taskData.findIndex(t => t.id === taskId);
            if (indexToDelete > -1) {
                taskData.splice(indexToDelete, 1);
            }
            taskData.forEach((t, i) => t.id = i); 
            
            renderDashboard(); 
            if(document.getElementById('history-modal').style.display === 'block') {
                 renderHistoryModal();
            }
        }
    }
}


// --- Form Submission ---

function registerFormListener() {
    document.getElementById('task-form').addEventListener('submit', function(event) {
        event.preventDefault();

        const isOneTime = document.getElementById('oneTimeEvent').checked;
        let lastCompletedDate = document.getElementById('lastCompleted').value;
        const targetDueDate = document.getElementById('targetDueDate').value;
        let frequency = parseInt(document.getElementById('frequencyDays').value);
        
        if (!isOneTime && isNaN(frequency)) {
            alert("Please enter a valid Frequency (Days) for a recurring task.");
            return;
        }
        if (isOneTime && !targetDueDate) {
            alert("Please specify a Target Next Due Date for a one-time event.");
            return;
        }
        
        if (isOneTime) {
            frequency = 1; 
            
            // Set lastCompletedDate to be 1 day before the targetDueDate
            const targetDate = createLocalDate(targetDueDate);
            const initialLastCompleted = new Date(targetDate);
            initialLastCompleted.setDate(targetDate.getDate() - 1);
            lastCompletedDate = formatDate(initialLastCompleted);

        } else if (!lastCompletedDate) {
            // Standard recurring setup logic
            if (targetDueDate) {
                const targetDate = createLocalDate(targetDueDate);
                const initialLastCompleted = new Date(targetDate);
                initialLastCompleted.setDate(targetDate.getDate() - frequency);
                lastCompletedDate = formatDate(initialLastCompleted);
            } else {
                const today = new Date();
                const initialLastCompleted = new Date(today);
                initialLastCompleted.setDate(today.getDate() + 7 - frequency);
                lastCompletedDate = formatDate(initialLastCompleted);
            }
        }
        
        // Prepare initial completion history array
        const initialHistory = [];
        if (lastCompletedDate) {
             initialHistory.push({
                timestamp: new Date(lastCompletedDate).toISOString(),
                dateOnly: lastCompletedDate
            });
        }

        const newTask = {
            taskName: document.getElementById('taskName').value,
            category: document.getElementById('category').value,
            description: document.getElementById('description').value,
            frequencyDays: frequency,
            lastCompleted: lastCompletedDate, 
            completionHistory: initialHistory, 
            id: taskData.length,
            isOneTime: isOneTime 
        };
        
        taskData.push(newTask);
        sortTable('dueDate'); 
        document.getElementById('task-form').reset();
    });
}


// --- Initialization ---

function initTracker() {
    loadTasks();
    taskData.forEach((t, i) => t.id = i);
    setupCalendarControls();
    registerFormListener();
    sortTable('dueDate');
}
