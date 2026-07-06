CREATE TABLE IF NOT EXISTS monitor_state (
    key VARCHAR(255) PRIMARY KEY,
    value BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS monitors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    method TEXT NOT NULL,
    target TEXT NOT NULL,
    config TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
