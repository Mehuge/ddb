
Handling Log Files
==

The problem with log files is, they change, often they change a lot. The problem this creates for DDB is that every time it backs up, it will back up a new, entire copy of the log file.

I am not too worried about the impact this has on disk space, every night a new copy of the log file stored in the has file system, because as old backups are remove, so will old copies of these log files, releasing the space again. Also, they are compressed.

The problem I want to solve is the client sending the file over the network, because atm it sends the whole log file, ever increasing in size, ever time it backs up.

The current process boils down to this:

```
C: GET /fs/has/<hash>
S: 401 Not Found
C: POST /fs/put/<hash>
<contents of file>
S: 200 OK
```

What we could do is add an extra step between the has and put ops.

```
C: GET /fs/has/<hash>
S: 401 Not Found
C: POST /list/current { source, filename }
S: 200 OK { signature, size }
```

The client at this point knows it needs to backup the file but that there is a previous version of the file on the server, that has the rdiff signature. So the client performs an rdiff between the new file, using the signature and sends a diff to the server.  The diff will use the following format:

```
C: POST /fs/put-rdiff/<hash>
F hash
C offset length
D length
<stream-data-length-bytes>
C offset length
... repeat as necessary ...
EOF
S: 200 OK
```

The server will then use the orignal file based on F hash, and the rdiff instructions + data to reconstruct the new file from the old one. The rdiff algorithm will be performed on the client, in its simplest form it will simply do a block by block comparison.

```
get signature for new file
block = 0
send old-hash
while block < new file block count
  if old signature block 0 = new signature block 0
    send C block * blockSize, blockSize
  else
    send D blockSize
    send data from source offset block*blockSize, blockSize
  fi
end while
send EOF
```

It should group adjacent copyies into a single copy instruction.

Perhaps in the future (`fstype: hash-v6`?)
==
It might be possible to allow differences between files to be stored in the hash file system, but the cost of doing so would be the creation of hash diff chains that would slow down retrieval of those files from the file system

hash1 logfile.log
hash2 diff hash1
hash3.diff logfile.log diff
hash3 diff hash2
hash3.diff logfile.log diff
...

So if I want to checkout hash3, I need to go up the hash chain, hash2, hash1 grab hash1 contents, apply hash2 diff, apply hash3 diff, then I have the hash3 file. Filesystem clean can't just remove hashes not referenced in indexes anymore it has to check they are not referenced in any hash diff chains.
