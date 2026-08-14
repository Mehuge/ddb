#!/bin/bash
set DEST=c:\temp\ddb-backup-server
rmdir /s/Q %DEST%
mkdir %DEST%
copy test.server.config c:\temp\ddb-backup-server\auth.json
rem node --inspect-brk ddb.js server %DEST% --verbose
node ../ddb.js server %DEST% --verbose
