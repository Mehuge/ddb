set DEST=c:\temp\ddb-backup-local
rmdir /S/Q %DEST%
node --inspect=9222 ../ddb.js backup %DEST% --set-name=test5 --verbose --source=.. --exclude node_modules --exclude dist --exclude .git
node --inspect=9222 ../ddb.js verify %DEST% --verbose
node --inspect=9222 ../ddb.js verify %DEST% --set-name test5 --verbose 
node --inspect=9222 ../ddb.js restore %DEST% --set-name test5 --verbose --output=c:\temp\ddb-backup-local-restore
rem this is a test to verify that the backup restored correctly
..\dist\ddb-win.exe verify %DEST% --verbose