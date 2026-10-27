"""Evaluate only reviewed pure Mac policy functions against an immutable snapshot.
No imports of worker/Telethon, runtime writes, sessions or network access.
The detailed output is private input to parity_audit.mjs, never a public report.
"""
import ast
import copy
from datetime import datetime
import json
from pathlib import Path
import sqlite3
import sys
from types import SimpleNamespace
from zoneinfo import ZoneInfo

snapshot=json.loads(Path(sys.argv[1]).read_text())
files={f['path']:f['body'] for f in snapshot['archive']}
rules=json.loads(files['unified-rules.json'])['groups'];registry=json.loads(files['group-registry.json'])
content=json.loads(files['unified-content.json']);now=snapshot['source']['exported_at']/1000
settings=snapshot['source']['settings']
ns={'datetime':datetime,'MOSCOW':ZoneInfo('Europe/Moscow'),'copy':copy,'CAMPAIGN':'paid-ab-20261006',
    'SHORT_TEXT':'USDT/USDC за безналичные рубли. @ccapital_acces',
    'worker':SimpleNamespace(setting=lambda db,key:settings.get(key))}
for filename,name in [('delivery_guard.py','interval'),('paid_expiry.py','valid_paid_term'),('unified_hourly.py','disposition'),('ad_variant.py','choose'),('paid_rotation.py','select')]:
    tree=ast.parse(files['service-code/'+filename]);fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
    exec(compile(ast.Module(body=[fn],type_ignores=[]),filename,'exec'),ns)
ns['delivery_interval']=ns['interval']
db=sqlite3.connect(':memory:')
db.executescript('CREATE TABLE attempts(id INTEGER PRIMARY KEY,chat_id INTEGER,created REAL,status TEXT); CREATE TABLE blocked(chat_id INTEGER PRIMARY KEY,reason TEXT); CREATE TABLE paid_variant_attempts(attempt_id INTEGER,chat_id INTEGER,campaign TEXT,variant TEXT,confirmed INTEGER);')
for a in snapshot['attempts']:db.execute('INSERT INTO attempts VALUES(?,?,?,?)',(int(a['id']),a['chat_id'],a['created']/1000,a['status']))
for b in snapshot['blocked']:db.execute('INSERT INTO blocked VALUES(?,?)',(b['chat_id'],b['reason']))
for v in snapshot['paid_variants']:db.execute('INSERT INTO paid_variant_attempts VALUES(?,?,?,?,?)',(int(v['attempt_id']),v['chat_id'],v['campaign'],v['variant'],v['confirmed']))
actual={cid:ns['disposition'](row,rules.get(cid),db,now) for cid,row in registry.items()}
# Potential recurring scope after successful deferred visibility checks. Permanent
# holds, uncertainty, exclusions and expired rules remain in force in this view.
db.execute("DELETE FROM blocked WHERE reason LIKE 'visibility_pending_%'")
potential={cid:ns['disposition'](row,rules.get(cid),db,now) for cid,row in registry.items()}
groups=[]
for g in snapshot['groups']:
    cid=str(g['chat_id']);rule=rules[cid];row=registry[cid]
    photo,text,bold=ns['choose'](rule,content,g['format']=='photo')
    try:
        selected,variant=ns['select'](db,g['chat_id'],rule,content)
        rotation=dict(variant=variant,text=selected['caption']) if variant else None
    except ValueError:
        rotation={'hold':True}
    groups.append(dict(chat_id=g['chat_id'],format='photo' if photo else 'text',text=text,bold_first_lines=bold,
                       interval_ms=ns['interval'](rule,now)*1000,rotation=rotation))
print(json.dumps(dict(actual=actual,potential=potential,groups=groups,
                     used_24h=db.execute('SELECT COUNT(*) FROM attempts WHERE created>?',(now-86400,)).fetchone()[0]),ensure_ascii=False))
