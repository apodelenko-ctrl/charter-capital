"""Prepare a NEW paused Mac database from a stopped cloud export.
Never overwrites the running Mac database, starts a process or reads a session.
"""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import shutil
from migrate import digest

def prepare(cloud, backup, out):
    backup=backup.resolve();out=out.resolve()
    if cloud.get('version')!=2 or cloud.get('control',{}).get('enabled'):
        raise ValueError('stopped_cloud_export_required')
    source=json.loads((backup/'snapshot.json').read_text())
    if cloud.get('source',{}).get('files_sha256')!=source['source']['files_sha256']:
        raise ValueError('cutover_backup_mismatch')
    if out.exists():raise ValueError('choose_new_output_directory')
    os.umask(0o077);out.mkdir(parents=True,mode=0o700)
    for f in cloud['archive']:
        p=Path(f['path'])
        if p.is_absolute() or '..' in p.parts or digest(f['body'].encode())!=f['sha256'] or any(x in f['path'].lower() for x in ('session','api.json','credentials')):raise ValueError('invalid_archive')
        target=out/p;target.parent.mkdir(parents=True,exist_ok=True,mode=0o700);target.write_text(f['body'])
    db=sqlite3.connect(out/'state.sqlite')
    originals={r['id']:json.loads(r['original']) for r in cloud['imported_attempts']}
    numeric=[int(a['id']) for a in cloud['attempts'] if str(a['id']).isdigit()]
    next_id=max(numeric,default=0)+1;mapping={}
    try:
        db.executescript('CREATE TABLE attempts(id INTEGER PRIMARY KEY,chat_id INTEGER NOT NULL,created REAL NOT NULL,status TEXT NOT NULL,digest TEXT NOT NULL,message_id INTEGER,error TEXT); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE blocked(chat_id INTEGER PRIMARY KEY,reason TEXT NOT NULL); CREATE TABLE paid_variant_attempts(attempt_id INTEGER PRIMARY KEY,chat_id INTEGER NOT NULL,campaign TEXT NOT NULL,variant TEXT NOT NULL,confirmed INTEGER NOT NULL);')
        for a in cloud['attempts']:
            if not a.get('submitted',1):continue # preflight checks never consumed Mac sending quota
            if a['status'] not in ('pending','sent','sent_external','failed','uncertain','cancelled'):
                raise ValueError('unknown_cloud_status')
            if str(a['id']).isdigit():aid=int(a['id'])
            else:aid=next_id;next_id+=1
            mapping[a['id']]=aid
            original=originals.get(a['id'],{})
            created=original.get('source_created',a['created']/1000)
            # Cloud SQL normalizes NULL to ''. Restore the original representation
            # only while the error is unchanged; preserve newer review/recovery errors.
            error=original.get('error') if original and a['error']==(original.get('error') or '') else a['error']
            db.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?)',(aid,a['chat_id'],created,a['status'],a['digest'],
                None if a['message_id'] is None else int(a['message_id']),error))
        for v in cloud['paid_variants']:
            if v['attempt_id'] not in mapping:raise ValueError('variant_attempt_missing')
            db.execute('INSERT INTO paid_variant_attempts VALUES(?,?,?,?,?)',(mapping[v['attempt_id']],v['chat_id'],v['campaign'],v['variant'],v['confirmed']))
        for b in cloud['blocked']:
            reason=b['reason']
            for aid,mac_id in mapping.items():
                if reason=='visibility_pending_'+aid or reason=='delivery_quarantine_'+aid or reason.startswith('delivery_quarantine_'+aid+'_'):
                    prefix='visibility_pending_' if reason.startswith('visibility_pending_') else 'delivery_quarantine_'
                    reason=prefix+str(mac_id)+reason[len(prefix+aid):];break
            db.execute('INSERT INTO blocked VALUES(?,?)',(b['chat_id'],reason))
        c=cloud['control'];halt=c.get('halt','')
        if any(a['status']=='pending' for a in cloud['attempts']):halt=halt or 'cloud_pending_requires_review'
        if halt:db.execute('INSERT INTO settings VALUES(?,?)',('halt',halt))
        db.execute('INSERT INTO settings VALUES(?,?)',('wait_until',str(c['wait_until']/1000)))
        for g in cloud['groups']:
            if g['wait_until']:db.execute('INSERT INTO settings VALUES(?,?)',('group_wait:'+str(g['chat_id']),str(g['wait_until']/1000)))
        # All original group waits, including peers outside the active registry.
        for key,value in cloud['source'].get('settings',{}).items():
            if key.startswith('group_wait:'):
                db.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=CAST(MAX(CAST(value AS REAL),CAST(excluded.value AS REAL)) AS TEXT)',(key,value))
        db.commit()
    finally:db.close()
    for name in ['config.json','identity.json','unified-control.json','unified-rules.json','unified-content.json','group-registry.json','group-operations-state.json']:
        (out/name).write_bytes((backup/name).read_bytes())
    (out/'visibility-queue').mkdir(exist_ok=True,mode=0o700)
    variants={v['attempt_id']:v for v in cloud['paid_variants']}
    for v in cloud['visibility']:
        spec=json.loads(v['spec']);original=json.loads(v.get('original') or 'null') or {}
        job=dict(original,attempt_id=mapping[v['attempt_id']],chat_id=v['chat_id'],message_id=int(v['message_id']),
                 cycle_id=original.get('cycle_id','cloud-'+v['attempt_id']),text=spec['text'],photo=spec['format']=='photo',
                 bold_first_lines=spec.get('bold_first_lines',original.get('bold_first_lines',0)),
                 bold_spans=spec.get('bold_spans',original.get('bold_spans')),
                 paid_variant=variants.get(v['attempt_id'],{}).get('variant'),
                 status={'pending':'queued','verified':'verified','quarantined':'quarantined'}[v['state']],
                 visible=v['state']=='verified',checked_at=v['checked_at']/1000)
        (out/'visibility-queue'/(str(job['attempt_id'])+'.json')).write_text(json.dumps(job,ensure_ascii=False))
    manifest_path=out/'service-code-manifest.json'
    if manifest_path.exists():
        manifest=json.loads(manifest_path.read_text());manifest['runtime_code']=str(out/'service-code')
        manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    if (backup/'assets').is_dir():
        shutil.copytree(backup/'assets',out/'assets')
        content=json.loads((out/'unified-content.json').read_text())
        photos=[content['photo']]+[v['photo'] for v in content.get('paid_rotation',{}).get('variants',{}).values()]
        for photo in photos:
            p=out/'assets'/(photo['sha256']+Path(photo['path']).suffix.lower())
            if not p.is_file() or digest(p.read_bytes())!=photo['sha256']:raise ValueError('rollback_asset_missing')
            photo['path']=str(p)
        (out/'unified-content.json').write_text(json.dumps(content,ensure_ascii=False,indent=2))
    cfg=json.loads((out/'config.json').read_text());cfg['paused']=True;cfg['daily_limit']=cloud['control']['daily_limit']
    (out/'config.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2))
    ctrl=json.loads((out/'unified-control.json').read_text());ctrl['enabled']=False
    ctrl['content_sha256']=digest((out/'unified-content.json').read_bytes())
    ctrl['config_signature']={'sha256':digest((out/'config.json').read_bytes()),'mtime_ns':(out/'config.json').stat().st_mtime_ns}
    (out/'unified-control.json').write_text(json.dumps(ctrl,indent=2));(out/'hourly-stop').touch()
    (out/'cloud-export.json').write_text(json.dumps(cloud,ensure_ascii=False))
    (out/'cloud-id-map.json').write_text(json.dumps(mapping,indent=2))
    (out/'rules-reconciliation.json').write_text(json.dumps({'required_before_restart':True,'cloud_groups':cloud['groups'],'reviews':cloud['reviews']},ensure_ascii=False,indent=2))
    return {'prepared':True,'paused':True,'attempts':len(mapping),'rules_review_required':True,'mac_files_changed':0}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cloud-export',type=Path,required=True);p.add_argument('--cutover-backup',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True);p.add_argument('--cloud-stopped',action='store_true',required=True)
    a=p.parse_args();print(json.dumps(prepare(json.loads(a.cloud_export.read_text()),a.cutover_backup,a.output)))
if __name__=='__main__':main()
