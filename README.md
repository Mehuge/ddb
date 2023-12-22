
De-Duplicating Backup
==
Experimental (proof-of-concept turned actually used to backup my stuff) hash based backup system.

There are far superior deduplicating backup softwares out there, such as duplicacy, restic and borg (three I am familar with) that all use far superior variable sized chunking deduplication algorithms to do the deduplication and work more efficiently and in a wider range of situations.

But this project isn't about being the best deduplicator, or the most feature rich, or being suitable for every type of backup. It's more of an experiment, a programming excercise and a tool to meet a particular need of mine, to backup source code working environments and document folders.

Install
==
`ddb` requires `node` v10 or later to be already installed.

Installing using npm
--
```
npm i -g dd-backup
```
Note: This will allow ddb to be run using `ddb` rather than `node ddb.js` which may be preferable.

Installing using the install script
--
(requires `git` and either `curl` or `wget`)

At command prompt, cd to the folder where you want to install ddb. For example, `~/bin` or `/usr/local/bin` etc. Then run:

```
curl https://github.com/Mehuge/ddb/raw/master/install.sh | bash
```
or if you prefer to use `wget`
```
wget -qO - https://github.com/Mehuge/ddb/raw/master/install.sh | bash
```

Installing via git
--
```
git clone https://github.com/Mehuge/ddb
cd ddb
```
Run via `node ddb.js ...`

Motivation
===

I noticed that with a lot of our backups there is an awful lot of duplicated data stored in them,
for example, copies of whole source trees, or product installations. Consider also that different
versions (dev, beta, production) of a product often share a large amount of identical files.

Consider then a development machine that has working copies of dev, beta and production, and installed
copies for testing of each, we are talking a lot of duplicate files.

A dumb backup system, backs up each one of these duplicate files, for each instance seen. Granted
incremental backups don't copy those files unless they have changed, but even then if a branch is
updated in several places, each place has a duplicate copy of the updated files.

The Idea
===
What would happen, I thought, if we store the files in a hash based file system? There would only ever
be a single copy of a version of a particular file no matter how many times it appeared in the source
file system.

Proof of concept
--
So I set about coding a proof-of-concept backup system to test out a) if it was feasible, and b) what
kind of space savings could be achieved. Enter ddb, de-duplicating backup.

Hashing
--
I chose sha256 as the hashing algorithm but the issue with a hash is that there are potentially collisions, though highly unlikely it is a possibility, so I had to build in some integrity checks into the system.

sha256 hashs are 64 hexadecimal characters long. These are stored in a folder called `files.db` within the backup destination. The files are stored in buckets implemented as two levels of directories [00-FF]/[00-FF]. Which bucket a hash is placed into is calculated by splitting the hexadecimal hash into two equal length strings, and calculating the crc8 hash of each, these become the folder names for the bucket.

To handle potential hash clashes (two actually different files, with the same hash), by default the
backup compares a hit in the hash file system byte-by-byte with the source file, and if they are different, will store the file as a variant. These variant numbers are appended to the hash as .0 .1 .2 etc. I have yet to see this happen.

There is a `--fast` option which skips this additional integrity, and the soon to come client/server version will by default use `--fast`.

In the Future: The `--fast` option will be phased out. I have yet to see a clash, and don't think the byte-by-byte compare is worth it. Perhaps adding a `--slow` option instead.

Backup Targets
--
Backups target a destination which is either an non-existant or empty folder, or an existing
backup destination, or a backup server over http or https. If the folder does not exist, or is empty it will be created and/or initialised.

The backup filesystem is stored in a `files.db` subfolder, and backup sets (and their increments) are
stored in the `backups` subfolder.  There is a `config.json` which contains the fs-type of the
backup destination.

Backup destinations (`--to` or `--dest`) are designed to be shared. The more it is shared, the more de-duplication occurs. It is possible to have a separate backup destination for each backup, and that will de-duplicate files within that backup, but the destination can also be shared by multiple backup sets.

Backup Set
--
A backup set (`--set-name`) is a named backup placed in a backup destination. It has increments and a current marker. The default backup set if not specified is named default. A backup set can specify one or more backup sources (--from).

Backup Source
--
A backup source (--from) is a root path, optionally sub-folders to backup and/or include and exclude patterns for filtering and tells the backup which files to back up.

Incremental backups
--
The concept of full, differential or incremental backups doesn't make sense in this type of backup system. Every backup is incremental, the first backup just happens to take longer because it potentially has to backup everything.

