import base64
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

TOOLS=Path(__file__).resolve().parents[1]/'tools'
sys.path.insert(0,str(TOOLS))
from migrate import build_snapshot,digest,assert_stopped
from owner_secrets import encode_existing_session
from rollback import prepare

NOW=1791255600000

def fixture(root):
    cfg={'paused':True,'daily_limit':24000,'gap_seconds':120,'expected_username':'ccapital_acces'}
    rule={'paid':True,'verified':True,'permission':'approved','evidence':'Synthetic approval','checked_at':'2026-10-05T00:00:00+00:00',
          'valid_until':'2026-10-07T00:00:00+00:00','paid_until':'2026-10-07T00:00:00+00:00','payment_confirmed':True,'recurring_confirmed':True,
          'allow_photos':True,'allow_links':False,'interval_seconds':300,'slowmode_seconds':0,'about':'fixture rules','pinned':''}
    cid=-1000000000123
    values={'config.json':cfg,'identity.json':{'user_id':123456},
      'unified-rules.json':{'groups':{str(cid):rule}},'group-registry.json':{str(cid):{'id':cid,'handle':'fixture_group','membership':'joined'}},
      'unified-content.json':{'approved':True,'account':'ccapital_acces','text':'Synthetic text','caption':'Fixture header\nFixture subtitle\nBody','caption_bold_first_lines':2,'photo':{'path':'/not-read-in-audit.jpg','sha256':'a'*64}},
      'group-operations-state.json':{'retry_after':NOW/1000+300}}
    for name,value in values.items():(root/name).write_text(json.dumps(value))
    ctrl={'enabled':True,'rules_sha256':digest((root/'unified-rules.json').read_bytes()),'content_sha256':digest((root/'unified-content.json').read_bytes()),
          'config_signature':{'sha256':digest((root/'config.json').read_bytes()),'mtime_ns':(root/'config.json').stat().st_mtime_ns}}
    (root/'unified-control.json').write_text(json.dumps(ctrl));(root/'worker.lock').touch()
    db=sqlite3.connect(root/'state.sqlite')
    db.executescript('CREATE TABLE attempts(id INTEGER PRIMARY KEY,chat_id INTEGER NOT NULL,created REAL NOT NULL,status TEXT NOT NULL,digest TEXT NOT NULL,message_id INTEGER,error TEXT); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE blocked(chat_id INTEGER PRIMARY KEY,reason TEXT NOT NULL);')
    for i in [19,22,157]:db.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?)',(i,cid,NOW/1000-100+i/1000,'uncertain','original digest',None,'original error'))
    db.execute('INSERT INTO attempts VALUES(158,?,?,?,?,?,?)',(cid,NOW/1000-1,'pending','pending digest',None,None))
    db.execute('INSERT INTO settings VALUES(?,?)',('group_wait:'+str(cid),str(NOW/1000+600)))
    db.execute('INSERT INTO settings VALUES(?,?)',('wait_until',str(NOW/1000+30)))
    db.execute('INSERT INTO blocked VALUES(?,?)',(-1000000000999,'old non-registry hold'))
    db.commit();db.close()

