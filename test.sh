# rimraf D:/TEMP/DDBSQL
# time node backup.js --to D:/TEMP/DDBSQL --fstype hash-v1 --set-name ddb --from . --exclude .git --exclude node_modules --backup --verify --verbose
# time node backup.js --to D:/TEMP/DDBSQL --clean
# rimraf D:/TEMP/DDBSQL
# time node backup.js --to D:/TEMP/DDBSQL --fstype hash-v3 --set-name ddb --from . --exclude .git --exclude node_modules --backup --verify --verbose
# time node backup.js --to D:/TEMP/DDBSQL --clean
# rimraf D:/TEMP/DDBSQL
# time node backup.js --to D:/TEMP/DDBSQL --fstype hash-v2 --set-name ddb --from . --exclude .git --exclude node_modules --backup --verify --verbose
# time node backup.js --to D:/TEMP/DDBSQL --clean
rimraf D:/TEMP/DDBSQL
time node --inspect-brk backup.js --to D:/TEMP/DDBSQL --fstype hash-v3 --set-name ddb --from D:/APPS --backup --verify --verbose