Managing increments
==
Because of the nature of the backup format, the hash based file system that is used to store files, managing increments is really simple, for instance to remove the first backup, just delete its index, don't need to merge it with the next increment. Once an increment or increments have been removed, then run a `clean` on the filesystem which will check all the hashs still in use by increments, and remove ones that are no longer referenced. This can be done separately from the removal of the increment.

**File System**

The filesystem is implemented in the `BackupFileSystem` class. The filesystem has an fstype, which is currently one of `hash-v3` or `hash-v4` which are implemented in turn by `HashFileSystemV3` and `HashFileSystemV4`.

*Note: v4 is the default filesystem, v3 must be specified when creating a destination using the `--fstype=hash-v3` option.

`hash-v3` is uses a simple crc8/crc8 bucket system which limits the `files.db` and child-folders to 256 entries max, with the hashed files stored as a leaf node. The folders containing the leaf nodes will grow but testing suggests the growth is fairly evenly spread across the buckets, so growth is slow. This means that the system could store 16 million files and only have around 256 hashed files per bucket. It also means that the file system will use at most 65,536 folders regardless of the numbers of files, solving the main problem with `hash-v1` whilst also being faster (less folders to manage). Because the bucket is chosen using a hash of the file hash, there is no need to maintain an index of the hashes, so does not suffer from the problems with `hash-v2` of being slow, and risks to integrity.

![Backup FileSystem V3](docs/backup-filesystem-v3.png)

`hash-v4` is `hash-v3` with compression. I suppose I could have called it `hash-v3-compressed`! As files are stored in the file system gzipped (zlib). As files are copied out of or hashed they are decompressed using gunzip (zlib). This compression is handled inline using streams, so adds very little overhead in terms of performance.

**Todo:**

- [x] filesystem cleanup (remove files in the file system no longer referenced by any increment)
- [x] add a restore option (would be kind of useful)
- [x] use compression (store indexes and blobs as .gz files)
- [x] include and exclude files/paths
- [ ] --exclude-file list excludes in a file (like .gitignore)
- [ ] --remove-older remove backup instances older than a specified age
- [x] `ddb list` list backups
- [x] add ability to select an increment to list / verify / support
- [ ] add support for backup configs `node ddb.js --config <path-to-config>`
- [ ] add reporting options (email, status file ...)
- [x] networking: add ability to backup over the network - --server mode
- [x] networking: add restore support over network
- [ ] networking: add run backup server over ssh (a one time backup server)
- [x] networking: add --http and --https options for server mode, default to https if port ends in 443 (443, 4443, 44443)
- [ ] networking: skip restoring files if local copy hash is the same as the servers hash.
- [x] a better file system
- [ ] encryption (backup-filesystem-v5)
- [x] authentication: backup server should be able to authenticate clients
- [ ] authentication: allow access-key to be specified via the environment
- [ ] --move-set move a backup set from one backup destination to another.
- [ ] --archive archive a backup destination
- [ ] `ddb cp` command, copy files matching wildcard from a backup instance
- [ ] `ddb cat` like cp but to standard output.
- [ ] `ddb search` search for a file matching pattern
- [ ] Make `--fast` the default for local backups. Add `--no-fast` to disable.
- [ ] Add option to remove a file from a backup set (and all its instances)



Usage Examples
==
Backup
--
```
node ddb.js backup L:\BACKUPS\DDB --fast --set-name ddb --from . --exclude node_modules --exclude .git --include .gitignore --verify --verbose
```
Backs up the current directory (`--from .`) to `L:\BACKUPS\DDB` using the fast option (relies on hashes being unique) a backup set named `ddb` that includes all files except those beginning `node_modules` and `.git`.

Verify the contents of a backup
--
```
node ddb.js verify L:\BACKUPS\DDB --set-name ddb --verbose
```
Verify the `ddb` backup verbosely (same as specifying `--verify` during the backup).

Verify and compare
--
```
node ddb.js --to L:\BACKUPS\DDB --set-name ddb --verify-and-compare --verbose
```
Like verify except that the backup files for the current instance are compared (byte-for-byte) with the originals.

List backups
--
```
node ddb.js list L:\BACKUPS\DDB --set-name ddb
```
List all the instances for a backup set. Returns the timestamp, file count, size and time taken to run the backup.

```
node ddb.js list L:\BACKUPS\DDB --set-name ddb --when 2019-03-22T20:59:52.958Z
```
Lists the contents of a backup instance. The `--when` option takes the instance time as an ISO format string, or can specify current to mean the last available instance.

