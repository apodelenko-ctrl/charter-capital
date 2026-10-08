"""Owner handoff guards; all credentials and Wrangler responses are synthetic."""
import contextlib
import fcntl
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

TOOLS=Path(__file__).resolve().parents[1]/'tools'
sys.path.insert(0,str(TOOLS))
import owner_secrets as owner


class OwnerHandoff(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'runtime';self.root.mkdir()
        self.project=Path(self.temp.name)/'project'
        (self.project/'src').mkdir(parents=True)
        (self.project/'src/worker.mjs').write_text('const LIVE_RELEASE = false;')
        (self.project/'node_modules/wrangler/bin').mkdir(parents=True)
        (self.project/'node_modules/wrangler/bin/wrangler.js').touch()
        (self.root/'worker.lock').touch();(self.root/'hourly-stop').touch()
        (self.root/'config.json').write_text('{"paused":true}')
        self.sign()
        self.payload=Mock(return_value='SYNTHETIC_SECRET_PAYLOAD')
        self.reader=patch.object(owner,'read_existing_payload',self.payload)
        self.reader.start();self.addCleanup(self.reader.stop)
        self.run=Mock(return_value=subprocess.CompletedProcess([],0,'Created version 11111111-2222-3333-4444-555555555555 with 3 secrets.',''))

    def sign(self,enabled=False):
        config=self.root/'config.json'
        (self.root/'unified-control.json').write_text(json.dumps(dict(enabled=enabled,
            config_signature=dict(sha256=owner.digest(config.read_bytes()),mtime_ns=config.stat().st_mtime_ns))))

    def refused(self,reason):
        with self.assertRaisesRegex(ValueError,reason):
            owner.stage_existing(self.root,self.project,confirm=lambda:True,run=self.run)
        self.payload.assert_not_called();self.run.assert_not_called()

    def test_missing_stop_and_live_pid_never_read_secrets(self):
        (self.root/'hourly-stop').unlink();self.refused('stop_marker')
        (self.root/'hourly-stop').touch()
        (self.root/'dispatcher-daemon.pid').write_text(str(os.getpid()))
        self.refused('still_alive')

    def test_pause_disabled_control_and_signature_all_required(self):
        (self.root/'config.json').write_text('{"paused":false}');self.sign();self.refused('not_paused')
        (self.root/'config.json').write_text('{"paused":true}');self.sign(enabled=True);self.refused('control_must_be_disabled')
        self.sign();(self.root/'config.json').write_text('{ "paused":true}');self.refused('signature_mismatch')

    def test_busy_lock_never_reads_secrets_or_calls_owner(self):
        confirm=Mock(return_value=True)
        with (self.root/'worker.lock').open('r') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):owner.stage_existing(self.root,self.project,confirm=confirm,run=self.run)
        confirm.assert_not_called();self.payload.assert_not_called();self.run.assert_not_called()

    def test_owner_cancel_and_changed_state_after_confirmation_are_safe(self):
        result=owner.stage_existing(self.root,self.project,confirm=lambda:False,run=self.run)
        self.assertEqual(result,dict(staged=False,cancelled=True,deployed=False))
        self.payload.assert_not_called();self.run.assert_not_called()
        def changed():self.sign(enabled=True);return True
        with self.assertRaisesRegex(ValueError,'control_must_be_disabled'):
            owner.stage_existing(self.root,self.project,confirm=changed,run=self.run)
        self.payload.assert_not_called();self.run.assert_not_called()

    def test_reviewed_disabled_build_and_installed_cli_required(self):
        (self.project/'src/worker.mjs').write_text('const LIVE_RELEASE = true;');self.refused('disabled_local_build')
        (self.project/'src/worker.mjs').write_text('const LIVE_RELEASE = false;')
        (self.project/'node_modules/wrangler/bin/wrangler.js').unlink();self.refused('reviewed_local_wrangler')

    def test_staging_holds_lock_uses_only_staged_version_and_disables_logs(self):
        def run(command,**kw):
            with (self.root/'worker.lock').open('r') as lock:
                with self.assertRaises(BlockingIOError):fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            self.assertEqual(command[:5],['node',str(self.project/'node_modules/wrangler/bin/wrangler.js'),'versions','secret','bulk'])
            self.assertNotIn('deploy',command)
            self.assertEqual(kw['input'],'SYNTHETIC_SECRET_PAYLOAD')
            self.assertEqual(kw['stdout'],subprocess.PIPE);self.assertEqual(kw['stderr'],subprocess.PIPE)
            env=kw['env'];self.assertEqual(env['WRANGLER_WRITE_LOGS'],'false')
            self.assertEqual(env['WRANGLER_LOG_SANITIZE'],'true');self.assertEqual(env['WRANGLER_SEND_METRICS'],'false')
            self.assertEqual(env['CLOUDFLARE_ACCOUNT_ID'],owner.ACCOUNT_ID);self.assertNotIn('NODE_OPTIONS',env)
            return self.run.return_value
        with patch.dict(os.environ,{'NODE_OPTIONS':'--inspect','WRANGLER_WRITE_LOGS':'true'}):
            result=owner.stage_existing(self.root,self.project,confirm=lambda:True,run=run)
        self.assertEqual(result,dict(staged=True,deployed=False,version_id='11111111-2222-3333-4444-555555555555'))
        self.payload.assert_called_once_with(self.root)

    def test_cli_failure_never_surfaces_child_diagnostics(self):
        self.run.return_value=subprocess.CompletedProcess([],1,'SYNTHETIC_SECRET_PAYLOAD','SYNTHETIC_SECRET_PAYLOAD')
        with self.assertRaisesRegex(RuntimeError,'^secret_staging_failed$'):
            owner.stage_existing(self.root,self.project,confirm=lambda:True,run=self.run)
        err=io.StringIO();out=io.StringIO()
        with patch.object(sys,'argv',['owner_secrets.py','--root',str(self.root),'--owner-approved-cutover','--transfer-existing-secrets']), \
             patch.object(owner,'stage_existing',side_effect=RuntimeError('SYNTHETIC_SECRET_PAYLOAD')), \
             contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
            with self.assertRaises(SystemExit):owner.main()
        self.assertNotIn('SYNTHETIC_SECRET_PAYLOAD',err.getvalue()+out.getvalue())
        self.assertIn('Ничего не развёрнуто',err.getvalue())

    def test_check_only_has_no_secret_reads_or_network(self):
        for stopped in (True,False):
            if not stopped:(self.root/'hourly-stop').unlink()
            out=io.StringIO()
            with patch.object(sys,'argv',['owner_secrets.py','--root',str(self.root),'--check-only']), \
                 patch.object(owner,'check_project'),patch.object(owner.subprocess,'run') as run,contextlib.redirect_stdout(out):
                owner.main()
            result=json.loads(out.getvalue());self.assertEqual(result['ready'],stopped)
            self.assertEqual(result['secret_files_read'],0);self.assertEqual(result['network_calls'],0)
            self.assertFalse(result['transferred']);self.payload.assert_not_called();run.assert_not_called()

    def test_owner_terminal_and_exact_confirmation_required(self):
        with patch.object(sys.stdin,'isatty',return_value=False),patch('builtins.input') as ask:
            with self.assertRaisesRegex(ValueError,'owner_terminal_required'):owner.owner_confirmation()
            ask.assert_not_called()
        for answer,expected in [('yes',False),('ПЕРЕНЕСТИ',True)]:
            with patch.object(sys.stdin,'isatty',return_value=True),patch('builtins.input',return_value=answer),contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(owner.owner_confirmation(),expected)

    def test_explicit_delegation_still_requires_cutover_approval(self):
        argv=['owner_secrets.py','--root',str(self.root),'--transfer-existing-secrets','--owner-delegated-cutover']
        with patch.object(sys,'argv',argv),patch.object(owner,'stage_existing') as stage,contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):owner.main()
            stage.assert_not_called()
        with patch.object(sys,'argv',argv+['--owner-approved-cutover']),patch.object(owner,'stage_existing',return_value={'staged':True,'deployed':False}) as stage,contextlib.redirect_stdout(io.StringIO()):
            owner.main()
            self.assertTrue(stage.call_args.kwargs['confirm']())

if __name__=='__main__':unittest.main()
