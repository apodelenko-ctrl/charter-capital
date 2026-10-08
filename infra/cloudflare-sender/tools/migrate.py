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
                'obmenmsk01', 'obmenmsk1', 'exchange_moscow1', 'obmenvalytmoskva', 'obmen_valyuty'}
STATUSES = {'pending', 'sent', 'sent_external', 'failed', 'uncertain', 'cancelled'}
SHORT_TEXT = 'USDT/USDC за безналичные рубли. @ccapital_acces'
CAMPAIGN = 'paid-ab-20261006'
ROTATION_B_TEXT = 'USDT за БЕЗНАЛИЧНЫЙ РУБЛЬ\nВЫГОДА на курсе ДО 3 ₽ за USDT\nℹ️ Расчёт через нерезидента.\nhttps://ccapital.pro/crypto-change/'
ARCHIVE_FILES = ('service-code-manifest.json', 'finite-candidates-168-20261007.json',
                 'growth-queue.json', 'owner-exchange-offer-consent-20261007.json',
                 'fixed-base-audit-20261007.json', 'fixed-base-audit-result-20261007.json',
                 'fixed-base-audit-completed-20261007.json')
EVIDENCE_FILES = ('sender-handoff-20261007.txt', 'finite168-final-20261007.csv',
                  'finite168-final-20261007.json', 'finite168-sender-evidence-20261007.json')

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

def bold(text, count, spans=None):
    if spans is not None:
        if count:
            raise ValueError('ambiguous_bold_format')
        boundaries = {len(text[:i].encode('utf-16-le'))//2 for i in range(len(text)+1)}
        out, end = [], 0
        for offset, length in spans:
            if type(offset) is not int or type(length) is not int or length <= 0 or offset < end or offset not in boundaries or offset+length not in boundaries:
                raise ValueError('invalid_bold_span')
            out.append(dict(type='bold', offset=offset, length=length)); end=offset+length
        return out
    if type(count) is not int or count not in (0, 1, 2):
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

def payload(rule, content, use_photo, variant):
    text = SHORT_TEXT if variant == 'short_text' else content['caption'] if use_photo else content['text']
    count = 1 if variant == 'short_text' else content.get('caption_bold_first_lines', 0)
    spans = content.get('bold_spans') if variant != 'short_text' else None
    entities = bold(text, count, spans)
    value = dict(text=text, format='photo' if use_photo else 'text', entities=entities, exact_bold=spans is not None,
                 bold_first_lines=count,bold_spans=spans)
    if use_photo:
        sha = content['photo']['sha256']
        # Both approved JPEG A and PNG B are copied byte-for-byte only at cutover.
        suffix = Path(content['photo']['path']).suffix.lower()
        if suffix not in ('.jpg', '.jpeg', '.png'):
            raise ValueError('unsupported_photo_type')
        value.update(photo_sha256=sha, photo_asset='/'+sha+suffix)
        raw_digest = digest(b'photo\0'+sha.encode()+b'\0'+text.encode())
    else:
        raw_digest = digest(text.encode())
    if entities:
        raw_digest=digest((raw_digest+':bold:'+str([(e['offset'],e['length']) for e in entities])).encode())
    value['digest']=raw_digest
    limit=min(rule.get('max_chars',4096),60 if variant=='short_text' else 1024 if use_photo else 4096)
    value['max_chars']=limit
    if len(text.encode('utf-16-le'))//2>limit or len(text.splitlines())>rule.get('max_lines',100):
        raise ValueError('content_exceeds_group_limit')
    if not rule['allow_links'] and re.search(r'https?://|tg://|www\.|t\.me/|\b[a-z\d-]+\.(?:com|ru|pro|net|org)\b',text,re.I):
        raise ValueError('content_links_forbidden')
    if not rule['allow_links'] and re.search(r'@[a-z\d_]{3,}',text,re.I) and not (variant=='short_text' and rule.get('allow_contact_handles') is True):
        raise ValueError('content_contact_forbidden')
    return value

def joined(row, rule):
    if row.get('membership') in ('joined', 'already_member') and not row.get('left'):
        return True
    if rule.get('verified_joined_at_utc'):
        return epoch(rule['verified_joined_at_utc']) > epoch(row.get('checked_at') or '1970-01-01T00:00:00+00:00')
    return False

def normalize_group(row, rule, cfg, content, settings, now):
    handle = row.get('handle', '').lower()
    broadcast = row['id']==-1001422420951 and handle=='obmen_valyuty' and rule.get('paid') is True and rule.get('payment_confirmed') is True and rule.get('broadcast_channel_approved') is True
    if row.get('exclude') or handle=='obmen_chel' or (handle=='obmen_valyuty' and not broadcast):
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
    variant=rule.get('content_variant','full')
    if variant not in ('full','text','short_text'):
        raise ValueError('unknown_content_variant')
    if variant!='full' and (not rule.get('format_evidence') or not rule.get('format_checked_at')):
        raise ValueError('format_rules_evidence_required')
    if variant=='short_text' and not (rule.get('allow_contact_handles') is True and content.get('short_text_approved') is True and content.get('short_text')==SHORT_TEXT):
        raise ValueError('short_text_approval_required')
    use_photo = variant=='full' and rule.get('allow_photos') is True and (paid or not row.get('default_send_photos_banned'))
    if paid and not use_photo:
        raise ValueError('paid_photo_permission_missing')
    if not use_photo and rule.get('allow_text') is not True:
        raise ValueError('no_authorized_format')
    selected = payload(rule,content,use_photo,variant)
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
                 allow_links=rule['allow_links'], gap_ms=ms(gap), about=rule['about'] or '',
                 pinned_message_id=rule.get('pinned_message_id'), pinned_text=rule.get('pinned', ''),
                 refresh_on_live_check=bool(rule.get('refresh_on_live_check')) and not paid,
                 wait_until=max(ms(settings.get('group_wait:' + str(row['id']))), ms(row.get('retry_after'))))
    if group['checked_at'] > now:
        raise ValueError('future_policy_check')
    group.update(selected,content_variant=variant,allow_text=rule.get('allow_text') is True,allow_photos=rule.get('allow_photos') is True,
                 allow_contact_handles=rule.get('allow_contact_handles') is True,
                 format_evidence=rule.get('format_evidence'),format_checked_at=rule.get('format_checked_at'),
                 unreadable_pin_policy=rule.get('unreadable_pin_policy'),broadcast_channel_approved=broadcast,
                 actual_daily_limit=rule.get('actual_daily_limit'),paid_day_interval_seconds=rule.get('paid_day_interval_seconds'),
                 paid_interval_authorization=rule.get('paid_interval_authorization'))
    if use_photo and not paid and rule.get('allow_text') is True:
        group['text_fallback']=payload(rule,content,False,'text')
    if paid:
        group.update(paid_until=epoch(rule['paid_until']), payment_confirmed=True, recurring_confirmed=True)
    rotation=content.get('paid_rotation',{})
    if paid and rotation.get('enabled') and row['id'] in rotation['chat_ids']:
        if rotation.get('campaign')!=CAMPAIGN or set(rotation.get('variants',{}))!={'A','B'}:
            raise ValueError('unsupported_rotation')
        group['rotation']={'campaign':CAMPAIGN,'variants':{name:payload(rule,dict(content,**data),True,'full') for name,data in rotation['variants'].items()}}
        if group['rotation']['variants']['A']!=selected:
            raise ValueError('rotation_A_changed')
    return group

