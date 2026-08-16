set DEST=c:\temp\ddb-backup-local
rmdir /S/Q %DEST%

rem test backup
node --inspect=9222 ../ddb.js backup %DEST% --set-name=test5 --verbose --source=.. --exclude node_modules --exclude dist --exclude .git

rem test verify backup
node --inspect=9222 ../ddb.js verify %DEST% --set-name test5 --verbose 

rem test verfy of backup destination (all backup instances)
node --inspect=9222 ../ddb.js verify %DEST% --verbose

rem restore backup to a new location
node --inspect=9222 ../ddb.js restore %DEST% --set-name test5 --verbose --output=c:\temp\ddb-backup-local-restore

rem verify the restored backup
node --inspect=9222 ../ddb.js verify c:\temp\ddb-backup-local --set-name test5 --verbose --compare-with=c:\temp\ddb-backup-local-restore

rem make sure verify finds a difference when we modify a file in the restored backup
rem should report two files that differ: README.md and tests/test.local.cmd
echo "This is a test modification" >> c:\temp\ddb-backup-local-restore\README.md
del /F c:\temp\ddb-backup-local-restore\tests\test.local.cmd
node --inspect=9222 ../ddb.js verify c:\temp\ddb-backup-local --set-name test5 --verbose --compare-with=c:\temp\ddb-backup-local-restore

rem this is a test to verify built executable works as expected
..\dist\ddb-win.exe verify %DEST% --verbose

rem -----------------------------------------------------------------------
rem rm tests
rem -----------------------------------------------------------------------

rem dry-run: show what would be removed (README.md) without changing anything
node ../ddb.js rm %DEST% --set-name test5 --dry-run README.md
node ../ddb.js verify %DEST% --set-name test5 --verbose

rem remove a single known file non-interactively, then verify it is gone from the log
node ../ddb.js rm %DEST% --set-name test5 --yes README.md
node ../ddb.js list %DEST% --set-name test5 --when current --verbose

rem verify the backup is still structurally valid (hash checks still pass for remaining files)
node ../ddb.js verify %DEST% --set-name test5 --verbose

rem remove all .cmd files non-interactively using a glob pattern
node ../ddb.js rm %DEST% --set-name test5 --yes **/*.cmd
rem --- list after rm *.cmd: no .cmd files should appear ---
node ../ddb.js list %DEST% --set-name test5 --when current --verbose

rem verify integrity once more after second rm
node ../ddb.js verify %DEST% --set-name test5 --verbose

rem dry-run without --when will show matches across all instances without touching them
node ../ddb.js rm %DEST% --set-name test5 --dry-run TODO.md

rem clean
node --inspect ../ddb.js clean %DEST% --verbose

rem ------------------------------------------------------------------------
rem test backup with a poisoned file to verify that hash mismatch is detected
rem ------------------------------------------------------------------------

rem poison the well
copy poisoned-apple.fruit.gz c:\temp\ddb-backup-local\files.db\69\bb\57b00a3ca55cb353e3337ef511c77e49cbb232384939eb5d71b6c631bd82.16

rem try and restore from the poisoned well, should fail with hash mismatch error
rmdir /S/Q c:\temp\ddb-backup-local-restore-2
node --inspect=9222 ../ddb.js restore %DEST% --set-name test5 --verbose --output=c:\temp\ddb-backup-local-restore-2

rem verify the restored backup, should fail with hash mismatch error
node --inspect=9222 ../ddb.js verify %DEST% --verbose