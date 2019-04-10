
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
S: 200 OK { hash, size }
```

The client at this point knows it needs to backup the file but that there is a previous version of the file on the server, that up to size bytes had the returned hash. So the client hashes that portion of the file to be backed up. If it's different, the client just sends the whole file. If they are the same though that means the file has simply been appended to, so the client can send a partial file.

```
C: POST /fs/partial { oldhash, newhash, newsize, tail }
S: 200 OK
```

The server can then effectively `gunzip < oldhash | cat - tail | gzip > newhash` to create then new hash version without the client having to send all the data over the network.

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
