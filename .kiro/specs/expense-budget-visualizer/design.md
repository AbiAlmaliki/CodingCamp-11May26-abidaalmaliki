# Design Document: Expense & Budget Visualizer

## Overview

The Expense & Budget Visualizer is a zero-dependency, client-side single-page application (SPA) built with plain HTML, CSS, and Vanilla JavaScript. It runs entirely in the browser with no build step, no server, and no external runtime dependencies beyond Chart.js (loaded via CDN). All data is persisted in the browser's `localStorage` API.

The app allows users to:
- Record expense transactions (name, amount, category)
- View a running total balance
- Visualize spending by category in a live-updating pie chart
- Define custom spending categories
- Filter transactions by calendar month
- Sort the transaction list by various criteria

The design prioritizes simplicity, correctness, and accessibility. The entire application ships as three files: `index.html`, `styles.css`, and `app.js`.

---

## Architecture

The application follows a **unidirectional data flow** pattern without a framework. All state lives in a single in-memory `AppState` object. Every user action mutates state, persists to `localStorage`, and triggers a re-render of the affected UI regions.

```
User Action
    │
    ▼
Event Handler (app.js)
    │
    ├─► Validator (validate input)
    │       │
    │       └─► Display inline error (on failure)
    │
    ├─► State Mutation (update AppState)
    │
    ├─► Persistence (write to localStorage)
    │       │
    │       └─► Display warning banner (on failure)
    │
    └─► Render (update DOM + Chart.js)
```

### Key Architectural Decisions

- **No framework**: Vanilla JS keeps the bundle zero-dependency and the app usable as a browser extension popup without CSP issues.
- **Single state object**: All mutable data (`transactions`, `categories`, `sortOrder`, `activeMonth`) lives in one place, making state transitions predictable.
- **Immutable IDs**: Each transaction gets a UUID-like ID generated at creation time (`Date.now() + Math.random()`), used as the stable key for deletion.
- **Chart.js via CDN**: Loaded from `https://cdn.jsdelivr.net/npm/chart.js@4` with a `<script>` tag. The chart instance is stored in a module-level variable and updated via `chart.data = ...` + `chart.update()` rather than destroying and recreating it on every change.
- **Defensive localStorage access**: All reads and writes are wrapped in `try/catch`. A `StorageService` abstraction handles availability detection and error surfacing.

---

## Components and Interfaces

The application is divided into logical modules within `app.js`, each with a clear responsibility.

### 1. `StorageService`

Handles all `localStorage` interactions.

```js
StorageService = {
  isAvailable(): boolean,
  load(key: string): any | null,       // returns parsed JSON or null
  save(key: string, value: any): void, // throws StorageError on failure
}
```

- `isAvailable()` probes `localStorage` with a test write on first call and caches the result.
- `load()` wraps `JSON.parse(localStorage.getItem(key))` in a `try/catch`; returns `null` on parse failure.
- `save()` wraps `localStorage.setItem(key, JSON.stringify(value))` in a `try/catch`; throws a typed `StorageError` on failure so callers can surface a warning.

### 2. `Validator`

Pure functions that validate user input. Returns `{ valid: boolean, errors: string[] }`.

```js
Validator = {
  validateTransaction(name: string, amount: string, category: string): ValidationResult,
  validateCategory(name: string, existingCategories: string[]): ValidationResult,
}
```

- `validateTransaction` checks: non-empty fields, name length ≤ 100, amount is a valid positive number ≤ 999,999,999.99 with at most 2 decimal places.
- `validateCategory` checks: non-empty, length ≤ 50, no case-insensitive duplicate in `existingCategories`.

### 3. `AppState`

The single source of truth for all runtime data.

```js
AppState = {
  transactions: Transaction[],
  categories: string[],       // includes defaults + custom
  sortOrder: SortOrder,       // 'default' | 'amount-asc' | 'amount-desc' | 'category-az'
  activeMonth: string,        // 'YYYY-MM' format
}
```

### 4. `TransactionService`

Business logic for transaction operations.

```js
TransactionService = {
  addTransaction(name: string, amount: number, category: string): Transaction,
  deleteTransaction(id: string): void,
  getFilteredAndSorted(transactions: Transaction[], month: string, sortOrder: SortOrder): Transaction[],
  calculateTotal(transactions: Transaction[]): number,
}
```

### 5. `ChartService`

Manages the Chart.js pie chart instance.

```js
ChartService = {
  init(canvasId: string): void,
  update(transactions: Transaction[]): void,
  destroy(): void,
}
```

- `init()` creates the Chart.js instance once on page load.
- `update()` aggregates transaction amounts by category and calls `chart.data = newData; chart.update()`.
- When all transactions are deleted, `update()` hides the canvas and shows the "no data" message.

### 6. `Renderer`

DOM manipulation functions. Each function is idempotent — it fully re-renders its target region.

