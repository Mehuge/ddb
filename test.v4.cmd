
rem node ./ddb.js backup K:/BACKUPS/CUBE-DDBV4 --set-name DEV --from D:/DEV --subdir ddb --subdir CU/Mehuge/Camelot-Unchained --exclude **/node_modules --exclude **/.git --verify
rem node ./ddb.js verify K:/BACKUPS/CUBE-DDBV4 --set-name DEV --verify-and-compare
rem node ./ddb.js clean K:/BACKUPS/CUBE-DDBV4 --verbose

call rimraf K:\BACKUPS\DDBV4

rem backup this project, exclude node_modules .git but include .gitignore
node ddb.js backup K:\BACKUPS\DDBV4 --set-name=ddb --fstype=hash-v4 --from . --exclude node_modules --exclude .git --include .gitignore --verbose
rem backup this project, exclude node_modules .git but include .gitignore, then verify
rem note: verify compares the hash of the file in the index, with the actual file in the backup (to check for corruptions)
node ddb.js backup K:\BACKUPS\DDBV4 --set-name=ddb --from . --exclude node_modules --exclude .git --include .gitignore --verbose --verify

rem backup this project, exclude node_modules .git but include .gitignore, then verify and also byte-by-byte compare with the original
rem (both forms do the same thing, --compare implies verify)
node ddb.js backup K:\BACKUPS\DDBV4 --set-name=ddb --from . --exclude node_modules --exclude .git --include .gitignore --verbose --verify-and-compare
node ddb.js backup K:\BACKUPS\DDBV4 --set-name=ddb --from . --exclude node_modules --exclude .git --include .gitignore --verbose --compare

rem verify the last backup for ddb
node ddb.js verify K:\BACKUPS\DDBV4 --set-name=ddb --current --verbose

rem verify the last backup for ddb and compare with original files
node ddb.js verify K:\BACKUPS\DDBV4 --set-name=ddb --current --verbose --compare

rem verify all the files stored in the backup (against their hashes)
node ddb.js verify K:\BACKUPS\DDBV4

rem remove any orphaned backup files (files only belonging to instances subsequently removed)
node ddb.js clean K:\BACKUPS\DDBV4

rem restore the lib folder from latest version of the ddb backup to D:\TEMP\DDBV4REST
call rimraf D:\TEMP\DDBV4REST
node ddb.js restore K:\BACKUPS\DDBV4 --set-name=ddb --exclude ** --include lib --output D:\TEMP\DDBV4REST --verbose
dir /b/s D:\TEMP\DDBV4REST

rem list all backup sets and instances
node ddb.js list K:\BACKUPS\DDBV4

rem list all instances for named backup set
node ddb.js list K:\BACKUPS\DDBV4 --set-name ddb

rem list files in backup set specified by set name and timestamp (both formats of timestamp supported)
node ddb.js list K:\BACKUPS\DDBV4 --set-name=ddb --when=2019-03-24T20:09:03.766Z
node ddb.js list K:\BACKUPS\DDBV4 --set-name=ddb --when=20190324T200903766Z

rem list files in backup set specified by set name for the current (last) backup. (both formats do the same thing)
node ddb.js list K:\BACKUPS\DDBV4 --set-name ddb --current
node ddb.js list K:\BACKUPS\DDBV4 --set-name=ddb --when=current
