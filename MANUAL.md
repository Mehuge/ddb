# ddb — De-Duplicating Backup Manual

ddb is a hash-based de-duplicating backup tool. Files are stored by their SHA-256 hash,
so identical files across multiple backups or sources are only ever stored once.

Backups can target a **local folder** or a **remote ddb server** over HTTP/HTTPS.

---

## Quick Start

```
ddb backup \path\to\dest .
```

That's it. Backs up the current directory to `\path\to\dest`. On first run the destination
is created and initialised automatically.

---

## Destination

Every command takes a destination as its first positional argument, or via `--dest` / `--to`.

```
ddb <command> <destination> [options]
ddb <command> --dest <destination> [options]
ddb <command> --to <destination> [options]
```

A destination is either:
- A **local path**: `C:\Backups\MyBackup` or `/mnt/backup/mybackup`
- A **remote server**: `http://hostname:4444/` or `https://hostname:4443/`

---

## Commands

### `backup` — Back up files

```
ddb backup <destination> [options]
```

**Simplest possible backup — current directory:**
```
ddb backup C:\Backups\MyBackup .
```

**Backup a specific folder with a set name:**
```
ddb backup C:\Backups\MyBackup --set-name myproject --source C:\Dev\myproject
```

**Backup with excludes:**
```
ddb backup C:\Backups\MyBackup --set-name myproject --source . --exclude node_modules --exclude .git --exclude dist
```

**Multiple sources in one backup set:**
```
ddb backup C:\Backups\MyBackup --set-name work ^
    --source C:\Dev\project-a --exclude node_modules ^
    --source C:\Dev\project-b --exclude node_modules
```
Note: `--exclude` and `--include` after a `--source` apply only to that source.
`--exclude` and `--include` before any `--source` apply globally.

**Backup and verify afterwards:**
```
ddb backup C:\Backups\MyBackup --set-name myproject --source . --verify
```

**Backup, verify and compare with originals (byte-for-byte):**
```
ddb backup C:\Backups\MyBackup --set-name myproject --source . --compare
```

**Add a comment to the backup instance:**
```
ddb backup C:\Backups\MyBackup --set-name myproject --source . --comment "Before refactor"
```

**Fast mode** (skips hash-collision byte-compare, fine for hash-v5 destinations):
```
ddb backup C:\Backups\MyBackup --set-name myproject --source . --fast
```

**Verbose output** (shows each file as it is backed up):
```
ddb backup C:\Backups\MyBackup --set-name myproject --source . --verbose
```

#### Backup options

| Option | Description |
|---|---|
| `--source <path>` / `--from <path>` | Source path to back up. Repeat for multiple sources. |
| `--set-name <name>` | Name for this backup set. Default: `default`. |
| `--exclude <pattern>` | Exclude files/folders matching pattern. |
| `--include <pattern>` | Include files/folders matching pattern (overrides a preceding exclude). |
| `--subdir <path>` | Only back up a specific sub-directory of the source. |
| `--fast` | Skip byte-for-byte hash collision check (recommended for hash-v5). |
| `--verify` | Verify backup integrity after completing. |
| `--compare` | Verify and compare backed-up files against originals (implies `--verify`). |
| `--comment <text>` | Attach a comment to this backup instance. |
| `--verbose` | Print each file as it is processed. |
| `--dry-run` | Show what would be backed up without writing anything. |
| `--fstype <type>` | Force a specific filesystem type (`hash-v4`, `hash-v5`). Default: `hash-v5`. |

---

### `verify` — Verify backup integrity

Checks that all hashes referenced in a backup log exist in the backup store.

```
ddb verify <destination> [options]
```

**Verify the current (most recent) instance of a set:**
```
ddb verify C:\Backups\MyBackup --set-name myproject --verbose
```

**Verify all backup sets in a destination:**
```
ddb verify C:\Backups\MyBackup --verbose
```

