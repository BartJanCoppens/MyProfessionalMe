#!/usr/bin/env bash
# Runs supabase/tests/rls.sql against the linked project (rolled back) and fails on any FAIL row.
set -euo pipefail
cd "$(dirname "$0")/../.."
supabase db query --linked -f supabase/tests/rls.sql 2>/dev/null | python3 -c '
import sys, json
raw = sys.stdin.read().split("\nA new version")[0]
rows = json.loads(raw)["rows"]
bad = [r for r in rows if r["result"] != "PASS"]
for r in bad: print("FAIL", r["check_name"], "->", r["actual"])
print(f"{len(rows) - len(bad)}/{len(rows)} RLS checks pass")
sys.exit(1 if bad else 0)'
