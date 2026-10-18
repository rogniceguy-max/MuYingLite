import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = path.resolve(__dirname, '../../..')
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT_DIR, 'data')
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')

fs.mkdirSync(UPLOADS_DIR, { recursive: true })

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'))

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    metadata_revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS deletion_batches (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    kind TEXT NOT NULL CHECK (kind IN ('row', 'sheet', 'media')),
    status TEXT NOT NULL CHECK (status IN ('active', 'restored', 'purged')),
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    restored_at TEXT,
    purged_at TEXT
  );

  CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    number INTEGER NOT NULL,
    title TEXT,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    deletion_batch_id TEXT REFERENCES deletion_batches(id)
  );

  CREATE TABLE IF NOT EXISTS sheets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    kind TEXT NOT NULL CHECK (kind IN ('beat', 'asset')),
    episode_id TEXT REFERENCES episodes(id),
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    metadata_revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    deletion_batch_id TEXT REFERENCES deletion_batches(id),
    CHECK (
      (kind = 'beat' AND episode_id IS NOT NULL)
      OR
      (kind = 'asset' AND episode_id IS NULL)
    )
  );

  CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    kind TEXT NOT NULL CHECK (kind IN ('video', 'image')),
    display_name TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    checksum_sha256 TEXT,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    status TEXT NOT NULL CHECK (status IN ('uploading', 'processing', 'ready', 'failed')),
    processing_error TEXT,
    thumbnail_key TEXT,
    proxy_key TEXT,
    linked_once INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    deletion_batch_id TEXT REFERENCES deletion_batches(id)
  );

  CREATE TABLE IF NOT EXISTS media_links (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    asset_id TEXT NOT NULL REFERENCES media_assets(id),
    sheet_id TEXT NOT NULL REFERENCES sheets(id),
    row_id TEXT NOT NULL,
    column_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('video', 'selected', 'alternate')),
    position INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT,
    deletion_batch_id TEXT REFERENCES deletion_batches(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sheet_docs (
    sheet_id TEXT PRIMARY KEY,
    state BLOB NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_one_asset_sheet
    ON sheets(project_id) WHERE kind = 'asset' AND deleted_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_one_beat_sheet
    ON sheets(episode_id) WHERE kind = 'beat' AND deleted_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_episode_number
    ON episodes(project_id, number) WHERE deleted_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_media_selected_unique
    ON media_links(row_id, column_id) WHERE role = 'selected' AND deleted_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_media_link_unique
    ON media_links(row_id, column_id, role, asset_id) WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_sheets_project ON sheets(project_id, position);
  CREATE INDEX IF NOT EXISTS idx_episodes_project ON episodes(project_id, position);
  CREATE INDEX IF NOT EXISTS idx_media_project ON media_assets(project_id, kind, status);
  CREATE INDEX IF NOT EXISTS idx_media_links_asset ON media_links(asset_id, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_media_links_sheet ON media_links(sheet_id, row_id);
  CREATE INDEX IF NOT EXISTS idx_batches_project ON deletion_batches(project_id, status, created_at);
`)

export function nowIso(): string {
  return new Date().toISOString()
}

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export type DbRow = Record<string, any>