```
node ddb.js list L:\BACKUPS\DDB --set-name ddb --when 2019-03-22T20:59:52.958Z --sources
```
Lists the backup sources (the from directories) in a backup. This is useful if the backup set contains multiple sources, and may be required to specify which source when performing a restore.

Restore
--
```
node ddb.js restore K:/BACKUPS/DDB --set-name ddb --output=D:\TEMP\RESTORE --verbose
```
Restore the last (current) backup for backup set `ddb` and restore it to `D:\TEMP\RESTORE`.

```
node ddb.js restore K:/BACKUPS/DDB --set-name ddb --output=D:\TEMP\RESTORE --exclude ** --include lib --verbose
```
Restore the `lib` sub-folder of the last (current) backup for backup set `ddb` and restore it to `D:\TEMP\RESTORE`.

```
node ddb.js restore https://backupserver:4444/ --set-name ddb --output=D:\TEMP\RESTORE --exclude ** --include lib --verbose
```
Restore the `lib` sub-folder of the last (current) backup for backup set `ddb` from a backup server running on backupserver listening on port 4444 and using https, and restore it to `D:\TEMP\RESTORE`.

Run backup as a server
--
```
node ddb.js server K:/BACKUPS/SERVER --https --verbose
```

Backup servers are hard coded to create a hash-v4 (compressed) file system, and automatically enable --fast mode.

`hash-v4` is used because files are transferred to the server already gzipped to save network bandwidth so it make little sense to decompress them just to put them in a hash-v3 file system, instead they are copied right from the http stream into the file system as-is, so the server doesn't do any compression, the compression is all done by the client.

Fast mode is used because comparing files across the network would be too expensive, so backups rely on the hashes for comparisons. When considering a file to backup the client hashes the file, then asks the server if it has that hash, if it does, the client just says log this file as backed up. If not, it compresses the file and sends it to the server.  Only changed files are ever transmitted over the network.

Future: An optimisation here may be to do some kind of rdiff of the file, once we know we need to send the file, if the server can find a previous version of the file from the previous backup set log, it could produce a hash chain for that version (hashes for each block) and send the hash chain to the client, the client could then work out which parts of the file it needs to send to the server so it can construct the new version of the file from the previous version. This would be great for backing up log files, as only the new parts of the log files would be sent.

Setting up an HTTPS server.
--

ddb.js supports backing up over https rather than http, which is essential if backing up across a public network. Enabling https on the server requires the following setup.

1. Generate a key-cert pair. Run `create-self-cert.sh` to generate a `key.pem` and `cert.pem` file for use by the https server. Place these in the directory the server is run from.

2. Run the server with the `--https` option as follows:

```
node ddb.sh server ~/backups --https --verbose
```

By default the server will look for `key.pem` and `cert.pem` in the current folder. This can be modified by specifying the `--cert` option with a prefix. For example, the following server command line will tell the server to look for `certs/ddb-key.pem` and `certs/ddb-cert.pem` instead.

```
node ddb.sh server ~/backups --cert "certs/ddb-" --verbose
```

Note: `--cert` implies `--https` so both options do not need to be specified. In fact `--cert` without a prefix is equivalent to specifying `--https` without `--cert`.

Accessing an https backup server
--

Accessing an https backup server is the same as accessing the http backup server, except specify `https` rather than `http` in the destination uri.

Server Authentication
--
Basic authentication is supported by the http(s) server and client. Authentication on the server is optional, and enabled through the presence of a `auth.json` configuration file in the backup destination on the server. No additional option need to be passed to the `ddb.js server` command line.
```json
{
  "keys": {
    "{access-key}": {
      "userid": "{username}",
      "email": "{users@email-address.em}",
      "allow": [ "10.0.0.0/16", "192.168.0.0/24" ]
    },
    "9WybPy1HQWlB1e79xUb0m76clf0sNsxv": {
      "userid": "bob",
      "email": "bob@fake-email.com",
      "allow": []
    }
  }
}
```
Once defined, the server will refuse to communicate with any client that has not first authenticated by supplying the pre-shared secret (or `access-key`). Each `access-key` maps to a userid. Backup indexes for each userid are stored separately under `backups/<userid>/<set-name>.<timestamp>`.

Authenticating a client
--
A client connecting to a server that is using authentication will need to supply the pre-shared `access-key`.

```
node ddb.js backup https://remote-backup-server:4444/ --from . --access-key 9WybPy1HQWlB1e79xUb0m76clf0sNsxv
```

Server side access to authenticated clients backups
--
Occasionally an administrator of a backup server may need to access backups on behalf of a user. In order to be able to do this on a server that is authenticating (storing backup indexes in `<userid>` subfolders) the userid must be specified using the `--userid` command line option.

