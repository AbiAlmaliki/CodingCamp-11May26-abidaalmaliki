// app.js — Expense & Budget Visualizer

// ─── LocalStorage Keys ───────────────────────────────────────────────────────

const EBV_TRANSACTIONS = 'ebv_transactions';
const EBV_CATEGORIES   = 'ebv_categories';

// ─── StorageError ─────────────────────────────────────────────────────────────

class StorageError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause ?? null;
  }
}

// ─── StorageService ───────────────────────────────────────────────────────────

const StorageService = (() => {
  // Cached availability result; null means "not yet probed"
  let _available = null;

  return {
    /**
     * Probes localStorage with a test write on the first call and caches the
     * result. Subsequent calls return the cached value.
     * @returns {boolean}
     */
    isAvailable() {
      if (_available !== null) return _available;

      const TEST_KEY = '__ebv_storage_test__';
      try {
        localStorage.setItem(TEST_KEY, '1');
        localStorage.removeItem(TEST_KEY);
        _available = true;
      } catch {
        _available = false;
      }
      return _available;
    },

    /**
     * Reads and JSON-parses the value stored under `key`.
     * Returns null if the key is missing, the value is null, or parsing fails.
     * @param {string} key
     * @returns {any|null}
     */
    load(key) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },

    /**
     * JSON-serialises `value` and writes it to localStorage under `key`.
     * Throws a StorageError on failure (e.g. quota exceeded, private mode).
     * @param {string} key
     * @param {any} value
     * @throws {StorageError}
     */
    save(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        throw new StorageError(
          `Failed to save data to localStorage (key: "${key}")`,
          err
        );
      }
    },
  };
})();

// ─── Validator ────────────────────────────────────────────────────────────────

