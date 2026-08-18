# ddb — Include / Exclude Filter Reference

The `--include` and `--exclude` options control which files and folders are
backed up. They accept **glob patterns** and can be combined freely. This
document describes the syntax and evaluation rules.

---

## Basic usage

```
ddb backup <dest> --source <dir> --exclude <pattern> --include <pattern>
```

Both options may be repeated any number of times. Order matters — see
[Rule evaluation](#rule-evaluation) below.

---

## Scope

Filters can appear in two positions on the command line:

| Position | Applies to |
|---|---|
| Before any `--source` | All sources (global) |
| After a `--source` | That source only |

```
ddb backup C:\Backups\MyBackup \
    --exclude node_modules \               # global — applies to every source
    --source C:\Dev\project-a \
    --exclude dist \                       # only project-a
    --source C:\Dev\project-b
```

---

## Pattern syntax

Patterns are matched against the **relative path** of each file or folder
within its source directory, using forward or back slashes interchangeably.

### Wildcards

| Syntax | Meaning |
|---|---|
| `*` | Any sequence of characters that does not contain a path separator |
| `**` | Any sequence of characters including path separators (matches across directories) |
| `**/` prefix | Match at **any depth**, including the root of the source |

### Boundary behaviour

A pattern that does not end with `*` or a path separator is automatically
anchored at a **path boundary**. This means the pattern must match a complete
path component, not just a prefix.

| Pattern | Matches | Does NOT match |
|---|---|---|
| `temp` | `temp`, `temp/foo.txt` | `templates`, `temporary` |
| `**/temp` | `temp`, `a/b/temp`, `a/b/temp/foo` | `templates`, `a/templates` |
| `**/.git` | `.git`, `sub/.git`, `.git/config` | `.gitignore`, `.github` |
| `**/.git*` | `.git`, `.gitignore`, `.gitconfig`, `.github/` | *(nothing unexpected)* |
| `**/*.log` | `app.log`, `logs/app.log` | `app.log.bak` |
| `**/node_modules` | `node_modules`, `a/node_modules`, `a/node_modules/pkg` | `node_modules_old` |

> **Tip:** To exclude a directory *and everything inside it*, just name it —
> e.g. `--exclude '**/temp'`. The boundary rule means siblings like `templates`
> are unaffected. You do **not** need to add a trailing `/` or a `/**` suffix.

> **Tip:** To exclude only a directory's *contents* but not the directory entry
> itself, append a trailing slash: `--exclude '**/temp/'`.

### Shorthand — omitting the `**/` prefix

When using `--exclude` / `--include` on the command line you can omit `**/`
and ddb will infer it. The following are equivalent:

```
--exclude node_modules
--exclude **/node_modules
```

Both exclude any folder named `node_modules` at any depth.

---

## Rule evaluation

Rules are evaluated **in order**. The **last matching rule wins**.

- `--exclude` adds a *deny* rule.
- `--include` adds an *allow* rule.

A file that matches no rule is **not ignored** (i.e. it is included by default).

### Example — exclude everything, then re-include specific folders

```
ddb backup <dest> --source <dir> \
    --exclude '**' \
    --include 'Desktop' \
    --include 'Documents'
```

`--exclude '**'` acts as a catch-all deny at that point in the list. Any
`--include` placed **after** it can carve out exceptions.

### Example — exclude `.git` but keep `.gitignore`

With the boundary rule this is now automatic:

```
--exclude '**/.git'
```

`.gitignore` and `.github/` are unaffected because they are not the same path
component as `.git`. No compensating `--include '**/.gitignore'` is needed.

To exclude *all* dot-git files use a wildcard:

```
--exclude '**/.git*'
```

### Example — typical project backup

```
ddb backup C:\Backups\MyBackup --set-name myproject --source . \
    --exclude '**/.git' \
    --exclude '**/node_modules' \
    --exclude '**/dist' \
    --exclude '**/temp' \
    --exclude '**/*.log'
```

---

## Quick-reference table

| Goal | Pattern |
|---|---|
| Exclude a named folder at any depth | `--exclude '**/name'` |
| Exclude a named folder only at root | `--exclude 'name'` |
| Exclude all `.log` files | `--exclude '**/*.log'` |
| Exclude `.git` but not `.gitignore` | `--exclude '**/.git'` |
| Exclude `.git` and `.gitignore` etc. | `--exclude '**/.git*'` |
| Exclude all hidden files/folders | `--exclude '**/.*'` |
| Exclude everything, include one folder | `--exclude '**'` then `--include 'FolderName'` |
| Re-include after a broad exclude | Place `--include` **after** the `--exclude` |