```
node ddb.js list ~/backups/DDB --userid=username
```

Check Backup Destination Integrity
--
The `verify` command run without specifying a setname will perform a fsck-style integrity check of the backup destination and backup instances.
```
node ddb.js verify ~/backups/DDB
```
This will report any missing, damaged or orphaned hashes.
```
ERROR 69227c3030cce65b836a78bd748a78f5cf042fe24617e65c0ac2ef3e4ed564df.0.5372
ORPHANED 49d17dd3336f7caac24927f3609db04d6af7d23bbc21ac358b8f596009001b11.0.1618
MISSING be87e5f8ea56e415ffd9ea0c371e86ecd4f520e4363e7d662d0c10c6ac20dafb.0.5222
Total 1349 Verified 1346 Orphaned 1 Damaged 1 Missing 1
```

Orphaned hases are nothing to worry about. They simply mean that the entry in the backup destination is no longer referenced by any of the backup instances. This can happen if unwanted backup instances are removed.

Damaged and Missing hashes are however a problem, and will mean that particular version of the file contained within the hash is no longer available to any of the backup instances it is referenced in.

There isn't currently a fix option for Damaged and Missing hashes. A damaged hash can be removed by manually deleting the file from within the files.db hash filesystem. It will then be considered missing rather than damaged. Missing hashes may be restored by if the correct version of the file still exists in one of the backup sources and that backup source is backed up again.

In any case, it is a good idea to run backups again in the event of any corruption of the backup destination so that at lease 1 good backup is available.

The `restore` command should be resilient enough such that damaged or missing hashes will not prevent the restore from proceeding just with the appropriate warnings about the files that could not be restored.

Orphaned hashes can be safely removed by running the `clean` command.

Cleaning a backup destination
--
```
node ddb.js clean ~/backups/DDB
```
This will remove any orphaned hases from the backup filesystem.

Command Line Options Reference
==

Command line options fit into two categories. commands and options. A command is always the first word on the command line, such as `backup`, `list`, `verify` etc. Options may take a value. These are specified after the option separated either by a space or an `=` sign. For example: `--option=value` or `--option value`. The parameter may, in some cases even be omitted. The `--cert` option is an example where the value is optional.

Commands:

|           |                                            |
|-----------|--------------------------------------------|
| `backup`  | Perform a backup
| `verify`  | Verify a backup
| `list`    | List backups, or the contents of a backup
| `restore` | Restore a backup or files from a backup
| `clean`   | Clean a backup destination
| `server`  | Start ddb in server mode

#### General Options:

`--to` or `--dest`

Specifies the backup destination. This is generally not necessary as the destination can also be specified immediately after the backup command.  For example: `ddb.js backup K:\BACKUPDEST ...`.

`--access-key`

Specifies the pre-shared `access-key` used to authenticate with a ddb server. For example: `--access-key=my-secret-key`

`--userid`

Specifies the userid to use. This is intended to be used on a backup server for querying backups from authenticated users, but in reality it simply specifies the name of a sub-folder within the `backups` instances folder to look for or store the backup instance.  [*Note: Need to check this*]

`--set-name`

Specifies the name of the backup set.

`--include`

Adds an include filter.

`--exclude`

Adds an exclude filter.

`--subdir`

Adds an subdir filter.

`--when`

Specifies a timestamp (in ISO format) when listing or verifying a backup. The timestamp can be obtained by listing the backup instances for a backup set using the `list` command without a `--when` option.

`--current`

Like `--when` but identifies the newest backup for the backup set.

`--verbose`

Provided a detailed output of activity and progress.

For a backup, this outputs a status line for each file and folder that is being backed up. The status is a two character string with the following meanings:

The first character indicates the modified status of the file, a (add) u (modified) - (unmodified)
The second character indicates if the file was added to the backup store. - (not sent) + (sent)

Folders are never sent to the backup store, their details are stored in the log for this backup. Expect to see a-, u- and -- for folders.

Files won't be stored if the files hash appears in the last backup log, or the destination says it already has that hash stored. 
If a file has changed (modified a or u) the file may not be stored if the destination already has that version of the file. Wxpect to see a-, u-, --, a+, u+

`--terse`

Only show status lines for files actually stored (+) in the backup store.

`--deep-scan`

This option tells the file-scan logic to scan sub-folders of ignored folders. No files in the ignored folder will be backed up, but if the folder contains sub-folders that are not also ignored, they will be backed up.

`--older-than`

Not Yet Implemented.

#### `backup` Options:

`--from` or `--source`

