# Requirements Document

## Introduction

The Expense & Budget Visualizer is a client-side web application that allows users to track personal expenses, categorize spending, and visualize their budget distribution through interactive charts. The app runs entirely in the browser using HTML, CSS, and Vanilla JavaScript, with all data persisted via the browser's LocalStorage API. No backend server or build tooling is required. The app is designed to be clean, fast, and usable as both a standalone web page and a browser extension.

---

## Glossary

- **App**: The Expense & Budget Visualizer web application
- **Transaction**: A single expense entry consisting of an item name, amount, and category
- **Category**: A label grouping transactions (e.g., Food, Transport, Fun, or a user-defined custom category)
- **Balance**: The running total of all transaction amounts currently stored
- **Chart**: The pie chart rendered by Chart.js displaying spending distribution by category
- **Transaction_List**: The scrollable UI component displaying all stored transactions
- **Input_Form**: The HTML form used to submit new transactions
- **LocalStorage**: The browser's built-in key-value storage API used for client-side data persistence
- **Monthly_Summary**: A filtered view showing transactions and totals for a selected calendar month
- **Validator**: The client-side logic responsible for checking form input correctness before submission

---

## Requirements

### Requirement 1: Transaction Input Form

**User Story:** As a user, I want to fill in a form with an item name, amount, and category so that I can record a new expense quickly.

#### Acceptance Criteria

1. THE Input_Form SHALL display three fields: Item Name (text, max 100 characters), Amount (number), and Category (dropdown).
2. THE Input_Form SHALL include a submit button labeled "Add Transaction".
3. WHEN the user submits the Input_Form with all fields filled, a valid Item Name (1–100 characters), and an Amount between 0.01 and 999,999,999.99, THE App SHALL add the transaction to the Transaction_List and persist it to LocalStorage.
4. WHEN the user submits the Input_Form with one or more empty fields, THE Validator SHALL display an inline error message indicating which fields are missing AND SHALL NOT submit the transaction.
5. WHEN the user submits the Input_Form with an Amount value of zero or less, THE Validator SHALL display an error message stating that the amount must be a positive number AND SHALL NOT submit the transaction.
6. WHEN a transaction is successfully added, THE Input_Form SHALL reset all fields: Item Name and Amount clear to empty, Category resets to the first option in the dropdown.
7. WHEN the user enters an Item Name exceeding 100 characters, THE Validator SHALL display an error message indicating the name is too long AND SHALL NOT submit the transaction.
8. WHEN the user enters an Amount that is not a number or has more than 2 decimal places, THE Validator SHALL display an error message and SHALL NOT submit the transaction.

---

### Requirement 2: Transaction List

**User Story:** As a user, I want to see all my recorded transactions in a scrollable list so that I can review my spending history.

#### Acceptance Criteria

1. THE Transaction_List SHALL display each transaction's item name, amount formatted as a currency value with 2 decimal places and a currency symbol (e.g., $12.50), and category.
2. THE Transaction_List SHALL be scrollable when the number of transactions exceeds the visible area.
3. WHEN a transaction is added or deleted, THE Transaction_List SHALL update within 500ms without requiring a page reload.
4. WHEN the user clicks the delete button on a transaction, THE App SHALL remove that transaction from the Transaction_List and from LocalStorage within 500ms.
5. WHEN no transactions exist, THE Transaction_List SHALL display the placeholder message "No transactions yet."
6. IF a LocalStorage write fails during deletion, THEN THE App SHALL display an error message and SHALL NOT remove the transaction from the Transaction_List.

---

### Requirement 3: Total Balance Display

**User Story:** As a user, I want to see my total spending balance at the top of the page so that I always know how much I have spent in total.

#### Acceptance Criteria

1. THE App SHALL display the total balance as the sum of all transaction amounts in a dedicated section positioned above the Input_Form and Transaction_List.
2. WHEN a transaction is added, THE App SHALL recalculate and update the displayed balance within 100ms.
3. WHEN a transaction is deleted, THE App SHALL recalculate and update the displayed balance within 100ms.
4. THE App SHALL format the balance as a currency value with two decimal places and a currency symbol (e.g., $120.50).
5. WHEN no transactions exist, THE App SHALL display the balance as $0.00.

---

### Requirement 4: Pie Chart Visualization

**User Story:** As a user, I want to see a pie chart of my spending by category so that I can understand where my money is going at a glance.

#### Acceptance Criteria

1. THE Chart SHALL display spending distribution grouped by category using a pie chart rendered via Chart.js.
2. WHEN a transaction is added or deleted, THE Chart SHALL update within 500ms to reflect the new category totals.
3. THE Chart SHALL assign a distinct color to each category for visual differentiation, supporting up to 10 simultaneous categories.
4. WHEN all transactions are deleted, THE Chart SHALL be hidden and THE App SHALL display a message indicating no data is available.
5. THE Chart SHALL display a legend mapping each color to its corresponding category name.
6. WHEN a category's total spending reaches zero due to transaction deletions, THE Chart SHALL remove that category's slice and legend entry within 500ms.