**Verify a specific instance by timestamp:**
```
ddb verify C:\Backups\MyBackup --set-name myproject --when 20240815T120000Z
```

**Verify and compare with the original source location:**
```
ddb verify C:\Backups\MyBackup --set-name myproject --compare
```

**Verify and compare against a specific folder** (e.g. a restored copy):
```
ddb verify C:\Backups\MyBackup --set-name myproject --compare-with C:\Temp\restored
```
Note: `--compare-with` implies `--compare` — you don't need to specify both.

#### Verify options

| Option | Description |
|---|---|
| `--set-name <name>` | Verify a specific backup set. Omit to verify all sets. |
| `--when <timestamp>` | Verify a specific instance. Omit for current (most recent). |
| `--compare` | Compare backed-up files byte-for-byte with originals. |
| `--compare-with <path>` | Compare against a specific folder instead of the original source. Implies `--compare`. |
| `--verbose` | Print status of each file. |

---

### `restore` — Restore files from a backup

```
ddb restore <destination> [options]
```

**Restore to a specific output folder:**
```
ddb restore C:\Backups\MyBackup --set-name myproject --output C:\Temp\restored
```

**Restore a specific instance:**
```
ddb restore C:\Backups\MyBackup --set-name myproject --when 20240815T120000Z --output C:\Temp\restored
```

**Restore with filtering (only restore specific files/folders):**
```
ddb restore C:\Backups\MyBackup --set-name myproject --output C:\Temp\restored --include src/
```

**Restore back to original location** (dangerous — use with care):
```
ddb restore C:\Backups\MyBackup --set-name myproject --force
```

**Verbose restore:**
```
ddb restore C:\Backups\MyBackup --set-name myproject --output C:\Temp\restored --verbose
```

#### Restore options

| Option | Description |
|---|---|
| `--set-name <name>` | Restore a specific backup set. |
| `--when <timestamp>` | Restore a specific instance. Omit for current (most recent). |
| `--output <path>` | Folder to restore files into. |
| `--force` | Allow restoring back to the original source location without `--output`. |
| `--include <pattern>` | Only restore files matching this pattern. |
| `--exclude <pattern>` | Skip files matching this pattern during restore. |
| `--verbose` | Print each file as it is restored. |

---

### `list` — List backup sets and instances

```
ddb list <destination> [options]
```

**List all backup sets in a destination:**
```
ddb list C:\Backups\MyBackup
```

**List all instances of a specific set:**
```
ddb list C:\Backups\MyBackup --set-name myproject
```

**List the contents of the current (most recent) instance:**
```
ddb list C:\Backups\MyBackup --set-name myproject --when current --verbose
```

**List the contents of a specific instance:**
```
ddb list C:\Backups\MyBackup --set-name myproject --when 20240815T120000Z --verbose
```

**List instances since a date:**
```
ddb list C:\Backups\MyBackup --set-name myproject --since 2024-08-01
```

**List only source roots (not individual files):**
```
ddb list C:\Backups\MyBackup --set-name myproject --when current --sources
```

#### List options

| Option | Description |
|---|---|
| `--set-name <name>` | Scope to a specific backup set. |
| `--when <timestamp>` / `--current` | List contents of a specific instance. |
| `--since <date>` | Show only instances since this date (`YYYY-MM-DD` or ISO format). |
| `--sources` | Show only source root paths, not individual files. |
| `--verbose` | Show full file details (hash, size, timestamps). |

---

### `rm` — Remove entries from a backup log

Removes specific files from backup instance logs. Does **not** remove the stored hashes from
the backup store — run `ddb clean` afterwards to remove any orphaned hashes.

All files are excluded by default; only paths you explicitly pass as arguments are candidates
for removal.

```
ddb rm <destination> [options] <path> [<path> ...]
```

**Preview what would be removed (no changes made):**
```
ddb rm C:\Backups\MyBackup --set-name myproject --dry-run README.md
```

