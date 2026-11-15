"""Owner CLI for the existing desk admin path. No new access key or public route.
Only usable AFTER the reviewed desk adapter/service bindings are installed.
"""
import argparse
import getpass
import json
import os
from pathlib import Path
import urllib.request
from urllib.parse import urlsplit

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('action',choices=['status','health','stop','import','export','review','rules','activate','preflight','cutover','recent'])
    p.add_argument('--desk-url',required=True)
    p.add_argument('--file',type=Path)
    p.add_argument('--owner-approved-cutover',action='store_true')
    args=p.parse_args();url=urlsplit(args.desk_url)
    if url.scheme!='https' or url.username or url.password or url.query or url.fragment or url.path not in ('','/'):
        p.error('use the existing HTTPS desk origin')
    if args.action in ('activate','preflight','cutover') and not args.owner_approved_cutover:
        p.error('activation/preflight requires the separately approved cutover')
    body=None
    if args.action in ('import','review','rules','preflight','cutover'):
        if not args.file:p.error('--file required')
        data=json.loads(args.file.read_text())
        if args.action=='import' and data.get('source',{}).get('final') is not True:
            p.error('only a stopped-Mac final snapshot may be imported')
        body=json.dumps(data).encode()
    if args.action=='export' and (not args.file or args.file.exists()):
        p.error('export requires a new private --file')
    token=getpass.getpass('Existing desk ADMIN_SECRET (hidden; never paste in chat): ')
    if not token:p.error('existing credential required')
    request=urllib.request.Request(args.desk_url.rstrip('/')+'/admin/sender/'+args.action,
        data=body,method='GET' if args.action in ('status','health','export','recent') else 'POST',
        headers={'Authorization':'Bearer '+token,'Content-Type':'application/json',
                 'User-Agent':'CharterCapital-Control/2026-10-08'})
    # Prevent a server redirect from forwarding the admin credential elsewhere.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    try:
        with urllib.request.build_opener(NoRedirect).open(request,timeout=60) as r:result=json.load(r)
    except Exception:
        raise SystemExit('Operation not confirmed. Read status before retrying; never share credentials or raw headers.')
    if args.action=='export':
        os.umask(0o077)
        with args.file.open('x') as f:json.dump(result,f,ensure_ascii=False)
        print('Paused cloud history exported locally.')
    else:
        print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
