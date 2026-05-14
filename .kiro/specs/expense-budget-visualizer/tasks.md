# Implementation Plan: Expense & Budget Visualizer

## Overview

Implement a zero-dependency, client-side SPA using plain HTML, CSS, and Vanilla JavaScript. The app ships as three files (`index.html`, `styles.css`, `app.js`) with Chart.js loaded via CDN. All state is persisted to `localStorage`. The implementation follows a unidirectional data flow: user action → validate → mutate state → persist → re-render.

## Tasks

- [x] 1. Set up project structure and HTML skeleton
  - Create `index.html` with semantic HTML structure: balance section, transaction form, custom category form, month selector, sort control, transaction list, and chart canvas
  - Create `styles.css` as an empty file linked from `index.html`
  - Create `app.js` as an empty file linked from `index.html`
  - Add Chart.js CDN `<script>` tag (`https://cdn.jsdelivr.net/npm/chart.js@4`) with an `onerror` handler that shows the fallback message
  - Ensure all form fields have associated `<label>` elements and all error containers have `id` attributes for `aria-describedby` wiring
  - _Requirements: 9.1, 9.4_

- [x] 2. Implement `StorageService` and data models
  - [x] 2.1 Implement `StorageService` with `isAvailable()`, `load(key)`, and `save(key, value)` methods
    - `isAvailable()` probes `localStorage` with a test write and caches the result
    - `load()` wraps `JSON.parse(localStorage.getItem(key))` in `try/catch`; returns `null` on failure
    - `save()` wraps `localStorage.setItem` in `try/catch`; throws a typed `StorageError` on failure
    - Define `localStorage` keys as constants: `EBV_TRANSACTIONS = 'ebv_transactions'`, `EBV_CATEGORIES = 'ebv_categories'`
    - _Requirements: 8.5, 8.6_



- [x] 3. Implement `Validator`
  - [x] 3.1 Implement `Validator.validateTransaction(name, amount, category)`
    - Reject empty fields, name > 100 chars, amount ≤ 0, amount > 999,999,999.99, amount with > 2 decimal places, non-numeric amount
    - Return `{ valid: boolean, errors: string[] }`
    - _Requirements: 1.4, 1.5, 1.7, 1.8_

  - [x] 3.2 Implement `Validator.validateCategory(name, existingCategories)`
    - Reject empty name, name > 50 chars, case-insensitive duplicate in `existingCategories`
    - Return `{ valid: boolean, errors: string[] }`
    - _Requirements: 5.3, 5.4, 5.5_


- [x] 4. Implement `AppState` and `TransactionService`
  - [x] 4.1 Define `AppState` object with `transactions`, `categories`, `sortOrder`, and `activeMonth` fields
    - `sortOrder` defaults to `'default'`; `activeMonth` defaults to current month in `'YYYY-MM'` format
    - _Requirements: 7.5, 6.5_

  - [x] 4.2 Implement `TransactionService.addTransaction(name, amount, category)`
    - Generate ID as `` `${Date.now()}-${Math.random().toString(36).slice(2)}` ``
    - Set `date` to today's ISO date string `'YYYY-MM-DD'`
    - Push to `AppState.transactions`
    - _Requirements: 1.3_

  - [x] 4.3 Implement `TransactionService.deleteTransaction(id)`
    - Filter `AppState.transactions` to remove the entry with matching `id`
    - _Requirements: 2.4_

  - [x] 4.4 Implement `TransactionService.getFilteredAndSorted(transactions, month, sortOrder)`
    - Filter by `transaction.date.startsWith(month)`
    - Sort by the given `sortOrder`: `'amount-asc'`, `'amount-desc'`, `'category-az'`, or `'default'` (insertion order)
    - Tie-break equal amounts by insertion order (stable sort)
    - _Requirements: 6.2, 7.2, 7.3, 7.5_

  - [x] 4.5 Implement `TransactionService.calculateTotal(transactions)`
    - Return the arithmetic sum of all `amount` values; return `0` for an empty array
    - _Requirements: 3.1, 3.5_


- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement `Renderer`
  - [x] 6.1 Implement `Renderer.renderBalance(total)` and `Renderer.renderMonthlyTotal(total, hasTransactions)`
    - Format amounts using `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`
    - Display `$0.00` when no transactions exist
    - _Requirements: 3.4, 3.5, 6.3_

  - [x] 6.2 Implement `Renderer.renderTransactionList(transactions)`
    - Render each transaction's name, formatted amount, and category
    - Attach a delete button to each row with a `data-id` attribute for event delegation
    - Show "No transactions yet." when the array is empty; show "No transactions for this period." when filtered result is empty
    - _Requirements: 2.1, 2.2, 2.5, 6.4_

  - [x] 6.3 Implement `Renderer.renderCategoryDropdown(categories)`
    - Populate the `<select>` in the transaction form with all current categories
    - Reset the dropdown to the first option after a successful transaction submission
    - _Requirements: 1.1, 1.6, 5.2_

  - [x] 6.4 Implement `Renderer.showError(fieldId, message)` and `Renderer.clearErrors()`
    - Inject error text into the element referenced by `aria-describedby` on the field
    - Clear all error messages on next successful submission
    - _Requirements: 1.4, 1.5, 1.7, 1.8, 5.3, 5.4, 5.5_

  - [x] 6.5 Implement `Renderer.showBanner(message, type)` and `Renderer.hideBanner()`
    - Render a persistent banner at the top of the page for `'warning'` or `'error'` type
    - _Requirements: 8.5, 5.8_


