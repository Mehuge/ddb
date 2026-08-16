set DEST=c:\temp\ddb-backup-local
rmdir /S/Q %DEST%
node --inspect=9222 ../ddb.js backup %DEST% --set-name=test5 --verbose --source=.. --exclude node_modules --exclude dist --exclude .git
node --inspect=9222 ../ddb.js verify %DEST% --verbose
node --inspect=9222 ../ddb.js verify %DEST% --set-name test5 --verbose 
node --inspect=9222 ../ddb.js restore %DEST% --set-name test5 --verbose --output=c:\temp\ddb-backup-local-restore
rem this is a test to verify that the backup restored correctly
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