**Remove a file from all instances, with per-entry confirmation:**
```
ddb rm C:\Backups\MyBackup --set-name myproject README.md
```

**Remove without prompting:**
```
ddb rm C:\Backups\MyBackup --set-name myproject --yes README.md
```

**Remove all `.log` files across all instances using a glob:**
```
ddb rm C:\Backups\MyBackup --set-name myproject --yes **/*.log
```

**Remove from a specific instance only:**
```
ddb rm C:\Backups\MyBackup --set-name myproject --when 20240815T120000Z --yes README.md
```

**After removing entries, clean up orphaned hashes:**
```
ddb clean C:\Backups\MyBackup --verbose
```

#### rm options

| Option | Description |
|---|---|
| `--set-name <name>` | Scope to a specific backup set. |
| `--when <timestamp>` | Operate on a specific instance only. Omit to process all instances. |
| `--yes` | Remove without prompting for confirmation. |
| `--dry-run` | Show what would be removed without making any changes. |
| `--verbose` | Print each entry as it is removed. |

---

### `clean` — Remove orphaned hashes from the backup store

After using `ddb rm` (or manually deleting backup logs), run `clean` to remove stored file
hashes that are no longer referenced by any backup instance.

```
ddb clean <destination> [options]
```

**Clean a destination:**
```
ddb clean C:\Backups\MyBackup
```

**Verbose (shows each hash being removed):**
```
ddb clean C:\Backups\MyBackup --verbose
```

---

### `cat` — Print a backed-up file to stdout

```
ddb cat <destination> --set-name <name> <path-in-backup>
```

```
ddb cat C:\Backups\MyBackup --set-name myproject src/index.js
```

---

### `server` — Run a ddb backup server

Serves a backup destination over HTTP or HTTPS so remote clients can backup/restore
over the network.

```
ddb server --config <path-to-config>
```

**Start a server using a config file:**
```
ddb server --config /etc/ddb/server.config
```

**Start a server with options on the command line:**
```
ddb server --dest C:\Backups\MyBackup --port 4444 --http
```

**Server config file format** (`server.config`):
```json
{
  "keys": {
    "<access-key>": {
      "userid": "username",
      "email": "user@example.com",
      "allow": ["127.0.0.0/8", "192.168.1.0/24"]
    }
  }
}
```

#### Setting up HTTPS

HTTPS requires a key/certificate pair. Generate a self-signed one with the included script:

```
bash create-self-cert.sh
```

This produces `key.pem` and `cert.pem` in the current directory. Then start the server with:

```
ddb server --dest C:\Backups\MyBackup --port 4443 --https
```

The `--cert` option specifies a **filename prefix** that is appended with `key.pem` and `cert.pem`
to locate the two files. This lets you name them differently or place them in a subfolder:

| `--cert` value | Key file loaded | Cert file loaded |
|---|---|---|
| *(omitted)* | `key.pem` | `cert.pem` |
| `certs/ddb-` | `certs/ddb-key.pem` | `certs/ddb-cert.pem` |
| `/etc/ddb/` | `/etc/ddb/key.pem` | `/etc/ddb/cert.pem` |

Examples:

```
rem Use key.pem / cert.pem in the current directory
ddb server --dest C:\Backups\MyBackup --port 4443 --https

rem Use certs/ddb-key.pem and certs/ddb-cert.pem
ddb server --dest C:\Backups\MyBackup --port 4443 --cert certs/ddb-

rem Use /etc/ddb/key.pem and /etc/ddb/cert.pem
ddb server --dest /mnt/backup --port 4443 --cert /etc/ddb/
```

Note: `--cert` implies `--https`, so both do not need to be specified together.

#### Server options