- [x] 7. Implement `ChartService`
  - [x] 7.1 Implement `ChartService.init(canvasId)`
    - Create the Chart.js pie chart instance once on page load; store in a module-level variable
    - Guard against Chart.js not being loaded (CDN failure); show fallback message if `window.Chart` is undefined
    - _Requirements: 4.1_

  - [x] 7.2 Implement `ChartService.update(transactions)`
    - Aggregate transaction amounts by category
    - Assign a distinct color per category from a predefined palette (up to 10 colors)
    - Update the chart via `chart.data = newData; chart.update()` (no destroy/recreate)
    - Hide canvas and show "no data" message when `transactions` is empty; show canvas otherwise
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_


- [x] 8. Wire event handlers and app initialization
  - [x] 8.1 Implement `DOMContentLoaded` handler
    - Call `StorageService.isAvailable()`; show persistent warning banner if unavailable
    - Load transactions from `ebv_transactions`; handle corrupt data (clear key, show warning, init empty)
    - Load categories from `ebv_categories`; fall back to defaults (`Food`, `Transport`, `Fun`, `Health`, `Other`) if missing or corrupt
    - Set `activeMonth` to current month; set month selector value to current month
    - Call `ChartService.init('chart-canvas')`
    - Call all `Renderer.*` functions to render initial state
    - _Requirements: 6.5, 8.3, 8.4, 8.5, 8.6_

  - [x] 8.2 Implement `#transaction-form` submit handler
    - Call `Validator.validateTransaction`; on failure call `Renderer.showError` for each error and return
    - On success: call `TransactionService.addTransaction`, persist via `StorageService.save` (show banner on `StorageError`), then call `Renderer.renderTransactionList`, `Renderer.renderBalance`, `ChartService.update`, and reset the form
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 3.2, 4.2, 8.1_

  - [x] 8.3 Implement delegated `#delete-btn` click handler on the transaction list container
    - Read `data-id` from the clicked button; call `TransactionService.deleteTransaction`
    - Persist via `StorageService.save`; on `StorageError` show banner and re-add transaction to state (do not remove from list)
    - Re-render list, balance, and chart
    - _Requirements: 2.3, 2.4, 2.6, 3.3, 4.2, 8.2_

  - [x] 8.4 Implement `#custom-category-form` submit handler
    - Call `Validator.validateCategory`; on failure show inline error and return
    - On success: push to `AppState.categories`, persist via `StorageService.save` (show banner on failure), re-render category dropdown
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8_

  - [x] 8.5 Implement `#month-selector` change handler and `#sort-select` change handler
    - Month change: update `AppState.activeMonth`, re-render filtered transaction list and monthly total
    - Sort change: update `AppState.sortOrder`, re-render sorted transaction list
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.4_

- [x] 9. Implement responsive layout and accessible styles in `styles.css`
  - Write CSS for layout that renders correctly from 320px to 1920px without horizontal scrolling (use flexbox or CSS grid)
  - Set body font size to minimum 16px; ensure color contrast ratios meet WCAG AA (4.5:1 normal text, 3:1 large text)
  - Set minimum touch target size of 44×44 CSS pixels for all interactive elements (buttons, inputs, dropdowns)
  - Style the warning/error banner, inline error messages, transaction list rows, and chart container
  - _Requirements: 9.2, 9.3, 9.4, 9.6_

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use [fast-check](https://github.com/dubzzz/fast-check) with a minimum of 100 iterations each
- Unit tests cover boundary values and error conditions for `Validator`, `TransactionService`, and `StorageService`
- The entire app ships as three files: `index.html`, `styles.css`, `app.js` — no build step required

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "3.1", "3.2", "4.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "3.3", "3.4", "4.2", "4.3", "4.4", "4.5"] },
    { "id": 2, "tasks": ["4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "6.1", "6.2", "6.3", "6.4", "6.5"] },
    { "id": 3, "tasks": ["6.6", "7.1"] },
    { "id": 4, "tasks": ["7.2", "8.1"] },
    { "id": 5, "tasks": ["7.3", "7.4", "8.2", "8.3", "8.4", "8.5"] }
  ]
}
```
