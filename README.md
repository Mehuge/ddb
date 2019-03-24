
De-Duplicating Backup
==
Experimental (proof-of-concept) hash based backup system.

Motivation
===

I noticed that with a lot of our backups there is an aweful lot of duplicated data stored in them,
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

(at this point, I had no idea if the idea was workable or not)

Proof of concept
--
So I set about coding a proof-of-concept backup system to test out a) if it was feasable, and b) what
kind of space savings could be achieved. Enter ddb, de-duplicating backup.

Challenges
--
I chose sha256 as the hashing algorithm (though this could be made configurable) but the issue with
a hash is that there are potentially collisions, though highly unlikely it is a possibility, so I had
to build in some integrity checks into the system.

sha256 hashs are 64 hexadecimal characters long. How should these be stored? I chose to use the
filesystem, but in order to keep directory sizes down, the hash is split accross a number of folders.
The current system splits the hash into 2, 3, 4, 12, 12, 31 sized sections, as this keeps the initial
folders from getting too large.

To handle potential hash clashes (two actually different files, with the same hash), by default the
backup compares a hit in the file system byte-by-byte with the source file, and if they are different,
will store the file as a variant. These variants are appended to the hash as .0 .1 .2 etc. I have yet
to see this happen. To speed up backups, a --fast option can be specified which skips that integrity
check.

Backup Destinations
--
Backups target a destination which is either an non-existant or empty folder, or an existing
backup destination. If the folder does not exist, or is empty it will be created and/or initialised.

The backup filesystem is stored in files.db sub-folder, and backup sets (and their increments) are
stored in the `backups` subfolder.  There is a config.json which contains the format version of the
backup destination.

Backup destinations (`--dest`) are designed to be shared. The more it is shared, the more de-duplication occures.
It is possible to have a separate backup destination for each backup, and that will de-duplicate
files within that backup, but the destination can also be shared by multiple backup sets.

Backup Set
--
A backup set (`--set-name`) is a named backup placed in a backup destination. It has increments and a current marker. The default backup set if not specified is named default. A backup set can specify one or more backup sources (--from).

Backup Source
--
A backup source (--from) is a root path and optionally include and exclude patterns for filtering and tells the backup which files to back up.

Incremental backups
--
The concept of full, differential or incremental backups doesn't make sense in this backup system. Every backup is incremental, the first backup just happens to be the largest increment (a full backup).

Work in progress
==
This is very very much a work in progress, the project is still only a few weeks old.

The backup destination should be compressed to further reduce the space occupied by the backup. Each file stored in the hash based file system should be compressed, as should each instance index. It should be an optional feature, as it will add an a time overhead when backing up. Ideally it should be possible to compress after backup, so the filesystem should be able to cope with a mix of compressed and uncompressed entries. Also add an option to compress the file system at a later time. At present you can archive a backup using tar.gz to achieve a very small archive compared to the original folder.

Because of the nature of the backup format, the hash based file system that is used to store files, managing increments is really simple, for instance to remove the first backup, just delete its index, don't need to merge it with the next increment. Once an increment or increments have been removed, then run a cleanup on the filesystem which will check all the hashs still in use by increments, and remove ones that are no longer referenced. This can be done separately from the removal of the increment.

Backup server mode. This would use the network to comminicate with the backup destination using a simple tcp based protocol. e.g. `EXISTS <hash.var> <size>`, `PUT <hash> <size> <stats>\n<data>`, `VERIFY <hash.var>`, `GET-INSTANCE <name>`, `GET-FILE <hash.var>` and so on. This is necessary so that hashes are calculated locally not over the network which would be very slow. The aim being that the only things transfered over the network would be files that needed backing up.

**File System**

The filesystem is implemented in the `BackupFileSystem` class. The filesystem has an fstype, which is currently one of `hash-v1`, `hash-v2` or `hash-v3` which are implemented in turn by `HashFileSystemV1`, `HashFileSystemV2` and `HashFileSystemV3`.

*Note: v3 is the default filesystem, v1 and v2 will be dropped as they don't perform well enough. v3 needs some further optimisation, but will become the default and only fs supported*

`hash-v1` is the initial implementation which while being fast, and avoids having folders with large numbers of files, it's problem is it generates a lot of folders (up to 5 folders per hased file).

`hash-v2` is an indexed bucket file system, using sqlite3 as the index. It turns out this is very slow (on windows) and slower (x2) on macos because to track the hashes in the buckets it maintains an indes in SQL. Integrity is also an issue as its possible for the index to get out of step with the file store.

`hash-v3` is the latest version and is similar to `hash-v1` but uses a very simple crc8 + crc8 bucket system which limits the `files.db` and child-folders to 256 entries max, with the hashed files stored as a leaf node. The folders containing the leaf nodes will grow but testing suggests the growth is fairly evenly spread across the buckets, so growth is slow. This means that the system could store 16 million files and only have around 256 hashed files per bucket. It also means that the file system will use at most 65,536 folders regardless of the numbers of files, solving the main problem with `hash-v1` whilst also being faster (less folders to manage). Because the bucket is chosen using a hash of the file hash, there is no need to maintain an index of the hashes, so does not suffer from the problems with `hash-v2` of being slow, and risks to integrity.

![Backup FileSystem V3](docs/backup-filesystem-v3.png)

**Todo:**

- [x] filesystem cleanup (remove files in the file system no longer referenced by any increment)
- [ ] add a restore option (would be kind of useful)
- [ ] use compression (store indexes and blobs as .gz files)
- [x] include and exclude files/paths
- [ ] --exclude-file list excludes in a file (like .gitignore)
- [ ] --remove-older remove backup instances older than a specified age
- [x] --list a backup (like --verify --verbose but without verifying)
- [x] add ability to select an increment to list / verify / support
- [ ] add support for backup configs `node backup.js --config <path-to-config>`
- [ ] add reporting options (email, status file ...)
- [ ] networking (add ability to backup over the network - --server mode)
- [x] a better file system
- [ ] --move-set move a backup set from one backup destination to another.
- [ ] --archive archive a backup destination
- [ ] --compress compress uncompressed file system entries / compress as backing up

Limitations
==
Does not nor any plans to support:
- windows permissions
- unix extended permissions
- not suited to backing up very large, changing files
- does not store differences between versions of a file, but whole copies

Usage Examples
==

Backup
--
```
node ddb.js backup L:\BACKUPS\DDB --fast --set-name ddb --from . --exclude node_modules --exclude .git --verify --verbose
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
node backup.js --to L:\BACKUPS\DDB --set-name ddb --verify-and-compare --verbose
```
Like verify excpet that the backup files for the current instance are compared (byte-for-byte) with the originals.

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