def archive_state(root, raw, evidence_dir=None):
    # An explicit allowlist: never scan/copy arbitrary runtime files, API keys,
    # Telegram sessions, environment files, authentication configs or credentials.
    archive=dict(raw)
    for name in ARCHIVE_FILES:
        if (root/name).is_file(): archive[name]=(root/name).read_bytes()
    for folder in ('visibility-queue','member-review-queue'):
        for p in sorted((root/folder).glob('*.json')):
            if not re.fullmatch(r'[A-Za-z0-9_-]+\.json',p.name) or p.is_symlink():
                raise ValueError('unsafe_archive_path')
            archive[folder+'/'+p.name]=p.read_bytes()
    manifest=json.loads(archive.get('service-code-manifest.json',b'{}'))
    supported=json.loads((Path(__file__).parent/'source-compatibility.json').read_text())['sha256']
    if manifest and any(manifest.get('sha256',{}).get(name)!=sha for name,sha in supported.items()):
        raise ValueError('mac_code_changed_requires_new_parity_review')
    for name,expected in manifest.get('sha256',{}).items():
        if not re.fullmatch(r'[a-z_]+\.py',name):raise ValueError('unsafe_code_manifest')
        body=(root/'service-code'/name).read_bytes()
        if digest(body)!=expected:raise ValueError('service_code_manifest_mismatch:'+name)
        archive['service-code/'+name]=body
    if evidence_dir:
        for name in EVIDENCE_FILES: archive['handoff/'+name]=(evidence_dir/name).read_bytes()
    for name in ('finite-candidates-168-20261007.json','growth-queue.json'):
        if name in archive and json.loads(archive[name]).get('enabled') is not False:
            raise ValueError('discovery_queue_must_be_disabled:'+name)
    return [dict(path=name,sha256=digest(body),body=body.decode('utf-8')) for name,body in sorted(archive.items())]

