#!/bin/bash
set DEST=http://localhost:4444/
set ACCESS_KEY=7oZaUjuBUMj3olAQJJwr6RfvoT1E46AV

node ..\ddb.js backup  %DEST% --access-key=%ACCESS_KEY% --set-name=test5 --verbose --source=.. --exclude node_modules --exclude dist --exclude .git
node ..\ddb.js verify  %DEST% --access-key=%ACCESS_KEY% --set-name test5 --verbose
node ..\ddb.js restore %DEST% --access-key=%ACCESS_KEY% --set-name test5 --verbose --output=c:\temp\ddb-backup-remote-restore

rem The line below crashes the server OOPS!! (BUG NEEDS FIXING)
node ..\ddb.js verify %DEST% --access-key=%ACCESS_KEY% --verbose

rem this is a test to verify that the backup restored correctly
node ..\dist\ddb.js verify  %DEST% --access-key=%ACCESS_KEY% --set-name test5 --verbose
..\dist\ddb-win.exe verify  %DEST% --access-key=%ACCESS_KEY% --set-name test5 --verbose