| Option | Description |
|---|---|
| `--config <path>` | Path to server config file. |
| `--dest <path>` | Backup destination folder. |
| `--port <n>` | Port to listen on. Default: `4444`. |
| `--bind <address>` | Address to bind to. Default: all interfaces. |
| `--http` | Use plain HTTP (default). |
| `--https` | Use HTTPS (requires `key.pem` and `cert.pem` in cwd, or use `--cert`). |
| `--cert <prefix>` | Prefix for TLS key/cert filenames (implies `--https`). See above. |

---

## Remote Backups (Client/Server)

Start a server on the backup host:
```
ddb server --config server.config
```

Then on the client, use `http://hostname:port/` as the destination and supply the access key:

**Remote backup:**
```
ddb backup http://backuphost:4444/ --access-key=<key> --set-name myproject --source . --exclude node_modules
```

**Remote verify:**
```
ddb verify http://backuphost:4444/ --access-key=<key> --set-name myproject --verbose
```

**Remote restore:**
```
ddb restore http://backuphost:4444/ --access-key=<key> --set-name myproject --output C:\Temp\restored
```

**Remote list:**
```
ddb list http://backuphost:4444/ --access-key=<key> --set-name myproject
```

---

## Common Options (all commands)

| Option | Description |
|---|---|
| `--dest <path>` / `--to <path>` | Backup destination (alternative to positional argument). |
| `--set-name <name>` | Backup set name. Default: `default`. |
| `--when <timestamp>` / `--instance <timestamp>` | Select a specific backup instance by its timestamp (`YYYYMMDDTHHMMSSmmZ`). |
| `--current` | Shorthand for `--when current` (most recent instance). |
| `--access-key <key>` | Access key for authenticating with a remote server. |
| `--userid <id>` | On the server: operate on a specific user's backups. |
| `--verbose` | Verbose output. |
| `--terse` | Minimal output. |
| `--dry-run` | Show what would happen without making any changes. |

---

## Include / Exclude Patterns

`--include` and `--exclude` accept glob patterns:

| Pattern | Matches |
|---|---|
| `node_modules` | Any file or folder named exactly `node_modules` |
| `*.log` | Any `.log` file in the root of the source |
| `**/*.log` | Any `.log` file at any depth |
| `dist/` | Any folder named `dist` |
| `src/**` | Everything under `src/` |

Rules are evaluated in order. The last matching rule wins. There is an implicit
`--include **` at the end (include everything not explicitly excluded).

For `ddb rm`, the default is an implicit `--exclude **` (exclude everything) — only paths
you explicitly pass as arguments are matched.

---

## Backup Filesystem Types

| Type | Description |
|---|---|
| `hash-v4` | gzip-compressed, CRC-bucketed store. |
| `hash-v5` | gzip-compressed, hash-prefix-bucketed store (default). Human-readable paths. |

The type is chosen when a destination is first created and cannot be changed afterwards.
To find a stored file manually in a `hash-v5` destination, take the first 4 hex characters
of its SHA-256 hash and insert a `/` after the first 2: `aabb...` → `files.db/aa/bb/...`

---

## Typical Workflow

```bat
rem 1. Initial backup
ddb backup C:\Backups\Dev --set-name myproject --source C:\Dev\myproject --exclude node_modules --exclude .git --verbose

rem 2. Subsequent backups (run daily, weekly, etc.)
ddb backup C:\Backups\Dev --set-name myproject --source C:\Dev\myproject --exclude node_modules --exclude .git

rem 3. Verify integrity
ddb verify C:\Backups\Dev --set-name myproject --verbose

rem 4. List instances
ddb list C:\Backups\Dev --set-name myproject

rem 5. Restore a specific instance
ddb restore C:\Backups\Dev --set-name myproject --when 20240815T120000Z --output C:\Temp\restored

rem 6. Remove unwanted files from all instances
ddb rm C:\Backups\Dev --set-name myproject --yes secrets.env

rem 7. Clean up orphaned hashes after rm
ddb clean C:\Backups\Dev --verbose
```