def visibility_records(archive, attempts, rules):
    records=[];by_id={a['id']:a for a in attempts}
    for file in archive:
        if not file['path'].startswith('visibility-queue/'):continue
        data=json.loads(file['body']);aid=str(data['attempt_id']);a=by_id.get(aid)
        if not a or a['chat_id']!=data['chat_id'] or str(a['message_id'])!=str(data['message_id']):
            raise ValueError('visibility_attempt_mismatch')
        state={'queued':'pending','checking':'pending','verified':'verified','quarantined':'quarantined'}.get(data['status'])
        if state is None:raise ValueError('unknown_visibility_status')
        rule=rules.get(str(data['chat_id']),{})
        spec=dict(text=data['text'],format='photo' if data['photo'] else 'text',
                  entities=bold(data['text'],data.get('bold_first_lines',0),data.get('bold_spans')),
                  exact_bold=data.get('bold_spans') is not None,handle=rule.get('handle',''),
                  bold_first_lines=data.get('bold_first_lines',0),bold_spans=data.get('bold_spans'),
                  channel_id=str(-data['chat_id']-1000000000000))
        records.append(dict(attempt_id=aid,chat_id=data['chat_id'],message_id=str(data['message_id']),spec=spec,
                            state=state,checked_at=ms(data.get('checked_at')),reason=data.get('error',''),original=data))
    return records

