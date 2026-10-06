"""Owner-run cutover utility. Never run this during development or an audit.

Reads the EXISTING authorized session only after the Mac stop/lock checks.
Transfers it to Cloudflare Secrets via stdin using the owner's existing Wrangler
login. No login code, new Telegram authorization, token, stdout secret, or temp file.
"""
import argparse
import base64
import fcntl
import json
from pathlib import Path
import sqlite3
import struct
import subprocess
from urllib.parse import quote
from migrate import assert_stopped

def encode_existing_session(dc, address, port, key):
    if type(dc) is not int or not 1 <= dc <= 5 or type(port) is not int or not 1 <= port < 32768 or not isinstance(key, bytes) or len(key) != 256:
        raise ValueError('existing_session_required')
    import ipaddress
    ipaddress.ip_address(address)
    encoded=address.encode('ascii')
    return '1'+base64.b64encode(struct.pack('>BH',dc,len(encoded))+encoded+struct.pack('>H',port)+key).decode('ascii')

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,required=True)
    p.add_argument('--owner-approved-cutover',action='store_true',required=True)
    p.add_argument('--transfer-existing-secrets',action='store_true',required=True)
    args=p.parse_args();root=args.root.resolve()
    assert_stopped(root)
    if json.loads((root/'config.json').read_text()).get('paused') is not True:
        p.error('Mac is not paused')
    project=Path(__file__).resolve().parents[1]
    if 'const LIVE_RELEASE = false;' not in (project/'src/worker.mjs').read_text():
        p.error('load credentials into the disabled review build first')
    with (root/'worker.lock').open('r') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        db=sqlite3.connect('file:'+quote(str(root/'account.session'))+'?mode=ro',uri=True)
        try:
            rows=db.execute('SELECT dc_id,server_address,port,auth_key FROM sessions').fetchall()
        finally:
            db.close()
        if len(rows)!=1:
            raise ValueError('ambiguous_session')
        session=encode_existing_session(*rows[0])
        api=json.loads((root/'api.json').read_text())
        import re
        if not str(api.get('api_id','')).isdigit() or not re.fullmatch(r'[a-fA-F0-9]{32}',api.get('api_hash','')):
            raise ValueError('invalid_existing_api_credentials')
        body=json.dumps({'TG_SESSION':session,'TG_API_ID':str(api['api_id']),'TG_API_HASH':api['api_hash']})
        # Do not print child output: CLI diagnostics must never echo submitted input.
        run=subprocess.run(['npx','--no-install','wrangler','secret','bulk','--config','wrangler.jsonc'],
                           cwd=project,input=body,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if run.returncode:
            raise RuntimeError('secret_transfer_failed; inspect the Cloudflare dashboard without sharing values')
    print('Existing Telegram credentials transferred to the disabled Worker. No Telegram connection opened. Sender remains disabled.')

if __name__=='__main__':
    main()
