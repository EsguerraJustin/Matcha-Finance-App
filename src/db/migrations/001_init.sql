-- Matcha Wallet — 001_init
-- Baseline schema from the project brief (Section 8).
--
-- Conventions:
--   * every primary key is a TEXT uuid generated on-device
--   * money is stored as INTEGER centavos (never a float)
--   * calendar dates are TEXT 'YYYY-MM-DD' in Asia/Manila
--   * timestamps are ISO-8601 strings
--   * soft deletes set deleted_at; nothing is ever removed by a plain DELETE
--     except the hard purge in Phase 5

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- settings
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT
);

-- ------------------------------------------------------------- taxonomies
CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY NOT NULL,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL,
  color_key  TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expense_types (
  id          TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_default  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id         TEXT PRIMARY KEY NOT NULL,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_expense_types_category ON expense_types(category_id);

-- ------------------------------------------------------------- allowances
CREATE TABLE IF NOT EXISTS allowances (
  id               TEXT PRIMARY KEY NOT NULL,
  amount_cents     INTEGER NOT NULL,
  received_on      TEXT NOT NULL,
  source           TEXT,
  notes            TEXT,
  recurring_rule_id TEXT REFERENCES recurring_rules(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_allowances_received_on ON allowances(received_on);

-- ----------------------------------------------------------------- budgets
CREATE TABLE IF NOT EXISTS budgets (
  id               TEXT PRIMARY KEY NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('weekly','monthly','custom')),
  name             TEXT NOT NULL,
  amount_cents     INTEGER NOT NULL,
  start_date       TEXT NOT NULL,
  end_date         TEXT NOT NULL,
  rollover_in_cents INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_budgets_range ON budgets(start_date, end_date, is_active);

CREATE TABLE IF NOT EXISTS category_budgets (
  id          TEXT PRIMARY KEY NOT NULL,
  budget_id   TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  limit_cents INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_category_budgets_budget ON category_budgets(budget_id);

-- --------------------------------------------------------------- expenses
CREATE TABLE IF NOT EXISTS expenses (
  id                 TEXT PRIMARY KEY NOT NULL,
  amount_cents       INTEGER NOT NULL,
  spent_on           TEXT NOT NULL,
  category_id        TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  type_id            TEXT REFERENCES expense_types(id) ON DELETE SET NULL,
  payment_method_id  TEXT NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  note               TEXT,
  budget_id          TEXT REFERENCES budgets(id) ON DELETE SET NULL,
  receipt_path       TEXT,
  grocery_list_id    TEXT REFERENCES grocery_lists(id) ON DELETE SET NULL,
  recurring_rule_id  TEXT REFERENCES recurring_rules(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_expenses_spent_on ON expenses(spent_on);
CREATE INDEX IF NOT EXISTS idx_expenses_category  ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_budget    ON expenses(budget_id);
CREATE INDEX IF NOT EXISTS idx_expenses_deleted   ON expenses(deleted_at);

-- ------------------------------------------------------- recurring rules
CREATE TABLE IF NOT EXISTS recurring_rules (
  id                  TEXT PRIMARY KEY NOT NULL,
  kind                TEXT NOT NULL CHECK (kind IN ('expense','allowance')),
  amount_cents        INTEGER NOT NULL,
  category_id         TEXT REFERENCES categories(id) ON DELETE SET NULL,
  type_id             TEXT REFERENCES expense_types(id) ON DELETE SET NULL,
  payment_method_id   TEXT REFERENCES payment_methods(id) ON DELETE SET NULL,
  label               TEXT NOT NULL,
  note                TEXT,
  frequency           TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  interval_n          INTEGER NOT NULL DEFAULT 1,
  day_of_week         INTEGER,
  day_of_month        INTEGER,
  next_due_on         TEXT NOT NULL,
  end_on              TEXT,
  mode                TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto','remind')),
  active              INTEGER NOT NULL DEFAULT 1,
  last_created_on     TEXT,
  created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recurring_due ON recurring_rules(active, next_due_on);

-- --------------------------------------------------------------- groceries
CREATE TABLE IF NOT EXISTS grocery_lists (
  id         TEXT PRIMARY KEY NOT NULL,
  name       TEXT NOT NULL,
  store      TEXT,
  planned_for TEXT,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed')),
  is_template INTEGER NOT NULL DEFAULT 0,
  expense_id TEXT REFERENCES expenses(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_grocery_lists_status ON grocery_lists(status, is_template);

CREATE TABLE IF NOT EXISTS grocery_items (
  id                TEXT PRIMARY KEY NOT NULL,
  list_id           TEXT NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  quantity          REAL NOT NULL DEFAULT 1,
  unit              TEXT,
  est_price_cents   INTEGER NOT NULL DEFAULT 0,
  actual_price_cents INTEGER,
  status            TEXT NOT NULL DEFAULT 'to_buy' CHECK (status IN ('to_buy','purchased')),
  sort_order        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_grocery_items_list ON grocery_items(list_id, status, sort_order);

CREATE TABLE IF NOT EXISTS grocery_price_memory (
  name_normalized  TEXT NOT NULL,
  store            TEXT NOT NULL,
  unit             TEXT,
  last_price_cents INTEGER NOT NULL,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (name_normalized, store)
);

-- -------------------------------------------------------- quick templates
CREATE TABLE IF NOT EXISTS quick_templates (
  id                TEXT PRIMARY KEY NOT NULL,
  label             TEXT NOT NULL,
  amount_cents      INTEGER NOT NULL,
  category_id       TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  type_id           TEXT REFERENCES expense_types(id) ON DELETE SET NULL,
  payment_method_id TEXT NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
  note              TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0
);

-- -------------------------------------------------------- savings goals
CREATE TABLE IF NOT EXISTS savings_goals (
  id                   TEXT PRIMARY KEY NOT NULL,
  name                 TEXT NOT NULL,
  target_cents         INTEGER NOT NULL,
  target_date          TEXT,
  color_key            TEXT NOT NULL,
  reduce_safe_to_spend INTEGER NOT NULL DEFAULT 0,
  archived             INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS savings_contributions (
  id             TEXT PRIMARY KEY NOT NULL,
  goal_id        TEXT NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  amount_cents   INTEGER NOT NULL,
  contributed_on TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_savings_contributions_goal ON savings_contributions(goal_id);

-- --------------------------------------------------------------- streaks
CREATE TABLE IF NOT EXISTS streak_log (
  date TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('logged','no_spend'))
);