@echo off
node backup.js --to L:\BACKUPS\DDB --fast --set-name ddb --from . --exclude node_modules --exclude .git --backup --verify --verbose
