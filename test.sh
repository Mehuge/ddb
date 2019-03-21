# rimraf D:/TEMP/DDBSQL
# time node backup.js --to D:/TEMP/DDBSQL --fstype hash-v1 --set-name ddb --from . --exclude .git --exclude node_modules --backup --verify --verbose
# time node backup.js --to D:/TEMP/DDBSQL --clean
# rimraf D:/TEMP/DDBSQL
# time node backup.js --to D:/TEMP/DDBSQL --fstype hash-v3 --set-name ddb --from . --exclude .git --exclude node_modules --backup --verify --verbose
# time node backup.js --to D:/TEMP/DDBSQL --clean
# rimraf D:/TEMP/DDBSQL
time node ddb.js backup --to D:/TEMP/DDBSQL --fstype hash-v2 --set-name ddb --from D:/DEV/DDB --exclude .git --exclude node_modules --backup --verify --verbose
time node ddb.js clean --to D:/TEMP/DDBSQL
# rimraf D:/TEMP/DDBSQL
# time node --inspect-brk backup.js --to D:/TEMP/DDBSQL --fstype hash-v3 --set-name ddb --from D:/APPS --backup --verify --verbose

# rimraf ~/backups/TEST3
# time node backup.js --to ~/backups/TEST3 --fstype hash-v3 --fast --set-name trunk --from ~/Sites/RMC2/trunk --backup
# time node backup.js --to ~/backups/TEST3 --fast --set-name 0.10 --from ~/Sites/RMC2/branches/0.10 --backup
# time node backup.js --to ~/backups/TEST3 --fast --set-name 0.9 --from ~/Sites/RMC2/branches/0.9 --backup
