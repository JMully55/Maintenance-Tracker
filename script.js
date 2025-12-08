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

function calculateDueDate(lastCompletedDate, frequencyDays) {
    if (!lastCompletedDate) return null;
    const lastDate = new Date(lastCompletedDate);
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

window.renderCalendar = function() {
    const calendarView = document.getElementById('calendar-view');
    calendarView.innerHTML = '';

    const month = parseInt(document.getElementById('month-select').value);
    const year = parseInt(document.getElementById('year-select').value);
    
    if (isNaN(month) || isNaN(year)) return;

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDayOfMonth.getDay(); 
    const daysInMonth = lastDayOfMonth.getDate();
    const today = new Date().setHours(0,0,0,0);

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    daysOfWeek.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = day;
        calendarView.appendChild(header);
    });
    
    for (let i = 0; i < startingDayOfWeek; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'calendar-day empty-day';
        calendarView.appendChild(emptyDiv);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateString = formatDate(date);
        
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        dayDiv.innerHTML = `<strong>${day}</strong>`;

        taskData.forEach(task => {
            const dueDate = calculateDueDate(task.lastCompleted, task.frequencyDays);
            if (dueDate && formatDate(dueDate) === dateString) {
                const eventDiv = document.createElement('div');
                eventDiv.className = 'task-event';
                
                if (date.getTime() < today) {
                    eventDiv.classList.add('overdue');
                }
                
                eventDiv.textContent = task.taskName;
                dayDiv.appendChild(eventDiv);
            }
        });
        
        calendarView.appendChild(dayDiv);
    }
}

// --- Core Application Logic ---

function renderTables() {
    const comingUpList = document.getElementById('coming-up-list');
    const historyList = document.getElementById('history-list');
    
    comingUpList.innerHTML = ''; 
    historyList.innerHTML = '';

    taskData.forEach((task, index) => {
        const dueDate = calculateDueDate(task.lastCompleted, task.frequencyDays);
        const status = getStatus(dueDate);
        
        task.dueDate = dueDate ? dueDate.getTime() : null;
        task.statusSortValue = status.sortValue;
        task.statusText = status.text;
        task.statusClass = status.class;
        task.id = index;

        // --- 1. Coming Up Table ---
        if (status.sortValue <= 30) {
            const row = document.createElement('tr');
            row.className = task.statusClass;
            row.innerHTML = `
                <td>${dueDate ? formatDate(dueDate) : 'N/A'}</td>
                <td>${task.taskName}</td>
                <td>${task.category}</td>
                <td>${status.text}</td>
                <td>
                    <input type="checkbox" class="complete-checkbox" data-id="${task.id}" title="Mark Complete" />
                    <button class="skip-button" data-id="${task.id}" title="Skip one cycle">Skip</button>
                    <button class="delete-button" data-id="${task.id}" title="Delete Task">Delete</button>
                </td>
            `;
            comingUpList.appendChild(row);
        } 
        
        // --- 2. History Table ---
        const historyRow = document.createElement('tr');
        historyRow.innerHTML = `
            <td>${task.lastCompleted || 'N/A'}</td>
            <td>${task.taskName}</td>
            <td>${task.category}</td>
            <td>${task.frequencyDays} days</td>
            <td>${task.description}</td>
            <td><button class="delete-button-history" data-id="${task.id}" title="Delete Task">Delete</button></td>
        `;
        historyList.appendChild(historyRow);
    });
    
    renderCalendar();
    saveTasks();
}

let sortDirection = {}; 

window.sortTable = function(key) {
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
    
    renderTables(); 
}

// --- Task Action Listeners ---

document.getElementById('coming-up-list').addEventListener('click', handleTaskAction);
document.getElementById('history-list').addEventListener('click', handleTaskAction);

function handleTaskAction(event) {
    let target = event.target;
    const taskId = parseInt(target.getAttribute('data-id'));
    const task = taskData[taskId];

    if (target.classList.contains('complete-checkbox')) {
        if (task) {
            task.lastCompleted = formatDate(new Date());
            target.closest('td').innerHTML = '✅ Done!'; 
            renderTables(); 
        }
    } else if (target.classList.contains('skip-button')) {
        if (task) {
            const currentDueDate = calculateDueDate(task.lastCompleted, task.frequencyDays);
            const newDueDate = new Date(currentDueDate);
            newDueDate.setDate(currentDueDate.getDate() + parseInt(task.frequencyDays));
            
            task.lastCompleted = formatDate(currentDueDate);
            
            renderTables(); 
            alert(`Task "${task.taskName}" skipped. New due date is ${formatDate(newDueDate)}.`);
        }
    } else if (target.classList.contains('delete-button') || target.classList.contains('delete-button-history')) {
        if (task && confirm(`Are you sure you want to permanently delete task "${task.taskName}"? This cannot be undone.`)) {
            taskData.splice(taskId, 1);
            renderTables(); 
        }
    }
}


// --- Form Submission (CRITICAL SECTION WITH DATE FIX) ---

function registerFormListener() {
    document.getElementById('task-form').addEventListener('submit', function(event) {
        event.preventDefault();

        let lastCompletedDate = document.getElementById('lastCompleted').value;
        const targetDueDate = document.getElementById('targetDueDate').value;
        const frequency = parseInt(document.getElementById('frequencyDays').value);
        
        if (isNaN(frequency)) {
            alert("Please enter a valid Frequency (Days).");
            return;
        }

        if (!lastCompletedDate) {
            if (targetDueDate) {
                // CORRECTED LOGIC: Set theoretical "last completed" date one cycle before the target
                const targetDate = new Date(targetDueDate);
                const initialLastCompleted = new Date(targetDate);
                
                // Subtract the frequency in days from the target date
                initialLastCompleted.setDate(targetDate.getDate() - frequency);
                
                lastCompletedDate = formatDate(initialLastCompleted);
            } else {
                // Default: Due in 7 days from today
                const today = new Date();
                const initialLastCompleted = new Date(today);
                initialLastCompleted.setDate(today.getDate() + 7 - frequency);
                lastCompletedDate = formatDate(initialLastCompleted);
            }
        }

        const newTask = {
            taskName: document.getElementById('taskName').value,
            category: document.getElementById('category').value,
            description: document.getElementById('description').value,
            frequencyDays: frequency,
            lastCompleted: lastCompletedDate, 
        };
        
        taskData.push(newTask);
        sortTable('dueDate'); 
        document.getElementById('task-form').reset();
    });
}


// --- Initialization ---

function initTracker() {
    loadTasks();
    setupCalendarControls();
    registerFormListener();
    sortTable('dueDate');
}

