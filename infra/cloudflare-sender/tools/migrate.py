"""Read-only Python ledger adapter. Never reads api.json or account.session.

--audit reads current non-secret configuration/history without stopping anything.
--cutover requires the Mac stop marker, stopped PID, released lock and paused config.
Output is private; it is never uploaded by this program.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import math
import os
import re
from pathlib import Path
import sqlite3
import time
from urllib.parse import quote

FILES = ('config.json', 'identity.json', 'unified-control.json', 'unified-rules.json',
         'unified-content.json', 'group-registry.json', 'group-operations-state.json')
PAID_HANDLES = {'exchange_cmsk', 'pointofexchange', 'obmenmsk7', 'currencyexchange_m',
                'obmenmsk01', 'obmenmsk1', 'exchange_moscow1', 'obmenvalytmoskva'}
STATUSES = {'pending', 'sent', 'sent_external', 'failed', 'uncertain', 'cancelled'}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def epoch(value):
    d = datetime.fromisoformat(value)
    if d.tzinfo is None:
        raise ValueError('timestamp_requires_timezone')
    return round(d.timestamp() * 1000)

def ms(value):
    n = float(value or 0)
    if not math.isfinite(n) or n < 0:
        raise ValueError('invalid_wait')
    return math.ceil(n * 1000)

def bold(text, count):
    if type(count) is not int or count not in (0, 2):
        raise ValueError('unsupported_bold_format')
    if not count:
        return []
    lines = text.splitlines()
    if len(lines) < count or any(not line for line in lines[:count]):
        raise ValueError('invalid_header')
    out, offset = [], 0
    for line in lines[:count]:
        length = len(line.encode('utf-16-le')) // 2
        out.append(dict(type='bold', offset=offset, length=length))
        offset += length + 1
    return out

def joined(row, rule):
    if row.get('membership') in ('joined', 'already_member') and not row.get('left'):
        return True
    if rule.get('verified_joined_at_utc'):
        return epoch(rule['verified_joined_at_utc']) > epoch(row.get('checked_at') or '1970-01-01T00:00:00+00:00')
    return False

def normalize_group(row, rule, cfg, content, settings, now):
    handle = row.get('handle', '').lower()
    if row.get('exclude') or handle in {'obmen_valyuty', 'obmen_chel'}:
        raise ValueError('source_exclusion')
    if row.get('availability_status') == 'temporarily_unavailable':
        raise ValueError('source_unavailable')
    if not joined(row, rule):
        raise ValueError('membership_not_confirmed')
    if rule.get('verified') is not True or not rule.get('evidence') or rule.get('permission') not in ('free', 'approved'):
        raise ValueError('permission_not_confirmed')
    if rule.get('day_basis', 'rolling_24h') != 'rolling_24h':
        raise ValueError('calendar_policy_not_supported')
    paid = rule.get('paid') is True
    if paid and (rule.get('payment_confirmed') is not True or rule.get('recurring_confirmed') is not True or not rule.get('paid_until')):
        raise ValueError('paid_terms_missing')
    use_photo = rule.get('allow_photos') is True and (paid or not row.get('default_send_photos_banned'))
    if paid and not use_photo:
        raise ValueError('paid_photo_permission_missing')
    if not use_photo and rule.get('allow_text') is not True:
        raise ValueError('no_authorized_format')
    text = content['caption'] if use_photo else content['text']
    entities = bold(text, content.get('caption_bold_first_lines', 0) if use_photo else 0)
    if use_photo:
        photo_hash = content['photo']['sha256']
        content_digest = digest(b'photo\0' + photo_hash.encode() + b'\0' + text.encode())
    else:
        content_digest = digest(text.encode())
    if entities:
        offsets = [(e['offset'], e['length']) for e in entities]
        content_digest = digest((content_digest + ':bold:' + str(offsets)).encode())
    gap = max(61, cfg['gap_seconds'])
    if paid and handle in PAID_HANDLES and rule.get('inter_group_gap_seconds') == 0:
        gap = 0
    elif rule.get('inter_group_gap_seconds') == 2:
        gap = 2
    channel_id = -row['id'] - 1000000000000
    if channel_id <= 0:
        raise ValueError('only_supergroups_supported')
    group = dict(chat_id=row['id'], channel_id=str(channel_id), handle=row['handle'], enabled=True,
                 paid=paid, interval_ms=ms(rule['interval_seconds']), slowmode_ms=ms(rule['slowmode_seconds']),
                 verified=True, evidence=rule['evidence'], permission=rule['permission'],
                 checked_at=epoch(rule['checked_at']), valid_until=epoch(rule['valid_until']),
                 daily_limit=rule.get('actual_daily_limit') or cfg['daily_limit'], day_basis='rolling_24h',
                 max_chars=min(rule.get('max_chars', 4096), 1024 if use_photo else 4096), max_lines=rule.get('max_lines', 100),
                 allow_links=rule['allow_links'], format='photo' if use_photo else 'text', text=text,
                 digest=content_digest, entities=entities, gap_ms=ms(gap), about=rule['about'] or '',
                 pinned_message_id=rule.get('pinned_message_id'), pinned_text=rule.get('pinned', ''),
                 refresh_on_live_check=bool(rule.get('refresh_on_live_check')) and not paid,
                 wait_until=max(ms(settings.get('group_wait:' + str(row['id']))), ms(row.get('retry_after'))))
    if group['checked_at'] > now:
        raise ValueError('future_policy_check')
    if use_photo:
        group.update(photo_sha256=photo_hash, photo_asset='/campaign.jpg')
    if paid:
        group.update(paid_until=epoch(rule['paid_until']), payment_confirmed=True, recurring_confirmed=True)
    if len(text.encode('utf-16-le'))//2 > group['max_chars'] or len(text.split('\n')) > group['max_lines']:
        raise ValueError('content_exceeds_group_limit')
    if not group['allow_links'] and re.search(r'https?://|tg://|www\.|t\.me/|@[a-z\d_]{3,}|\b[a-z\d-]+\.(?:com|ru|pro|net|org)\b',text,re.I):
        raise ValueError('content_links_forbidden')
    return group

def build_snapshot(root, final=False, now=None):
    now = round(time.time() * 1000) if now is None else now
    raw = {name: (root / name).read_bytes() for name in FILES}
    data = {name: json.loads(value) for name, value in raw.items()}
    cfg, ctrl, content = [data[n] for n in ('config.json', 'unified-control.json', 'unified-content.json')]
    if content.get('approved') is not True or content.get('account') != 'ccapital_acces' or cfg.get('expected_username', '').lstrip('@').lower() != 'ccapital_acces':
        raise ValueError('content_or_identity_not_approved')
    for name, key in [('unified-rules.json', 'rules_sha256'), ('unified-content.json', 'content_sha256')]:
        if digest(raw[name]) != ctrl.get(key):
            raise ValueError('approved_hash_mismatch:' + name)
    if type(cfg.get('daily_limit')) is not int or cfg['daily_limit'] < 1:
        raise ValueError('invalid_daily_limit')
    if final:
        assert_stopped(root)
        if cfg.get('paused') is not True:
            raise ValueError('mac_not_paused')
        sig = ctrl.get('config_signature', {})
        if sig.get('sha256') != digest(raw['config.json']) or sig.get('mtime_ns') != (root / 'config.json').stat().st_mtime_ns:
            raise ValueError('config_signature_mismatch')
    db = sqlite3.connect('file:' + quote(str(root / 'state.sqlite')) + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    try:
        db.execute('BEGIN')
        original = [dict(r) for r in db.execute('SELECT * FROM attempts ORDER BY id')]
        settings = {r['key']: r['value'] for r in db.execute('SELECT * FROM settings')}
        if any(k not in ('halt', 'wait_until') and not k.startswith('group_wait:') for k in settings):
            raise ValueError('unknown_setting_requires_mapping')
        blocked = {r['chat_id']: r['reason'] for r in db.execute('SELECT * FROM blocked')}
    finally:
        db.close()
    attempts = []
    for a in original:
        if set(a) != {'id', 'chat_id', 'created', 'status', 'digest', 'message_id', 'error'} or a['status'] not in STATUSES:
            raise ValueError('unknown_attempt_schema_or_status')
        attempts.append(dict(a, id=str(a['id']), created=round(a['created'] * 1000),
                             message_id=None if a['message_id'] is None else str(a['message_id']), source_created=a['created']))
    registry, rules = data['group-registry.json'], data['unified-rules.json']['groups']
    groups, omitted = [], []
    for cid, rule in rules.items():
        row = registry.get(cid)
        try:
            if row is None:
                raise ValueError('missing_registry_peer')
            groups.append(normalize_group(row, rule, cfg, content, settings, now))
        except (KeyError, ValueError, TypeError) as error:
            reason = str(error) if isinstance(error, ValueError) else 'unsupported_source_rule'
            omitted.append(dict(chat_id=int(cid), reason=reason))
            blocked.setdefault(int(cid), 'migration_hold:' + reason)
    gate = data['group-operations-state.json']
    halt = settings.get('halt', '') or str(gate.get('halt') or '')
    if (root / 'unresolved-paid-placement.json').exists():
        halt = halt or 'unresolved_paid_placement'
    if ctrl.get('enabled') is not True:
        halt = halt or 'source_dispatcher_disabled_requires_review'
    # Keep pending intact on import. They block activation; a later process recovery
    # changes them to uncertain with the original record retained separately.
    if any(a['status'] == 'pending' for a in attempts):
        halt = halt or 'interrupted_delivery_requires_review'
    hashes = {name: digest(value) for name, value in raw.items()}
    if any(digest((root / name).read_bytes()) != sha for name, sha in hashes.items()):
        raise ValueError('source_changed_retry_snapshot')
    return dict(version=1, groups=groups, attempts=attempts,
                blocked=[dict(chat_id=cid, reason=reason) for cid, reason in blocked.items()],
                daily_limit=cfg['daily_limit'], gap_ms=0,
                expected_user_id=str(data['identity.json']['user_id']), expected_username='ccapital_acces',
                wait_until=max(ms(settings.get('wait_until')), ms(gate.get('retry_after'))), halt=halt,
                source=dict(kind='python-unified-v1', final=final, exported_at=now, files_sha256=hashes,
                            settings=settings, paused=cfg['paused'], stopped_marker=(root / 'hourly-stop').exists(),
                            omitted_rules=omitted, registry_count=len(registry)))

def assert_stopped(root):
    if not (root / 'hourly-stop').is_file():
        raise ValueError('mac_stop_marker_required')
    pidfile = root / 'dispatcher-daemon.pid'
    if pidfile.exists():
        pid = int(pidfile.read_text().strip())
        if pid <= 1:
            raise ValueError('invalid_pid')
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            pass
        else:
            raise ValueError('mac_pid_still_alive')

def summary(s):
    return dict(final=s['source']['final'], groups=len(s['groups']), paid=sum(g['paid'] for g in s['groups']),
                attempts=dict(Counter(a['status'] for a in s['attempts'])),
                unresolved_ids=[a['id'] for a in s['attempts'] if a['status'] in ('pending', 'uncertain')],
                blocked=len(s['blocked']), omitted=len(s['source']['omitted_rules']), daily_limit=s['daily_limit'],
                wait_active=s['wait_until']>s['source']['exported_at'], halt=bool(s['halt']),
                secret_files_read=0, network_calls=0)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, required=True)
    mode=p.add_mutually_exclusive_group(required=True)
    mode.add_argument('--audit', action='store_true'); mode.add_argument('--cutover', action='store_true')
    p.add_argument('--output-dir', type=Path)
    args=p.parse_args()
    if args.audit:
        print(json.dumps(summary(build_snapshot(args.root)), ensure_ascii=False)); return
    if not args.output_dir:
        p.error('--cutover requires --output-dir outside the source directory')
    dest=args.output_dir.resolve();root=args.root.resolve()
    if dest==root or root in dest.parents or dest.exists():
        p.error('choose a new private backup directory outside the runtime')
    assert_stopped(root)
    with (root/'worker.lock').open('r') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        s=build_snapshot(root, final=True)
        os.umask(0o077);dest.mkdir(parents=True, mode=0o700)
        src=sqlite3.connect('file:'+quote(str(root/'state.sqlite'))+'?mode=ro',uri=True)
        backup=sqlite3.connect(dest/'state.sqlite');src.backup(backup);backup.close();src.close()
        payload=json.dumps(s,ensure_ascii=False,separators=(',',':')).encode()
        (dest/'snapshot.json').write_bytes(payload)
        (dest/'manifest.json').write_text(json.dumps(dict(summary(s),snapshot_sha256=digest(payload),backup_sha256=digest((dest/'state.sqlite').read_bytes())),indent=2))
        for name in FILES:
            (dest/name).write_bytes((root/name).read_bytes())
        photo=Path(json.loads((root/'unified-content.json').read_text())['photo']['path'])
        photo_data=photo.read_bytes()
        expected=json.loads((root/'unified-content.json').read_text())['photo']['sha256']
        if digest(photo_data)!=expected:
            raise ValueError('approved_photo_changed')
        (dest/'assets').mkdir(mode=0o700);(dest/'assets'/'campaign.jpg').write_bytes(photo_data)
        print(json.dumps(summary(s)))

if __name__=='__main__':
    main()
