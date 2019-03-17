@echo off
node backup.js --to D:\TEMP\DDBSQL --fast --set-name ddb --from . --exclude node_modules --exclude .git --backup --verify --verbose