Specifies where to back up from. Multiple `--from` options can be specified.

`--fstype`

When running a `backup` or `server` if the destination does not exist, it will be created using the specified fstype. Only `hash-v3` and `hash-v4` are supported. `hash-v4` is the default and recommended file system type.

`--no-backup`

Deprecated. This rather strange option tells the `backup` command to not actually backup. If `--no-backup` is specified with `--verify` the backup will verify the last backup with the current source. As there is also a `verify` command, this option is deprecated.

`--fast`

When backing up, when a hash match is found, do not perform a full file compare, simply rely on the hash + size to determine if a file is already backed up. This significantly speeds up backups at the expense of the incredibly low chance that two files of the same size produce the same hash. When the destination is a backup server, this option is always on.

`--check-hash`

Recent versions of ddb optimise the scanning for files to back up by utilising the last backup time, and index to check only files whos modified time is not more recent than the start of the last backup and where the size has not changed. If both conditions are met for a file, the hash from the previous backup is used rather than calculated. This can speed up the backup process significantly.

The `--check-hash` option disables this behaviour and always computes the hash from the files contents regardless of modification time.

Note that, when communicating with a backup server over http or https, the hash is always caclulated from the local file.

To illustrate the amount of speedup not checking hash can give, here is part of a backup list with the last backup not using the `--check-hash` option. Down from 10 minutes to 2 seconds.

```
2021-01-04T06:59:55.181Z 1260 files 2174.27 MB took 665.967 seconds
2021-01-05T06:50:33.373Z 1260 files 2174.27 MB took 680.998 seconds
2021-01-06T06:55:01.378Z 1260 files 2174.27 MB took 589.48 seconds
2021-01-08T06:11:58.616Z 1261 files 2174.27 MB took 667.215 seconds
2021-01-08T22:53:19.972Z 1263 files 2174.27 MB took 2.135 seconds
```

`--clean`

Run a clean after backup. [Q. why would we want to do this?]  See `clean` command.

`--verify`

Verify the backup after backup has finished. This checks the integrity of the backup by checking that each entry in the backup instance exists in the destination and that each entry is not corrupt.

`--verify-and-compare` or just `--compare`

Not supported when destination is a server.

Verify and compare the backup. This will check each file exists in the backup destination and also do a byte-by-byte compare the backup file with the source version and report if any files have changed.

##### `list` Options:

`--sources`

Also list each source within a backup instance. A backup sources is the original path specified in the backup command via the `--from` or `--source` option. A backup set may have multiple backup sources.

`--since`

List each backup instance since a specified timestamp. So for example, if wanting to find a backup that was done on or after the 3rd of August 2020, specify `--since 20200803T000000000Z`

##### `verify` Options:

`--compare-with`

Specifies the root of the folder to compare the backup to, if for instance the original folder has moved or comparing with another copy.

#### `restore` Options:

`--output`

Specify where to restore files to.

`--force`

#### `server` Options:

Force overwrite of existing content in the output folder.

`--bind <ip-addr>`

Bind to the specified IP address. Typically `0.0.0.0` or `127.0.0.1`. The default bind address is `0.0.0.0`

`--port <port>`

Bind to the specified port number. Note: If `port` ends with 443, `https` is assumed unless otherwise specified. So ports 443, 4443 and 44443 are all assumed to be `https` ports.

`--http`

Force `http` regardless of port.

`--https`

Force `https` regardless of port.

`--cert <prefix>`

Specify a prefix for the certificate file names required when running an `https` server. By default, the server will look for `key.pem` and `cert.pem`. If a prefix is specified, this is prefixed to the `key.pem` and `cert.pem` filenames. This allows named certificates to be used, and even a path to the certificates to be specified.

`--cert` implies `--https` and can be specified instead of `--https`.

TODO
==
Encryption
--
This would work by providing a key at runtime (via environment, option or prompt) that hash-v5 will use to encrypt/decrypt the files. Encryption will happen before compression. The client will be entirely responsible for encryption.

*Local backup:*<br>
disk -> encrypt -> compress -> disk

*Remote backup:*<br>
disk -> encrypt -> compress -> network (http/https) -> disk

Because of the nature of the backup system, different backup sets can use different encryption keys, however doing so will prevent deduplication from deducplicating accross backup sets. It will be recommended that where possible the same key is used for all backups to a single destination.

Limitations
==
Does not nor any plans to support:
- windows permissions
- unix extended permissions
- not suited to backing up large, changing files
- does not store differences between versions of a file, but whole copies

--
<style>
th:empty { display: none; }
</style>