```js
Renderer = {
  renderTransactionList(transactions: Transaction[]): void,
  renderBalance(total: number): void,
  renderCategoryDropdown(categories: string[]): void,
  renderMonthlyTotal(total: number, hasTransactions: boolean): void,
  showError(fieldId: string, message: string): void,
  clearErrors(): void,
  showBanner(message: string, type: 'warning' | 'error'): void,
  hideBanner(): void,
}
```

### 7. Event Handlers (top-level in `app.js`)

Wire DOM events to the above services:

| Event | Handler |
|---|---|
| `#transaction-form` submit | Validate → add transaction → persist → render |
| `#delete-btn` click (delegated) | Delete transaction → persist → render |
| `#custom-category-form` submit | Validate → add category → persist → render dropdown |
| `#month-selector` change | Update `activeMonth` → render filtered list + monthly total |
| `#sort-select` change | Update `sortOrder` → render sorted list |
| `DOMContentLoaded` | Load from storage → init chart → render all |

---

## Data Models

### `Transaction`

```js
{
  id: string,          // unique identifier: `${Date.now()}-${Math.random().toString(36).slice(2)}`
  name: string,        // 1–100 characters
  amount: number,      // positive float, max 2 decimal places, max 999,999,999.99
  category: string,    // must match a value in AppState.categories
  date: string,        // ISO 8601 date string: 'YYYY-MM-DD' (date of addition)
}
```

### `Category`

Categories are stored as a plain `string[]` in `localStorage` under the key `"ebv_categories"`. The default categories (`Food`, `Transport`, `Fun`, `Health`, `Other`) are seeded at app init if no saved categories exist.

### `SortOrder`

```js
type SortOrder = 'default' | 'amount-asc' | 'amount-desc' | 'category-az'
```

### LocalStorage Keys

| Key | Value Type | Description |
|---|---|---|
| `ebv_transactions` | `Transaction[]` (JSON) | All stored transactions |
| `ebv_categories` | `string[]` (JSON) | All categories including custom ones |

### Currency Formatting

All monetary values are formatted using the browser's `Intl.NumberFormat` API:

```js
new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
```

This produces values like `$12.50` and `$1,234.00` consistently across browsers.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Valid transaction addition grows the list

*For any* transaction list and any valid transaction input (non-empty name ≤ 100 chars, positive amount ≤ 999,999,999.99 with ≤ 2 decimal places, non-empty category), adding the transaction SHALL result in the transaction list length increasing by exactly 1.

**Validates: Requirements 1.3**

### Property 2: Invalid transaction input is rejected

*For any* transaction input where at least one field is empty, the amount is ≤ 0, the name exceeds 100 characters, or the amount has more than 2 decimal places, the Validator SHALL reject the input and the transaction list SHALL remain unchanged.

**Validates: Requirements 1.4, 1.5, 1.7, 1.8**

### Property 3: Transaction addition round-trip persistence

*For any* valid transaction added to the app, reading `ebv_transactions` from `localStorage` and parsing it SHALL yield an array containing an entry with the same `name`, `amount`, and `category` as the added transaction.

**Validates: Requirements 8.1**

### Property 4: Transaction deletion removes from list and storage

*For any* transaction list containing at least one transaction, deleting a transaction by its `id` SHALL result in: (a) the transaction no longer appearing in the rendered list, and (b) `localStorage` no longer containing an entry with that `id`.

**Validates: Requirements 2.4, 8.2**

### Property 5: Balance equals sum of all transaction amounts

*For any* set of transactions, the displayed balance SHALL equal the arithmetic sum of all transaction `amount` values, formatted as a currency string.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 6: Monthly filter returns only matching transactions

*For any* transaction list and any selected month `YYYY-MM`, the filtered view SHALL contain only transactions whose `date` field starts with `YYYY-MM`, and the monthly total SHALL equal the sum of those transactions' amounts.

**Validates: Requirements 6.2, 6.3**

### Property 7: Sort order is stable and correct

*For any* transaction list sorted by "Amount (Low to High)", the resulting sequence SHALL be non-decreasing by `amount`, and for any two transactions with equal amounts, the one with the earlier insertion order SHALL appear first.

**Validates: Requirements 7.2, 7.3**

### Property 8: Custom category uniqueness (case-insensitive)

*For any* existing category list and any new category name, if a case-insensitive match already exists in the list, the Validator SHALL reject the addition and the category list SHALL remain unchanged.

**Validates: Requirements 5.4**

### Property 9: Custom category persistence round-trip

*For any* valid custom category added by the user, reading `ebv_categories` from `localStorage` and parsing it SHALL yield an array containing that category name.

**Validates: Requirements 5.6, 5.7**

### Property 10: Pie chart categories match transaction data

*For any* transaction list, the set of category labels in the pie chart SHALL equal the set of distinct categories present in the transaction list, and each slice value SHALL equal the sum of amounts for that category.

**Validates: Requirements 4.1, 4.2, 4.6**

### Property 11: Currency formatting is always valid

*For any* non-negative number representing a transaction amount or balance, the formatted output SHALL be a string matching the pattern of a valid USD currency value (dollar sign, digits, comma separators, and exactly two decimal places).