class Migration(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);fixture(self.root)
    def tearDown(self):self.temp.cleanup()
    def test_lossless_attempts_waits_rules_and_no_session_required(self):
        s=build_snapshot(self.root,now=NOW)
        self.assertEqual([a['id'] for a in s['attempts']],['19','22','157','158'])
        self.assertEqual([a['status'] for a in s['attempts']],['uncertain']*3+['pending'])
        self.assertEqual(s['attempts'][0]['source_created'],NOW/1000-100+19/1000)
        self.assertEqual(s['blocked'][0]['chat_id'],-1000000000999)
        self.assertEqual(s['wait_until'],NOW+300000)
        self.assertEqual(s['groups'][0]['wait_until'],NOW+600000)
        self.assertEqual(s['daily_limit'],24000)
        self.assertEqual(s['groups'][0]['entities'][1]['offset'],15)
        self.assertEqual(s['halt'],'interrupted_delivery_requires_review')
    def test_final_requires_mac_stop(self):
        with self.assertRaisesRegex(ValueError,'mac_stop_marker'):build_snapshot(self.root,final=True,now=NOW)
        (self.root/'hourly-stop').touch()
        s=build_snapshot(self.root,final=True,now=NOW);self.assertTrue(s['source']['final'])
    def test_running_pid_blocks_cutover(self):
        import os
        (self.root/'hourly-stop').touch();(self.root/'dispatcher-daemon.pid').write_text(str(os.getpid()))
        with self.assertRaisesRegex(ValueError,'still_alive'):assert_stopped(self.root)
    def test_changed_approval_hash_refuses_export(self):
        with (self.root/'unified-content.json').open('a') as f:f.write(' ')
        with self.assertRaisesRegex(ValueError,'approved_hash'):build_snapshot(self.root,now=NOW)
    def test_bad_group_content_is_held_without_losing_history(self):
        p=self.root/'unified-content.json';c=json.loads(p.read_text());c['caption']='https://example.com';c['caption_bold_first_lines']=0;p.write_text(json.dumps(c))
        p=self.root/'unified-control.json';c=json.loads(p.read_text());c['content_sha256']=digest((self.root/'unified-content.json').read_bytes());p.write_text(json.dumps(c))
        s=build_snapshot(self.root,now=NOW);self.assertEqual(len(s['groups']),0);self.assertEqual(len(s['attempts']),4)
        self.assertEqual(s['source']['omitted_rules'][0]['reason'],'content_links_forbidden')
    def test_owner_session_encoder_only_with_existing_key(self):
        with self.assertRaises(ValueError):encode_existing_session(1,'203.0.113.1',443,b'')
        encoded=encode_existing_session(1,'203.0.113.1',443,b'\x01'*256)
        raw=base64.b64decode(encoded[1:]);self.assertEqual(raw[0],1);self.assertEqual(raw[-256:],b'\x01'*256)
        self.assertEqual(int.from_bytes(raw[1:3],'big'),11)
    def test_rollback_preserves_ids_times_and_holds_in_new_paused_database(self):
        s=build_snapshot(self.root,now=NOW);(self.root/'snapshot.json').write_text(json.dumps(s))
        attempts=[dict(a,error=a['error'] or '') for a in s['attempts']]
        attempts.append(dict(id='cloud-uuid',chat_id=-1000000000123,created=NOW,status='sent',digest='cloud digest',message_id='42',error=''))
        cloud=dict(version=1,control=dict(enabled=False,wait_until=s['wait_until'],halt=s['halt'],daily_limit=24000),
                   source=s['source'],attempts=attempts,blocked=s['blocked'],reviews=[],
                   groups=[dict(chat_id=g['chat_id'],wait_until=g['wait_until'],spec=json.dumps(g)) for g in s['groups']],
                   imported_attempts=[dict(id=a['id'],original=json.dumps(a)) for a in s['attempts']])
        dest=self.root/'restore';result=prepare(cloud,self.root,dest)
        self.assertEqual(result['attempts'],5);self.assertTrue(result['paused'])
        db=sqlite3.connect(dest/'state.sqlite')
        self.assertEqual(db.execute('SELECT status,created FROM attempts WHERE id=19').fetchone(),('uncertain',s['attempts'][0]['source_created']))
        self.assertEqual(db.execute('SELECT message_id FROM attempts WHERE id=159').fetchone()[0],42)
        self.assertEqual(db.execute('SELECT count(*) FROM blocked').fetchone()[0],1);db.close()
        self.assertTrue((dest/'hourly-stop').exists())
        self.assertFalse(json.loads((dest/'unified-control.json').read_text())['enabled'])

if __name__=='__main__':unittest.main()