---

### Requirement 5: Custom Categories

**User Story:** As a user, I want to add my own spending categories so that I can track expenses beyond the default options.

#### Acceptance Criteria

1. THE App SHALL provide a UI control (text input and submit button) that allows the user to enter and save a custom category name of 1–50 characters.
2. WHEN the user submits a non-empty custom category name of 1–50 characters, THE App SHALL add it to the Category dropdown in the Input_Form.
3. WHEN the user submits an empty category name, THE Validator SHALL display an error message stating the name cannot be empty AND SHALL NOT add the category.
4. WHEN the user submits a category name that already exists (case-insensitive comparison), THE Validator SHALL display an error message stating the category already exists AND SHALL NOT add the category.
5. WHEN the user submits a category name exceeding 50 characters, THE Validator SHALL display an error message stating the name is too long AND SHALL NOT add the category.
6. WHEN a custom category is successfully added, THE App SHALL persist it to LocalStorage within 100ms.
7. WHEN the App loads, THE App SHALL restore all previously saved custom categories into the Category dropdown.
8. IF a LocalStorage write fails when saving a custom category, THEN THE App SHALL display an error message informing the user the category could not be saved.

---

### Requirement 6: Monthly Summary View

**User Story:** As a user, I want to view a summary of my transactions filtered by month so that I can track my spending over time.

#### Acceptance Criteria

1. THE App SHALL provide a month/year selector control (e.g., `<input type="month">`) that allows the user to choose any month from January 2000 through the current calendar month.
2. WHEN the user selects a month using the selector, THE App SHALL display only the transactions whose recorded date falls within that calendar month and year within 300ms.
3. WHEN the user selects a month, THE App SHALL display the total spending amount for that month, calculated as the sum of all displayed transaction amounts.
4. WHEN no transactions exist for the selected month, THE App SHALL display the message "No transactions for this period."
5. WHEN the App loads, THE App SHALL set the month selector to the current calendar month and display the corresponding transactions and total.

---

### Requirement 7: Sort Transactions

**User Story:** As a user, I want to sort my transaction list by amount or category so that I can find and compare entries more easily.

#### Acceptance Criteria

1. THE App SHALL provide a sort control (e.g., dropdown) with options: "Default (Date Added)", "Amount (Low to High)", "Amount (High to Low)", and "Category (A–Z)".
2. WHEN the user selects a sort option, THE Transaction_List SHALL re-render in the selected order within 300ms.
3. WHEN two transactions have equal amounts and "Amount (Low to High)" or "Amount (High to Low)" is active, THE App SHALL break the tie by displaying the transaction added earlier first.
4. WHEN a new transaction is added and a sort option other than "Default" is active, THE Transaction_List SHALL re-render in the currently active sort order within 300ms.
5. IF no sort option has been selected or the "Default (Date Added)" option is active, THEN THE Transaction_List SHALL display transactions in the order they were added (insertion order).

---

### Requirement 8: Data Persistence

**User Story:** As a user, I want my transactions and settings to be saved automatically so that my data is not lost when I close or refresh the browser.

#### Acceptance Criteria

1. WHEN a transaction is added, THE App SHALL write the updated transaction list to LocalStorage within 100ms.
2. WHEN a transaction is deleted, THE App SHALL write the updated transaction list to LocalStorage within 100ms.
3. WHEN the App loads, THE App SHALL read all transactions from LocalStorage and render them in the Transaction_List.
4. WHEN the App loads, THE App SHALL read all custom categories from LocalStorage and populate the Category dropdown.
5. IF LocalStorage is unavailable or throws an error on write, THEN THE App SHALL display a warning banner visible without page interaction, and in-session data SHALL remain usable for the current session.
6. IF LocalStorage contains corrupt or malformed transaction data on load, THEN THE App SHALL discard the corrupt data, display a warning message, and initialize with an empty transaction list.

---

### Requirement 9: Responsive and Accessible UI

**User Story:** As a user, I want the app to work well on different screen sizes and be easy to read so that I can use it on any device.

#### Acceptance Criteria

1. THE App SHALL use a single CSS file for all visual styling and a single JavaScript file for all application logic, with no inline styles or scripts in the HTML.
2. THE App SHALL render correctly on viewport widths from 320px to 1920px without horizontal scrolling.
3. THE App SHALL use body text with a minimum font size of 16px and maintain a color contrast ratio of at least 4.5:1 for normal text and 3:1 for large text (WCAG AA).
4. THE App SHALL use a clear visual hierarchy with readable typography.
5. WHEN the App loads, THE App SHALL complete initial render and display all persisted data within 500ms on the last two major versions of Chrome, Firefox, Safari, and Edge with no network dependency beyond the initial page load.
6. THE App SHALL provide interactive touch targets (buttons, inputs, dropdowns) with a minimum size of 44×44 CSS pixels to support touch device usage.
