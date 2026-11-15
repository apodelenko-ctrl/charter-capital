"""Build a REVIEW copy of the existing desk, never edit or deploy the source."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    args=p.parse_args()
    if args.output.exists():p.error('output must be a new review directory')
    src=args.source.resolve();dest=args.output.resolve();base=Path(__file__).resolve().parents[1]
    if dest==src or src in dest.parents:p.error('output must be outside the source checkout')
    worker=(src/'worker.mjs').read_text()
    for required in ['export class DeskObject','env.ADMIN_SECRET','/admin/','blockConcurrencyWhile','owner_id']:
        if required not in worker:p.error('desk source changed; review adapter compatibility')
    dest.mkdir(parents=True)
    # Explicitly copy source code only; never credentials, data or .dev.vars.
    for name in ['engine.mjs','copy.mjs','package.json','package-lock.json','wrangler.jsonc']:
        shutil.copyfile(src/name,dest/name)
    (dest/'desk-original.mjs').write_text(worker)
    shutil.copyfile(base/'integration/desk-adapter.mjs',dest/'worker.mjs')
    shutil.copyfile(base/'src/report.mjs',dest/'report.mjs')
    shutil.copyfile(base/'src/report-query-input.mjs',dest/'report-query-input.mjs')
    (dest/'REVIEW-ONLY.json').write_text(json.dumps({'original_worker_sha256':hashlib.sha256(worker.encode()).hexdigest(),
        'not_deployed':True,'required_binding':{'binding':'SENDER_CONTROL','service':'charter-cloudflare-sender','entrypoint':'SenderControl'},
        'required_sender_binding':{'binding':'REPORTS','service':'charter-telegram-desk','entrypoint':'SenderReports'},
        'future_sender_hourly_cron':'0 * * * *','future_desk_watchdog_cron':'10 * * * *'},indent=2))
    print('Review copy prepared; no binding, secret, schedule or deployment changed.')

if __name__=='__main__':main()