def build_snapshot(root, final=False, now=None, evidence_dir=None):
    now = round(time.time() * 1000) if now is None else now
    raw = {name: (root / name).read_bytes() for name in FILES}
    data = {name: json.loads(value) for name, value in raw.items()}
    cfg, ctrl, content = [data[n] for n in ('config.json', 'unified-control.json', 'unified-content.json')]
    rotation=content.get('paid_rotation',{})
    if rotation.get('enabled'):
        scope=set(rotation.get('chat_ids',[]))
        if rotation.get('campaign')!=CAMPAIGN or not (len(scope)==8 or len(scope)==9 and -1001422420951 in scope) or set(rotation.get('variants',{}))!={'A','B'}:
            raise ValueError('rotation_scope_invalid')
        a,b=rotation['variants']['A'],rotation['variants']['B']
        expected_spans=[[0,len(ROTATION_B_TEXT.splitlines()[0].encode('utf-16-le'))//2]]
        for word in ('ВЫГОДА','ДО 3 ₽'):
            i=ROTATION_B_TEXT.index(word);expected_spans.append([len(ROTATION_B_TEXT[:i].encode('utf-16-le'))//2,len(word.encode('utf-16-le'))//2])
        if b.get('caption')!=ROTATION_B_TEXT or b.get('bold_spans')!=expected_spans:raise ValueError('rotation_B_content_mismatch')
        if any(a.get(k)!=content.get(k) for k in ('caption','photo','caption_bold_first_lines')):raise ValueError('rotation_A_changed')
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
        tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        if tables-{'attempts','settings','blocked','paid_variant_attempts'}:raise ValueError('unknown_table_requires_mapping')
        original = [dict(r) for r in db.execute('SELECT * FROM attempts ORDER BY id')]
        variants = [dict(r) for r in db.execute('SELECT * FROM paid_variant_attempts ORDER BY attempt_id')] if 'paid_variant_attempts' in tables else []
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
    archive=archive_state(root,raw,evidence_dir)
    archived={f['path'] for f in archive}
    parity_complete=all(name in archived for name in ARCHIVE_FILES) and all('handoff/'+name in archived for name in EVIDENCE_FILES)
    visibility=visibility_records(archive,attempts,rules)
    for v in variants:
        if set(v)!={'attempt_id','chat_id','campaign','variant','confirmed'}:raise ValueError('unknown_variant_schema')
        v['attempt_id']=str(v['attempt_id'])
    rotation=content.get('paid_rotation',{})
    if rotation.get('enabled') and 'paid_variant_attempts' not in tables:raise ValueError('rotation_history_missing')
    # Only identity-proven A/B records classify historical paid attempts. A peer
    # may have changed paid/free status; never relabel the rest from today's rule.
    paid_ids={v['attempt_id'] for v in variants}
    for a in attempts:a['segment']='paid' if a['id'] in paid_ids else 'unknown'
    hashes = {name: digest(value) for name, value in raw.items()}
    if any(digest((root / name).read_bytes()) != sha for name, sha in hashes.items()):
        raise ValueError('source_changed_retry_snapshot')
    if final:
        for f in archive:
            base=evidence_dir if f['path'].startswith('handoff/') else root
            relative=f['path'].removeprefix('handoff/') if f['path'].startswith('handoff/') else f['path']
            if digest((base/relative).read_bytes())!=f['sha256']:raise ValueError('source_changed_retry_snapshot')
    return dict(version=2, groups=groups, attempts=attempts, paid_variants=variants, visibility=visibility, archive=archive,
                blocked=[dict(chat_id=cid, reason=reason) for cid, reason in blocked.items()],
                daily_limit=cfg['daily_limit'], gap_ms=0,
                expected_user_id=str(data['identity.json']['user_id']), expected_username='ccapital_acces',
                wait_until=max(ms(settings.get('wait_until')), ms(gate.get('retry_after'))), halt=halt,
                source=dict(kind='python-unified-v2', final=final, exported_at=now, files_sha256=hashes,
                            settings=settings, paused=cfg['paused'], stopped_marker=(root / 'hourly-stop').exists(),
                            omitted_rules=omitted, registry_count=len(registry),rule_count=len(rules),
                            discovery_enabled=False,parity_complete=parity_complete,
                            archive_sha256=digest(json.dumps(archive,sort_keys=True,ensure_ascii=False).encode())))

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
                paid_variants=len(s['paid_variants']),visibility=dict(Counter(x['state'] for x in s['visibility'])),
                archive_files=len(s['archive']),
                wait_active=s['wait_until']>s['source']['exported_at'], halt=bool(s['halt']),
                secret_files_read=0, network_calls=0)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, required=True)
    mode=p.add_mutually_exclusive_group(required=True)
    mode.add_argument('--audit', action='store_true'); mode.add_argument('--cutover', action='store_true')
    p.add_argument('--output-dir', type=Path)
    p.add_argument('--evidence-dir', type=Path, help='private Mac handoff directory; no credentials')
    args=p.parse_args()
    if args.audit:
        print(json.dumps(summary(build_snapshot(args.root,evidence_dir=args.evidence_dir)), ensure_ascii=False)); return
    if not args.output_dir:
        p.error('--cutover requires --output-dir outside the source directory')
    dest=args.output_dir.resolve();root=args.root.resolve()
    if dest==root or root in dest.parents or dest.exists():
        p.error('choose a new private backup directory outside the runtime')
    assert_stopped(root)
    with (root/'worker.lock').open('r') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        s=build_snapshot(root, final=True,evidence_dir=args.evidence_dir)
        if not s['source']['parity_complete']:raise ValueError('complete_reviewed_handoff_required')
        os.umask(0o077);dest.mkdir(parents=True, mode=0o700)
        src=sqlite3.connect('file:'+quote(str(root/'state.sqlite'))+'?mode=ro',uri=True)
        backup=sqlite3.connect(dest/'state.sqlite');src.backup(backup);backup.close();src.close()
        payload=json.dumps(s,ensure_ascii=False,separators=(',',':')).encode()
        (dest/'snapshot.json').write_bytes(payload)
        (dest/'manifest.json').write_text(json.dumps(dict(summary(s),snapshot_sha256=digest(payload),backup_sha256=digest((dest/'state.sqlite').read_bytes())),indent=2))
        for name in FILES:
            (dest/name).write_bytes((root/name).read_bytes())
        for f in s['archive']:
            target=dest/'archive'/f['path'];target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            target.write_text(f['body'])
        content=json.loads((root/'unified-content.json').read_text())
        photos=[content['photo']]+[v['photo'] for v in content.get('paid_rotation',{}).get('variants',{}).values()]
        (dest/'assets').mkdir(mode=0o700)
        for photo in photos:
            data=Path(photo['path']).read_bytes()
            if digest(data)!=photo['sha256']:raise ValueError('approved_photo_changed')
            (dest/'assets'/(photo['sha256']+Path(photo['path']).suffix.lower())).write_bytes(data)
        print(json.dumps(summary(s)))

if __name__=='__main__':
    main()
