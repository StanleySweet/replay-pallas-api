# Before/after harness

Checks that a change leaves what the API answers untouched, on a copy of real data.

1. Copy a database into a scratch folder laid out like the container: `dist/cache/replay-pallas.sqlite3`, with `dist/` from a build, and `src`, `node_modules`, `package.json` linked from here.
2. Start `node dist/index.js` there with `JOSE_SECRET=x API_PORT=18095` (the first start of a large copy takes a while: migrations, caches).
3. `API=http://localhost:18095 JOSE_SECRET=x MID=<a match id> LID=<a lobby player id> OUT=out-before node test/harness/capture.cjs`
4. Do the same with the changed build into `out-after`, from a fresh copy of the same database.
5. `diff -r out-before out-after`. Add `REBUILD=1` to also run the metadata rebuild and time the API while it runs.

Only data of a copy goes in `OUT`: it holds real nicknames, so never commit it. Never use the production secret: the token is signed with `JOSE_SECRET`, which is whatever you started the copy with.
Use Node 22 (the Docker image), or Node 24 with a better-sqlite3 built for it.
