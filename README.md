
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

sha256 hashs are 40 hexadecimal characters long. How should these be stored? I chose to use the
filesystem, but in order to keep directory sizes down, the hash is split accross a number of folders.
The current system splits the hash into 2, 3, 4, 12, 12, 7 sized sections, as this keeps the initial
folders from getting too large.

To handle potential hash clashes (two actually different files, with the same hash), by default the
backup compares a hit in the file system byte-by-byte with the source file, and if they are different,
will store the file as a variant. These variants are appended to the hash as .0 .1 .2 etc. I have yet
to see this happen. To speed up backups, a --fast option can be specified which skips that integrity
check.

Backup Destinations
--
Backups target a destination (--to) which is either an non-existant or empty folder, or an existing
backup destination. If the folder does not exist, or is empty it will be created and/or initialised.

The backup filesystem is stored in files.db sub-folder, and backup sets (and their increments) are
stored in the backups subfolder.  There is a config.json which contains the format version of the
backup destination.

Backup destinations are designed to be shared. The more it is shared, the more de-duplication occures.
It is possible to have a separate backup destination for each backup, and that will de-duplicate
files within that backup, but the destination can also be shared by multiple backup sets.

Backup Set
--
A backup set (--set-name) is a named backup placed stored in a backup destination. It has increments
and a current marker. The default backup set if not specified is named default. A backup set can
specify one or more backup sources (--from).

Backup Source
--
A backup source (--from) is a root path and optionally include and exclude patterns for filtering
(filtering not yet implemented) and tells the backup which files to back up.

Incremental backups
--
The concept of full, differential or incremental backups doesn't make sense in this backup system.
Every backup is incremental, the first backup just happens to be the largest increment (a full
backup).

Work in progress
==
This is very very much a work in progress, the project is a few days old, indeed there isn't a restore option currently as I am still in the process of designing and building the backup format.

The backup destination should be compressed to further reduce the space occupied by the backup. Each file stored in the hash based file system should be compressed, as should each instance index. It should be an optional feature, as it will add an overhead when backing up. Ideally it should be possible to compress after backup, so the filesystem should be able to cope with a mix of compressed and uncompressed entries. Also add an option to compress the file system at a later time. At present you can archive a backup using tar z to achieve a very small archive compared to the original folder.

Because of the nature of the backup format, the hash based file system that is used to store files, managing increments is really simple, for instance to remove the first backup, just delete its index, don't need to merge it with the next increment. Once an increment or increments have been removed, then run a cleanup on the filesystem which will check all the hashs still in use by increments, and remove ones that are no longer referenced. This can be done separately from the removal of the increment.

**Todo:**

- add a restore option (would be kind of useful)
- use compression (store indexes and blobs as .gz files)
- --exclude-file list excludes in a file (like .gitignore)
- --remove-older remove backup instances older than a specified age
- --list a backup (like --verify --verbose but without verifying)
- Ability to select an increment to list / verify / support

**Done:**

- filesystem cleanup (remove files in the file system no longer referenced by any increment)
- include and exclude files/paths

Limitations
==
Does not support:
- restore from backup (yet)
- windows permissions
- unix extended permissions
- not suited to backing up very large, changing files
- does not store differences between versions of a file, but whole copies

Usage Examples
==

Backup
--
```
node backup.js --to L:\BACKUPS\DDB --fast --set-name ddb --from . --exclude node_modules --exclude .git --backup --verify --verbose
```

Verify the contents of a backup
--
```
node backup.js --to L:\BACKUPS\DDB --set-name ddb --verify --verbose
```

Verify and compare the contents of a backup
--
```
node backup.js --to L:\BACKUPS\DDB --set-name ddb --verify-and-compare --verbose
```