const Validator = (() => {
  /**
   * Validates a transaction form submission.
   *
   * Rules:
   *  - name, amount, and category must all be non-empty strings
   *  - name must be ≤ 100 characters
   *  - amount must be a valid number (no non-numeric characters)
   *  - amount must have at most 2 decimal places
   *  - amount must be > 0
   *  - amount must be ≤ 999,999,999.99
   *
   * @param {string} name
   * @param {string} amount  — raw string from the form input
   * @param {string} category
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validateTransaction(name, amount, category) {
    const errors = [];

    // ── Field presence checks ──────────────────────────────────────────────
    if (typeof name !== 'string' || name.trim() === '') {
      errors.push('Item name is required.');
    }

    if (typeof amount !== 'string' || amount.trim() === '') {
      errors.push('Amount is required.');
    }

    if (typeof category !== 'string' || category.trim() === '') {
      errors.push('Category is required.');
    }

    // ── Name length check ──────────────────────────────────────────────────
    if (typeof name === 'string' && name.trim().length > 100) {
      errors.push('Item name must be 100 characters or fewer.');
    }

    // ── Amount validation (only when a non-empty value was provided) ───────
    if (typeof amount === 'string' && amount.trim() !== '') {
      const trimmed = amount.trim();

      // Must be a valid finite number (reject strings like "1e5", "abc", "1.2.3")
      // We use a strict decimal pattern: optional sign, digits, optional single dot + digits
      const numericPattern = /^-?\d+(\.\d+)?$/;
      if (!numericPattern.test(trimmed)) {
        errors.push('Amount must be a valid number.');
      } else {
        const parsed = parseFloat(trimmed);

        // Must be positive
        if (parsed <= 0) {
          errors.push('Amount must be a positive number.');
        }

        // Must not exceed the maximum allowed value
        if (parsed > 999_999_999.99) {
          errors.push('Amount must not exceed 999,999,999.99.');
        }

        // Must have at most 2 decimal places
        const dotIndex = trimmed.indexOf('.');
        if (dotIndex !== -1 && trimmed.length - dotIndex - 1 > 2) {
          errors.push('Amount must have at most 2 decimal places.');
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validates a custom category name against the existing category list.
   * Rejects: empty name, name > 50 characters, case-insensitive duplicate.
   *
   * @param {string}   name               — raw string from the category input
   * @param {string[]} existingCategories — current list of category names
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validateCategory(name, existingCategories) {
    const errors = [];

    // ── Presence check ─────────────────────────────────────────────────────
    if (typeof name !== 'string' || name.trim() === '') {
      errors.push('Category name cannot be empty.');
      return { valid: false, errors };
    }

    const trimmed = name.trim();

    // ── Length check ───────────────────────────────────────────────────────
    if (trimmed.length > 50) {
      errors.push('Category name must be 50 characters or fewer.');
    }

    // ── Case-insensitive duplicate check ───────────────────────────────────
    if (errors.length === 0) {
      const normalised = trimmed.toLowerCase();
      const isDuplicate = Array.isArray(existingCategories) &&
        existingCategories.some((cat) => cat.toLowerCase() === normalised);
      if (isDuplicate) {
        errors.push('This category already exists.');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  return { validateTransaction, validateCategory };
})();

// ─── Default Categories ───────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun', 'Health', 'Other'];

// ─── AppState ─────────────────────────────────────────────────────────────────

/**
 * Single source of truth for all runtime data.
 *
 * @property {Array}  transactions - All recorded expense transactions
 * @property {Array}  categories   - All categories (defaults + custom)
 * @property {string} sortOrder    - Active sort order; defaults to 'default'
 * @property {string} activeMonth  - Currently selected month in 'YYYY-MM' format
 */
const AppState = {
  transactions: StorageService.load(EBV_TRANSACTIONS) ?? [],
  categories:   StorageService.load(EBV_CATEGORIES)   ?? [...DEFAULT_CATEGORIES],
  sortOrder:    'default',
  activeMonth:  (() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  })(),
};


// ─── TransactionService ───────────────────────────────────────────────────────

const TransactionService = {
  /**
   * Creates a new transaction and appends it to AppState.transactions.
   *
   * @param {string} name
   * @param {number} amount
   * @param {string} category
   * @returns {Object} The newly created transaction
   *
   * Validates: Requirements 1.3
   */
  addTransaction(name, amount, category) {
    const transaction = {
      id:       `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      amount,
      category,
      date:     new Date().toISOString().slice(0, 10), // 'YYYY-MM-DD'
    };
    AppState.transactions.push(transaction);
    return transaction;
  },

  /**
   * Removes the transaction with the given id from AppState.transactions.
   *
   * @param {string} id
   * @returns {void}
   *
   * Validates: Requirements 2.4
   */
  deleteTransaction(id) {
    AppState.transactions = AppState.transactions.filter((t) => t.id !== id);
  },

  /**
   * Returns a filtered and sorted copy of the provided transaction array.
   *
   * Filtering: only transactions whose date starts with `month` ('YYYY-MM').
   * Sorting:
   *   - 'amount-asc'   → ascending by amount  (stable tie-break by insertion order)
   *   - 'amount-desc'  → descending by amount (stable tie-break by insertion order)
   *   - 'category-az'  → ascending alphabetically by category (stable)
   *   - 'default'      → insertion order (no sort applied)
   *
   * @param {Object[]} transactions
   * @param {string}   month      — 'YYYY-MM'
   * @param {string}   sortOrder  — 'default' | 'amount-asc' | 'amount-desc' | 'category-az'
   * @returns {Object[]}
   *
   * Validates: Requirements 6.2, 7.2, 7.3, 7.5
   */
  getFilteredAndSorted(transactions, month, sortOrder) {
    // Filter by month prefix
    const filtered = transactions.filter((t) => t.date.startsWith(month));

    // Sort (Array.prototype.sort is stable in all modern engines; ES2019+)
    if (sortOrder === 'amount-asc') {
      return filtered.slice().sort((a, b) => a.amount - b.amount);
    }
    if (sortOrder === 'amount-desc') {
      return filtered.slice().sort((a, b) => b.amount - a.amount);
    }
    if (sortOrder === 'category-az') {
      return filtered.slice().sort((a, b) =>
        a.category.localeCompare(b.category)
      );
    }
    // 'default' — preserve insertion order
    return filtered.slice();
  },

  /**
   * Returns the arithmetic sum of all `amount` values in the array.
   * Returns 0 for an empty array.
   *
   * @param {Object[]} transactions
   * @returns {number}
   *
   * Validates: Requirements 3.1, 3.5
   */
  calculateTotal(transactions) {
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  },
};

// ─── Renderer ─────────────────────────────────────────────────────────────────

const Renderer = (() => {
  /** Shared currency formatter (id-ID, IDR). */
  const _fmt = new Intl.NumberFormat('id-ID', { 
    style: 'currency', 
    currency: 'IDR',
    minimumFractionDigits: 0
  });

  return {
    // ── 6.1 ─────────────────────────────────────────────────────────────────

    /**
     * Updates the Total Balance display.
     *
     * @param {number} total — sum of all transaction amounts
     *
     * Validates: Requirements 3.4, 3.5
     */
    renderBalance(total) {
      const el = document.getElementById('balance-display');
      if (!el) return;
      el.textContent = _fmt.format(total);
    },

    /**
     * Updates the Monthly Summary total display.
     *
     * @param {number}  total           — sum of filtered transaction amounts
     * @param {boolean} hasTransactions — true when at least one transaction exists for the month
     *
     * Validates: Requirements 3.5, 6.3
     */
    renderMonthlyTotal(total, hasTransactions) {
      const el = document.getElementById('monthly-total-display');
      if (!el) return;
      if (!hasTransactions) {
        el.textContent = _fmt.format(0);
      } else {
        el.textContent = _fmt.format(total);
      }
    },

    // ── 6.2 ─────────────────────────────────────────────────────────────────

    /**
     * Fully re-renders the transaction list.
     *
     * @param {Object[]} transactions — already-filtered (and sorted) array
     * @param {boolean}  [globalEmpty=false] — true when there are NO transactions at all
     *                                         (as opposed to none for the current filter period)
     *
     * Validates: Requirements 2.1, 2.2, 2.5, 6.4
     */
    renderTransactionList(transactions, globalEmpty = false) {
      const list = document.getElementById('transaction-list');
      if (!list) return;

      // Clear existing content
      list.innerHTML = '';

      if (transactions.length === 0) {
        const li = document.createElement('li');
        li.className = 'transaction-empty';
        li.textContent = globalEmpty
          ? 'No transactions yet.'
          : 'No transactions for this period.';
        list.appendChild(li);
        return;
      }

      transactions.forEach((t) => {
        const li = document.createElement('li');
        li.className = 'transaction-item';
        li.dataset.id = t.id;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'transaction-name';
        nameSpan.textContent = t.name;

        const amountSpan = document.createElement('span');
        amountSpan.className = 'transaction-amount';
        amountSpan.textContent = _fmt.format(t.amount);

        const categorySpan = document.createElement('span');
        categorySpan.className = 'transaction-category';
        categorySpan.textContent = t.category;

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-btn';
        deleteBtn.dataset.id = t.id;
        deleteBtn.setAttribute('aria-label', `Delete transaction: ${t.name}`);
        deleteBtn.textContent = 'Delete';

        li.appendChild(nameSpan);
        li.appendChild(amountSpan);
        li.appendChild(categorySpan);
        li.appendChild(deleteBtn);

        list.appendChild(li);
      });
    },

    // ── 6.3 ─────────────────────────────────────────────────────────────────

    /**
     * Populates the category <select> with the provided categories.
     * Resets the dropdown to the first option.
     *
     * @param {string[]} categories
     *
     * Validates: Requirements 1.1, 1.6, 5.2
     */
    renderCategoryDropdown(categories) {
      const select = document.getElementById('category');
      if (!select) return;

      // Preserve current selection index so we can reset to first after rebuild
      select.innerHTML = '';

      categories.forEach((cat) => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
      });

      // Reset to first option (requirement 1.6 — reset after successful submission)
      select.selectedIndex = 0;
    },

    // ── 6.4 ─────────────────────────────────────────────────────────────────

    /**
     * Injects an error message into the error container associated with `fieldId`
     * via the field's `aria-describedby` attribute.
     *
     * @param {string} fieldId  — the `id` of the form field (e.g. 'item-name')
     * @param {string} message  — the error text to display
     *
     * Validates: Requirements 1.4, 1.5, 1.7, 1.8, 5.3, 5.4, 5.5
     */
    showError(fieldId, message) {
      const field = document.getElementById(fieldId);
      if (!field) return;

      const errorId = field.getAttribute('aria-describedby');
      if (!errorId) return;

      const errorEl = document.getElementById(errorId);
      if (!errorEl) return;

      errorEl.textContent = message;

      // Mark the field as invalid for CSS styling and screen readers
      if (message) {
        field.setAttribute('aria-invalid', 'true');
      } else {
        field.removeAttribute('aria-invalid');
      }
    },

    /**
     * Clears all inline error messages across all known error containers.
     * Called on the next successful form submission.
     *
     * Validates: Requirements 1.4, 1.5, 1.7, 1.8, 5.3, 5.4, 5.5
     */
    clearErrors() {
      const errorEls = document.querySelectorAll('.error-message');
      errorEls.forEach((el) => {
        el.textContent = '';
      });
      // Remove aria-invalid from all form fields
      document.querySelectorAll('[aria-invalid]').forEach((el) => {
        el.removeAttribute('aria-invalid');
      });
    },

    // ── 6.5 ─────────────────────────────────────────────────────────────────

    /**
     * Displays a persistent banner at the top of the page.
     *
     * @param {string} message          — the text to display
     * @param {'warning'|'error'} type  — controls the visual style via CSS class
     *
     * Validates: Requirements 8.5, 5.8
     */
    showBanner(message, type) {
      const banner = document.getElementById('app-banner');
      if (!banner) return;

      banner.textContent = message;
      // Remove any previous type classes before applying the new one
      banner.classList.remove('banner-warning', 'banner-error');
      banner.classList.add(`banner-${type}`);
      banner.hidden = false;
    },

    /**
     * Hides the persistent banner.
     *
     * Validates: Requirements 8.5, 5.8
     */
    hideBanner() {
      const banner = document.getElementById('app-banner');
      if (!banner) return;
      banner.hidden = true;
      banner.textContent = '';
      banner.classList.remove('banner-warning', 'banner-error');
    },
  };
})();

// ─── ChartService ─────────────────────────────────────────────────────────────

/** Module-level Chart.js instance; null until init() is called. */
let _chart = null;

const ChartService = {
  /**
   * Creates the Chart.js pie chart instance and attaches it to the given canvas.
   * If Chart.js failed to load (CDN failure), shows the fallback message instead.
   *
   * @param {string} canvasId — the `id` of the <canvas> element
   * @returns {void}
   *
   * Validates: Requirements 4.1
   */
  init(canvasId) {
    // Guard: Chart.js not loaded (CDN failure or blocked)
    if (typeof window.Chart === 'undefined') {
      const fallback = document.getElementById('chart-fallback');
      const canvas   = document.getElementById(canvasId);
      if (fallback) fallback.hidden = false;
      if (canvas)   canvas.hidden   = true;
      return;
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    _chart = new window.Chart(canvas, {
      type: 'pie',
      data: {
        labels:   [],
        datasets: [
          {
            data:            [],
            backgroundColor: [],
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display:  true,
            position: 'bottom',
          },
        },
      },
    });
  },

  /**
   * Aggregates transaction amounts by category and updates the pie chart in-place.
   * Hides the canvas and shows the "no data" message when transactions is empty;
   * shows the canvas otherwise.
   *
   * @param {Object[]} transactions — array of transaction objects to visualise
   * @returns {void}
   *
   * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6
   */
  update(transactions) {
    const PALETTE = [
      '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
      '#FF9F40', '#C9CBCF', '#7BC8A4', '#E8A838', '#A78BFA',
    ];

    const canvas  = document.getElementById('chart-canvas');
    const noData  = document.getElementById('chart-no-data');

    // ── No transactions: hide chart, show "no data" message ───────────────
    if (!transactions || transactions.length === 0) {
      if (canvas)  canvas.hidden  = true;
      if (noData)  noData.hidden  = false;
      return;
    }

    // ── Has transactions: show chart, hide "no data" message ──────────────
    if (canvas)  canvas.hidden  = false;
    if (noData)  noData.hidden  = true;

    // Guard: chart instance not yet created (Chart.js unavailable)
    if (!_chart) return;

    // ── Aggregate amounts by category ─────────────────────────────────────
    const totals = {};
    transactions.forEach((t) => {
      totals[t.category] = (totals[t.category] ?? 0) + t.amount;
    });

    const labels = Object.keys(totals);
    const data   = labels.map((cat) => totals[cat]);
    const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);

    // ── Update chart in-place (no destroy/recreate) ───────────────────────
    _chart.data = {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
        },
      ],
    };
    _chart.update();
  },
};

// ─── DOMContentLoaded ─────────────────────────────────────────────────────────

/**
 * Bootstraps the application once the DOM is ready.
 *
 * Validates: Requirements 6.5, 8.3, 8.4, 8.5, 8.6
 */
document.addEventListener('DOMContentLoaded', () => {

  // ── 1. Check localStorage availability ──────────────────────────────────
  if (!StorageService.isAvailable()) {
    Renderer.showBanner(
      'localStorage is unavailable. Your data will not be saved this session.',
      'warning'
    );
  }

  // ── 2. Load transactions ─────────────────────────────────────────────────
  const rawTransactions = StorageService.load(EBV_TRANSACTIONS);

  if (rawTransactions !== null && !Array.isArray(rawTransactions)) {
    // Corrupt data: non-null but not an array
    localStorage.removeItem(EBV_TRANSACTIONS);
    Renderer.showBanner(
      'Saved data was unreadable and has been cleared.',
      'warning'
    );
    AppState.transactions = [];
  } else {
    AppState.transactions = rawTransactions ?? [];
  }

  // ── 3. Load categories ───────────────────────────────────────────────────
  const rawCategories = StorageService.load(EBV_CATEGORIES);

  if (Array.isArray(rawCategories) && rawCategories.length > 0) {
    AppState.categories = rawCategories;
  } else {
    // Missing, null, corrupt (non-array), or empty — fall back to defaults
    AppState.categories = [...DEFAULT_CATEGORIES];
  }

  // ── 4. Set active month to current month ─────────────────────────────────
  const now  = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  AppState.activeMonth = `${yyyy}-${mm}`;

  const monthSelector = document.getElementById('month-selector');
  if (monthSelector) {
    monthSelector.value = AppState.activeMonth;
  }

  // ── 5. Initialise the chart ───────────────────────────────────────────────
  ChartService.init('chart-canvas');

  // ── 6. Compute derived values for initial render ─────────────────────────
  const filteredTransactions = TransactionService.getFilteredAndSorted(
    AppState.transactions,
    AppState.activeMonth,
    AppState.sortOrder
  );

  const allTotal      = TransactionService.calculateTotal(AppState.transactions);
  const filteredTotal = TransactionService.calculateTotal(filteredTransactions);
  const globalEmpty   = AppState.transactions.length === 0;

  // ── 7. Render all UI regions ──────────────────────────────────────────────
  Renderer.renderCategoryDropdown(AppState.categories);
  Renderer.renderBalance(allTotal);
  Renderer.renderMonthlyTotal(filteredTotal, filteredTransactions.length > 0);
  Renderer.renderTransactionList(filteredTransactions, globalEmpty);
  ChartService.update(filteredTransactions);

  // ── 8.2 Transaction form submit handler ──────────────────────────────────
  const transactionForm = document.getElementById('transaction-form');
  if (transactionForm) {
    transactionForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const nameInput     = document.getElementById('item-name');
      const amountInput   = document.getElementById('amount');
      const categoryInput = document.getElementById('category');

      const nameVal     = nameInput     ? nameInput.value     : '';
      const amountVal   = amountInput   ? amountInput.value   : '';
      const categoryVal = categoryInput ? categoryInput.value : '';

      const result = Validator.validateTransaction(nameVal, amountVal, categoryVal);

      Renderer.clearErrors();

      if (!result.valid) {
        result.errors.forEach((msg) => {
          const lower = msg.toLowerCase();
          if (lower.includes('name')) {
            Renderer.showError('item-name', msg);
          } else if (lower.includes('amount')) {
            Renderer.showError('amount', msg);
          } else if (lower.includes('category')) {
            Renderer.showError('category', msg);
          } else {
            // Fallback: show on item-name field
            Renderer.showError('item-name', msg);
          }
        });
        return;
      }

      // Valid — add transaction to state
      TransactionService.addTransaction(nameVal.trim(), parseFloat(amountVal), categoryVal);

      // Persist to localStorage
      try {
        StorageService.save(EBV_TRANSACTIONS, AppState.transactions);
      } catch (err) {
        if (err instanceof StorageError) {
          Renderer.showBanner(
            'Your data could not be saved. Storage may be full.',
            'warning'
          );
        }
      }

      // Re-render with current filter + sort
      const filtered = TransactionService.getFilteredAndSorted(
        AppState.transactions,
        AppState.activeMonth,
        AppState.sortOrder
      );
      const gEmpty = AppState.transactions.length === 0;

      Renderer.renderTransactionList(filtered, gEmpty);
      Renderer.renderBalance(TransactionService.calculateTotal(AppState.transactions));
      Renderer.renderMonthlyTotal(
        TransactionService.calculateTotal(filtered),
        filtered.length > 0
      );
      ChartService.update(filtered);

      // Reset form
      transactionForm.reset();
      Renderer.renderCategoryDropdown(AppState.categories);
    });
  }

  // ── 8.3 Delegated delete button click handler ─────────────────────────────
  const transactionList = document.getElementById('transaction-list');
  if (transactionList) {
    transactionList.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-btn')) return;

      const id = e.target.dataset.id;
      if (!id) return;

      // Save a reference to the transaction before deleting (for rollback)
      const txToDelete = AppState.transactions.find((t) => t.id === id);
      if (!txToDelete) return;

      TransactionService.deleteTransaction(id);

      // Persist to localStorage
      try {
        StorageService.save(EBV_TRANSACTIONS, AppState.transactions);
      } catch (err) {
        if (err instanceof StorageError) {
          // Rollback: re-add the transaction to state
          AppState.transactions.push(txToDelete);
          Renderer.showBanner(
            'Your data could not be saved. Storage may be full.',
            'warning'
          );
          return; // Do not re-render — list is unchanged
        }
      }

      // Re-render with current filter + sort
      const filtered = TransactionService.getFilteredAndSorted(
        AppState.transactions,
        AppState.activeMonth,
        AppState.sortOrder
      );
      const gEmpty = AppState.transactions.length === 0;

      Renderer.renderTransactionList(filtered, gEmpty);
      Renderer.renderBalance(TransactionService.calculateTotal(AppState.transactions));
      Renderer.renderMonthlyTotal(
        TransactionService.calculateTotal(filtered),
        filtered.length > 0
      );
      ChartService.update(filtered);
    });
  }

  // ── 8.4 Custom category form submit handler ───────────────────────────────
  const customCategoryForm = document.getElementById('custom-category-form');
  if (customCategoryForm) {
    customCategoryForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const categoryNameInput = document.getElementById('custom-category-name');
      const categoryNameVal   = categoryNameInput ? categoryNameInput.value : '';

      const result = Validator.validateCategory(categoryNameVal, AppState.categories);

      // Clear previous inline error
      Renderer.showError('custom-category-name', '');

      if (!result.valid) {
        Renderer.showError('custom-category-name', result.errors[0]);
        return;
      }

      // Valid — add to categories
      AppState.categories.push(categoryNameVal.trim());

      // Persist to localStorage
      try {
        StorageService.save(EBV_CATEGORIES, AppState.categories);
      } catch (err) {
        if (err instanceof StorageError) {
          Renderer.showBanner(
            'The category could not be saved. Storage may be full.',
            'warning'
          );
        }
      }

      // Re-render category dropdown
      Renderer.renderCategoryDropdown(AppState.categories);

      // Reset the custom category form
      customCategoryForm.reset();
    });
  }

  // ── 8.5 Month selector change handler ────────────────────────────────────
  const monthSelectorEl = document.getElementById('month-selector');
  if (monthSelectorEl) {
    monthSelectorEl.addEventListener('change', () => {
      AppState.activeMonth = monthSelectorEl.value;

      const filtered = TransactionService.getFilteredAndSorted(
        AppState.transactions,
        AppState.activeMonth,
        AppState.sortOrder
      );
      const gEmpty = AppState.transactions.length === 0;

      Renderer.renderTransactionList(filtered, gEmpty);
      Renderer.renderMonthlyTotal(
        TransactionService.calculateTotal(filtered),
        filtered.length > 0
      );
    });
  }

  // ── 8.5 Sort select change handler ───────────────────────────────────────
  const sortSelectEl = document.getElementById('sort-select');
  if (sortSelectEl) {
    sortSelectEl.addEventListener('change', () => {
      AppState.sortOrder = sortSelectEl.value;

      const filtered = TransactionService.getFilteredAndSorted(
        AppState.transactions,
        AppState.activeMonth,
        AppState.sortOrder
      );
      const gEmpty = AppState.transactions.length === 0;

      Renderer.renderTransactionList(filtered, gEmpty);
    });
  }
});
