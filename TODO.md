
Add option to remove a file from a backup instance (or instances).
~~~~

This should remove the file from the index(s) and re-calculate the status statistics at the end and re-write the backup instance index, with the original timestamp. Special handling of .current is needed because in some cases, its a copy not a link. After the removal of the file from the index(s) the hash for the file should be checked to see if it apears in any other index and if not the file removed from files.db.

Should be able to handle wildcards.
Should be able to target a backup set, a backup set instance, including current or all backup sets.

Cleanup should work by gathering the hashes of files removed and passing those hashes to a routine that checks those hashes agains all the remaining hashes (in all indexes) and if they are not longer referenced, remove those files from files.db

ddb remove . --set-name MYBACKUP unwanted-file.tgz
ddb remove . --set-name MYBACKUP -when <timestamp> unwanted-files*.tgz
ddb remove . --set-name MYBACKUP -when current unwanted-files*.tgz
ddb remove . *.tgz

Improve perfomance over http
~~~~

Currently backing up to ddb server can be slow because of RTT (round trip times). At the moment, each file is processed individually in a have you got X? no, here is X manner. This significantly slows down the backup.

A couple of approaches here:

1. pre-download last backup list and use that to work out which files have changed so not asking server if has a file it will already have (subject to backup being integral). Perhaps an option to skip this step to be used when repairing broken backups.

2. batch requests, so have you got these? you don't have these, here they are. The here they are bit will need to be clever as it means sending multiple binary files over a single http request.

  POST /fs/has/batch
  <size> <hash>
  <size> <hash>
  <size> <hash>
  200 OK

  (returns a list of hashes it doesn't have)

  POST /fs/put/batch
  <size> <hash>\n
  (binary data of <size> bytes)
  <size> <hash>\n
  (binary data of <size> bytes)
  ...
  200 OK

  POST /backup/log/batch
  <size> <hash> <time> ... <name>\n
  <size> <hash> <time> ... <name>\n
  <size> <hash> <time> ... <name>\n
  200 OK
