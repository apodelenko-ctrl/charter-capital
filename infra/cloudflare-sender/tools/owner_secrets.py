"""Owner-run cutover utility. Never run this during development or an audit.

Reads the EXISTING authorized session only after the Mac stop/lock checks.
Stages it in an UNDEPLOYED Cloudflare version via stdin using the owner's existing
Wrangler login. No Telegram connection, new authorization, stdout secret, or temp
file. --check-only never opens the secret files or uses the network. An explicitly
delegated owner transfer requires --owner-delegated-cutover as well as the cutover
approval flag; it preserves all stop/lock/OFF checks and skips only the TTY prompt.
"""
import argparse
import base64
import fcntl
import json
import os
from pathlib import Path
import re
import sqlite3
import struct
import subprocess
import sys
from urllib.parse import quote
from migrate import assert_stopped, digest

ACCOUNT_ID='fd0c7f5f0d6f026a7a3ff5478ab90e09'
WORKER_NAME='charter-cloudflare-sender'

def check_project(project):
    if 'const LIVE_RELEASE = false;' not in (project/'src/worker.mjs').read_text():
        raise ValueError('disabled_local_build_required')
    if not (project/'node_modules/wrangler/bin/wrangler.js').is_file():
        raise ValueError('reviewed_local_wrangler_required')

def check_mac(root):
    assert_stopped(root)
    config=root/'config.json';control=json.loads((root/'unified-control.json').read_text())
    if json.loads(config.read_text()).get('paused') is not True:
        raise ValueError('mac_not_paused')
    if control.get('enabled') is not False:
        raise ValueError('mac_control_must_be_disabled')
    if control.get('config_signature')!={'sha256':digest(config.read_bytes()),'mtime_ns':config.stat().st_mtime_ns}:
        raise ValueError('mac_config_signature_mismatch')

def transfer_environment():
    env=os.environ.copy()
    env.update(WRANGLER_WRITE_LOGS='false',WRANGLER_LOG_SANITIZE='true',WRANGLER_LOG='log',
               WRANGLER_SEND_METRICS='false',CI='true',npm_config_logs_max='0',
               CLOUDFLARE_ACCOUNT_ID=ACCOUNT_ID,CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV='false')
    # Use the existing owner login; do not create a token or allow a debugger to
    # observe the child process containing the stdin payload.
    env.pop('NODE_OPTIONS',None)
    if (Path.home()/'.wrangler/config/default.toml').is_file():env['WRANGLER_HOME']=str(Path.home()/'.wrangler')
    return env

def read_existing_payload(root):
    db=sqlite3.connect('file:'+quote(str(root/'account.session'))+'?mode=ro',uri=True)
    try:rows=db.execute('SELECT dc_id,server_address,port,auth_key FROM sessions').fetchall()
    finally:db.close()
    if len(rows)!=1:raise ValueError('ambiguous_session')
    session=encode_existing_session(*rows[0])
    api=json.loads((root/'api.json').read_text())
    if not str(api.get('api_id','')).isdigit() or not re.fullmatch(r'[a-fA-F0-9]{32}',api.get('api_hash','')):
        raise ValueError('invalid_existing_api_credentials')
    return json.dumps({'TG_SESSION':session,'TG_API_ID':str(api['api_id']),'TG_API_HASH':api['api_hash']})

def owner_confirmation():
    if not sys.stdin.isatty():raise ValueError('owner_terminal_required')
    print('Mac остановлен. Существующие данные будут переданы в НЕРАЗВЁРНУТУЮ версию Cloudflare.')
    print('Никаких кодов Telegram, паролей или значений секретов вводить не нужно.')
    return input('Для подтверждения лично введите ПЕРЕНЕСТИ: ').strip()=='ПЕРЕНЕСТИ'

def stage_existing(root,project,confirm=owner_confirmation,run=subprocess.run):
    check_project(project)
    with (root/'worker.lock').open('r') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        check_mac(root)
        if not confirm():return {'staged':False,'cancelled':True,'deployed':False}
        check_mac(root)
        body=read_existing_payload(root)
        # Unlike `secret bulk`, this command DOES NOT deploy the new version.
        result=run(['node',str(project/'node_modules/wrangler/bin/wrangler.js'),'versions','secret','bulk',
                    '--config','wrangler.jsonc','--name',WORKER_NAME,'--tag','owner-staged',
                    '--message','Owner staged existing credentials; no deployment'],
                   cwd=project,input=body,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                   env=transfer_environment(),timeout=180)
        if result.returncode:raise RuntimeError('secret_staging_failed')
        match=re.search(r'Created version ([a-f0-9-]{36}) with 3 secrets',result.stdout or '')
        return {'staged':True,'deployed':False,'version_id':match.group(1) if match else None}

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
    p.add_argument('--owner-approved-cutover',action='store_true')
    p.add_argument('--owner-delegated-cutover',action='store_true',help='Use only after the owner explicitly authorizes the agent to transfer existing credentials')
    mode=p.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check-only',action='store_true',help='Read non-secret readiness only; no network or transfer')
    mode.add_argument('--transfer-existing-secrets',action='store_true')
    args=p.parse_args();root=args.root.resolve()
    project=Path(__file__).resolve().parents[1]
    if args.check_only:
        try:
            check_project(project)
            with (root/'worker.lock').open('r') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);check_mac(root)
            ready=True;reason='ready_for_owner_confirmation'
        except BlockingIOError:ready=False;reason='mac_worker_lock_busy'
        except ValueError as error:ready=False;reason=str(error)
        except (OSError,KeyError):ready=False;reason='readiness_files_unavailable'
        print(json.dumps(dict(ready=ready,reason=reason,secret_files_read=0,network_calls=0,transferred=False),ensure_ascii=False));return
    if not args.owner_approved_cutover:p.error('agreed cutover and owner confirmation required')
    try:
        if args.owner_delegated_cutover:
            result=stage_existing(root,project,confirm=lambda:True)
        else:
            result=stage_existing(root,project)
    except (Exception,KeyboardInterrupt):
        # Never echo child diagnostics, payloads or exception values after entry.
        print('Передача не подтверждена. Ничего не развёрнуто этой утилитой. Перед повтором проверьте версии Worker; Mac оставьте остановленным.',file=sys.stderr)
        raise SystemExit(1)
    print(json.dumps(result))
    print('Cloudflare sender не включён. Передайте оператору только version_id; секреты отправлять не нужно.')

if __name__=='__main__':
    main()
