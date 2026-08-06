#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database_root="${VFS_LOCAL_MONGO_PATH:-${project_root}/.local-data/mongodb}"
log_path="${database_root}/mongod.log"
direct_uri="mongodb://127.0.0.1:27017/admin?directConnection=true"
project_mongod="${project_root}/.local-tools/mongodb-8/usr/bin/mongod"

if [[ -n "${VFS_MONGOD_BIN:-}" ]]; then
  mongod_bin="$VFS_MONGOD_BIN"
elif [[ -x "$project_mongod" ]]; then
  mongod_bin="$project_mongod"
else
  mongod_bin="$(command -v mongod || true)"
fi

if [[ -z "$mongod_bin" || ! -x "$mongod_bin" ]]; then
  echo "MongoDB server executable was not found. Install MongoDB 8 or set VFS_MONGOD_BIN." >&2
  exit 1
fi

mkdir -p "$database_root"

if mongosh "$direct_uri" --quiet --eval 'const hello=db.hello(); quit(hello.setName === "rs0" ? 0 : 2)' >/dev/null 2>&1; then
  exit 0
fi

if mongosh "$direct_uri" --quiet --eval 'quit(db.adminCommand({ping:1}).ok ? 0 : 1)' >/dev/null 2>&1; then
  echo "MongoDB port 27017 is occupied by a server that is not the required rs0 replica set." >&2
  exit 1
fi

echo "Starting local MongoDB with $($mongod_bin --version | sed -n '1s/^db version v//p')..."
if ! "$mongod_bin" \
  --fork \
  --dbpath "$database_root" \
  --logpath "$log_path" \
  --bind_ip 127.0.0.1 \
  --port 27017 \
  --replSet rs0; then
  echo "MongoDB failed to start. Recent log output:" >&2
  tail -20 "$log_path" >&2 || true
  exit 1
fi

for attempt in {1..20}; do
  if mongosh "$direct_uri" --quiet --eval 'quit(db.adminCommand({ping:1}).ok ? 0 : 1)' >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

mongosh "$direct_uri" --quiet --eval '
  try {
    rs.status();
  } catch (error) {
    if (error.codeName !== "NotYetInitialized") throw error;
    rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]});
  }
' >/dev/null

for attempt in {1..30}; do
  if mongosh "$direct_uri" --quiet --eval 'quit(db.hello().isWritablePrimary ? 0 : 1)' >/dev/null 2>&1; then
    echo "Local MongoDB replica set is ready."
    exit 0
  fi
  sleep 0.5
done

echo "Local MongoDB did not become primary. See ${log_path}." >&2
exit 1