**Validates: Requirements 2.1, 3.4**

### Property 12: Default sort preserves insertion order

*For any* transaction list displayed with the "Default (Date Added)" sort option active, the rendered order SHALL match the order in which transactions were added (i.e., sorted by `id` / creation timestamp ascending).

**Validates: Requirements 7.5**

### Property 13: Chart category colors are distinct

*For any* set of up to 10 active categories, the color assigned to each category SHALL be distinct from all other assigned colors.

**Validates: Requirements 4.3**

---

## Error Handling

### LocalStorage Unavailable

Detected at app startup via a probe write in `StorageService.isAvailable()`. If unavailable:
- A persistent warning banner is shown at the top of the page.
- The app continues to function in-session using only in-memory `AppState`.
- All write operations are silently skipped (no further errors thrown).

### LocalStorage Write Failure

If `StorageService.save()` throws (e.g., quota exceeded):
- The in-memory state is already updated (the operation succeeded in memory).
- A warning banner is displayed: "Your data could not be saved. Storage may be full."
- The UI reflects the in-memory state (transaction appears in list, but may not persist after reload).

### Corrupt LocalStorage Data

On app load, if `JSON.parse` fails for `ebv_transactions`:
- The corrupt key is cleared from `localStorage`.
- A warning message is displayed: "Saved data was unreadable and has been cleared."
- The app initializes with an empty transaction list.
- Categories are loaded independently; a corrupt categories key falls back to defaults.

### Validation Errors

Inline error messages are rendered adjacent to the offending field using `aria-describedby` for screen reader accessibility. Errors are cleared on the next successful submission or when the user modifies the field.

### Chart.js Load Failure

If the Chart.js CDN script fails to load (offline, blocked):
- The chart canvas area displays a static fallback message: "Chart unavailable — please check your connection."
- All other app functionality (form, list, balance, persistence) continues to work normally.

---

## Testing Strategy

### PBT Applicability Assessment

This feature is a client-side app with pure validation logic, data transformation (filtering, sorting, aggregation), and serialization (JSON round-trips to `localStorage`). These are well-suited for property-based testing. UI rendering and Chart.js integration are not suitable for PBT and will use example-based tests instead.

### Unit Tests (Example-Based)

Target the `Validator` and `TransactionService` modules with concrete examples:

- Validator rejects empty name, zero amount, name > 100 chars, amount > 2 decimal places
- Validator accepts boundary values (name = 100 chars, amount = 0.01, amount = 999999999.99)
- `TransactionService.getFilteredAndSorted` returns correct subset for a given month
- `TransactionService.calculateTotal` returns 0 for empty list
- `StorageService.load` returns `null` for missing key and for corrupt JSON
- `Renderer.renderBalance` formats `0` as `$0.00` and `1234.5` as `$1,234.50`

### Property-Based Tests

Use [fast-check](https://github.com/dubzzz/fast-check) (loaded via CDN or npm for test environment). Each property test runs a minimum of **100 iterations**.

Tag format: `Feature: expense-budget-visualizer, Property {N}: {property_text}`

| Property | Test Description |
|---|---|
| Property 1 | Generate random valid transactions; verify list grows by 1 each time |
| Property 2 | Generate random invalid inputs; verify Validator always rejects and list is unchanged |
| Property 3 | Generate random valid transactions; add each; verify localStorage round-trip |
| Property 4 | Generate random transaction lists; delete random entry; verify removal from list and storage |
| Property 5 | Generate random transaction sets; verify `calculateTotal` equals `amounts.reduce((s,a) => s+a, 0)` |
| Property 6 | Generate random transactions across multiple months; verify filter returns only correct month |
| Property 7 | Generate random transaction lists; sort by amount-asc; verify non-decreasing order with stable tie-breaking |
| Property 8 | Generate random category lists and candidate names; verify case-insensitive duplicate rejection |
| Property 9 | Generate random valid category names; add each; verify localStorage round-trip |
| Property 10 | Generate random transaction sets; verify chart data labels and values match aggregated category totals |
| Property 11 | Generate random non-negative amounts; verify formatted output matches USD currency pattern |
| Property 12 | Generate random transaction lists; verify default sort returns them in insertion order |
| Property 13 | Generate sets of 1–10 categories; verify all assigned colors are distinct |

### Integration / Smoke Tests

- App loads from `index.html` in a real browser (Chrome, Firefox) with no console errors
- Chart.js renders a pie chart after adding 3 transactions across 2 categories
- Refreshing the page restores all transactions and categories from `localStorage`
- App renders correctly at 320px, 768px, and 1920px viewport widths (visual check)
- All interactive elements meet the 44×44px touch target requirement (DevTools audit)

### Accessibility Checks

- Run axe-core or Lighthouse accessibility audit; target zero critical violations
- Verify all form fields have associated `<label>` elements
- Verify error messages are linked via `aria-describedby`
- Verify color contrast ratios meet WCAG AA (4.5:1 for normal text, 3:1 for large text)
