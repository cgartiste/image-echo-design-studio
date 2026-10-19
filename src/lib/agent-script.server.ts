// Server-only: installer and Python agent served to VPS machines.

export function installerScript(site: string, token: string) {
  return `#!/usr/bin/env bash
# Cortex agent installer. Run as root on the VPS.
set -euo pipefail
if [ "$(id -u)" != "0" ]; then echo "Run as root (sudo)"; exit 1; fi
SITE='${site}'
TOKEN='${token}'
command -v python3 >/dev/null 2>&1 || { (apt-get update -y && apt-get install -y python3) || dnf install -y python3 || yum install -y python3; }
command -v curl >/dev/null 2>&1 || { apt-get install -y curl || dnf install -y curl; }
mkdir -p /opt/cortex-agent
umask 077
printf '%s\\n%s\\n' "$SITE" "$TOKEN" > /opt/cortex-agent/agent.conf
curl -fsSL "$SITE/api/public/agent/script.py" -o /opt/cortex-agent/agent.py
cat > /etc/systemd/system/cortex-agent.service <<'UNIT'
[Unit]
Description=Cortex KumoMTA agent
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=/usr/bin/python3 /opt/cortex-agent/agent.py
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable cortex-agent >/dev/null 2>&1
systemctl restart cortex-agent
echo "Cortex agent installed. This server will appear online in Cortex within a few seconds."
`;
}

export const AGENT_PY = String.raw`#!/usr/bin/env python3
# Cortex agent: polls Cortex for commands and email batches, injects into local KumoMTA.
import json, os, socket, subprocess, time, urllib.request, urllib.error, shutil, platform

SITE, TOKEN = open('/opt/cortex-agent/agent.conf').read().split()[:2]
VERSION = '1.0.0'
POLICY = '/opt/kumomta/etc/policy/init.lua'

def api(path, body=None, timeout=30):
    req = urllib.request.Request(SITE + path, data=json.dumps(body or {}).encode(), method='POST',
        headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json', 'User-Agent': 'cortex-agent/' + VERSION})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b'{}')

def run(cmd, timeout=900):
    try:
        p = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        out = (p.stdout or '') + (p.stderr or '')
        return p.returncode == 0, out[-20000:]
    except subprocess.TimeoutExpired:
        return False, 'Timed out after %ss' % timeout

def tcp(host, port, t=5):
    try:
        with socket.create_connection((host, port), timeout=t) as s:
            s.settimeout(t)
            try: banner = s.recv(200).decode(errors='ignore').strip()
            except Exception: banner = ''
            return {'ok': True, 'banner': banner[:120]}
    except Exception as e:
        return {'ok': False, 'error': str(e)[:120]}

def public_ip():
    try: return urllib.request.urlopen('https://api.ipify.org', timeout=5).read().decode().strip()
    except Exception: return ''

def os_release():
    d = {}
    try:
        for l in open('/etc/os-release'):
            if '=' in l: k, v = l.strip().split('=', 1); d[k] = v.strip('"')
    except Exception: pass
    return d

def system_info():
    osr = os_release()
    mem = {}
    try:
        for l in open('/proc/meminfo'):
            k, v = l.split(':'); mem[k] = int(v.split()[0])
    except Exception: pass
    du = shutil.disk_usage('/')
    load = os.getloadavg() if hasattr(os, 'getloadavg') else (0, 0, 0)
    ip = public_ip()
    ptr = ''
    try: ptr = socket.gethostbyaddr(ip)[0] if ip else ''
    except Exception: pass
    kumo_ok, kumo_v = run('/opt/kumomta/sbin/kumod --version 2>/dev/null', 20)
    active = run('systemctl is-active kumomta', 10)[1].strip() == 'active'
    return {
        'os': osr.get('PRETTY_NAME', platform.platform()), 'kernel': platform.release(), 'hostname': socket.getfqdn(),
        'cpus': os.cpu_count(), 'mem_mb': mem.get('MemTotal', 0) // 1024, 'mem_free_mb': mem.get('MemAvailable', 0) // 1024,
        'disk_gb': round(du.total / 1e9, 1), 'disk_free_gb': round(du.free / 1e9, 1), 'load': [round(x, 2) for x in load],
        'uptime_s': int(float(open('/proc/uptime').read().split()[0])), 'public_ip': ip, 'ptr': ptr,
        'kumo_installed': os.path.exists('/opt/kumomta/sbin/kumod'), 'kumo_version': kumo_v.strip()[:80] if kumo_ok else '',
        'kumo_active': active, 'agent_version': VERSION,
    }

def check_ports(region='us-east-1'):
    listening = run("ss -tlnH 2>/dev/null | awk '{print $4}' | sort -u", 10)[1].split()
    fw = run('ufw status 2>/dev/null || firewall-cmd --list-all 2>/dev/null || echo none', 10)[1].strip()[:2000]
    return {
        'outbound_25_gmail': tcp('gmail-smtp-in.l.google.com', 25),
        'outbound_25_outlook': tcp('outlook-com.olc.protection.outlook.com', 25),
        'outbound_587_ses': tcp('email-smtp.%s.amazonaws.com' % region, 587),
        'outbound_465_ses': tcp('email-smtp.%s.amazonaws.com' % region, 465),
        'listening': listening[:200], 'firewall': fw, 'checked_at': int(time.time()),
    }

def install_kumomta():
    osr = os_release(); id_ = osr.get('ID', ''); ver = osr.get('VERSION_ID', '')
    if id_ in ('ubuntu', 'debian'):
        repo = 'ubuntu20' if ver.startswith('20') else 'ubuntu22'
        key = 'kumomta-ubuntu-20' if repo == 'ubuntu20' else 'kumomta-ubuntu-22'
        cmd = ('export DEBIAN_FRONTEND=noninteractive && apt-get update -y && apt-get install -y curl gnupg ca-certificates && '
               'curl -fsSL https://openrepo.kumomta.com/%s/public.gpg | gpg --yes --dearmor -o /usr/share/keyrings/kumomta.gpg && '
               'chmod 644 /usr/share/keyrings/kumomta.gpg && '
               'curl -fsSL https://openrepo.kumomta.com/files/kumomta-%s.list > /etc/apt/sources.list.d/kumomta.list && '
               'apt-get update -y && apt-get install -y kumomta') % (key, repo)
    elif id_ in ('rocky', 'almalinux', 'rhel', 'centos'):
        cmd = 'dnf -y install dnf-plugins-core && dnf config-manager --add-repo https://openrepo.kumomta.com/files/kumomta-rocky.repo && dnf -y install kumomta'
    elif id_ == 'amzn':
        repo = 'kumomta-amazon2023' if ver.startswith('2023') else 'kumomta-amazon'
        cmd = 'dnf -y install dnf-plugins-core && dnf config-manager --add-repo https://openrepo.kumomta.com/files/%s.repo && dnf -y install kumomta' % repo
    else:
        return False, 'Unsupported OS: %s %s (use Ubuntu 22.04, Rocky 8/9 or Amazon Linux)' % (id_, ver)
    ok, out = run(cmd, 1500)
    if not ok: return False, out
    ok2, out2 = apply_config()
    return ok2, out[-8000:] + '\n' + out2

def apply_config():
    cfg = api('/api/public/agent/config')
    if not cfg.get('init_lua'): return False, 'No config returned'
    os.makedirs(os.path.dirname(POLICY), exist_ok=True)
    if os.path.exists(POLICY): shutil.copy(POLICY, POLICY + '.bak')
    with open(POLICY, 'w') as f: f.write(cfg['init_lua'])
    run('chown -R kumod:kumod /opt/kumomta/etc/policy 2>/dev/null', 10)
    run('systemctl enable kumomta', 20)
    ok, out = run('systemctl restart kumomta && sleep 3 && systemctl is-active kumomta', 60)
    if not ok:
        logs = run('journalctl -u kumomta -n 60 --no-pager', 20)[1]
        if os.path.exists(POLICY + '.bak'):
            shutil.copy(POLICY + '.bak', POLICY); run('systemctl restart kumomta', 60)
            logs += '\nPrevious policy restored.'
        return False, out + '\n' + logs
    return True, 'Config applied, KumoMTA active.\n' + out

def execute(c):
    k, p = c['kind'], c.get('payload') or {}
    if k == 'install_kumomta': return install_kumomta()
    if k == 'apply_config': return apply_config()
    if k == 'start_kumomta': return run('systemctl start kumomta && systemctl is-active kumomta', 60)
    if k == 'restart_kumomta': return run('systemctl restart kumomta && sleep 2 && systemctl is-active kumomta', 60)
    if k == 'stop_kumomta': return run('systemctl stop kumomta; systemctl is-active kumomta || true', 60)
    if k == 'system_info': return True, json.dumps(system_info(), indent=2)
    if k == 'check_ports': return True, json.dumps(check_ports(p.get('region', 'us-east-1')), indent=2)
    if k == 'tail_logs': return run('journalctl -u kumomta -n %d --no-pager' % min(int(p.get('lines', 200)), 1000), 30)
    if k == 'queue_summary': return run('/opt/kumomta/sbin/kcli queue-summary 2>&1 || /opt/kumomta/sbin/kcli --endpoint http://127.0.0.1:8000 queue-summary', 30)
    if k == 'open_port':
        port = int(p.get('port', 0))
        if not 1 <= port <= 65535: return False, 'Invalid port'
        return run('(command -v ufw >/dev/null && ufw allow %d/tcp) || (command -v firewall-cmd >/dev/null && firewall-cmd --permanent --add-port=%d/tcp && firewall-cmd --reload) || echo "No firewall manager found"' % (port, port), 60)
    if k == 'update_agent':
        return run('curl -fsSL "%s/api/public/agent/script.py" -o /opt/cortex-agent/agent.py.new && mv /opt/cortex-agent/agent.py.new /opt/cortex-agent/agent.py && (sleep 2; systemctl restart cortex-agent) &' % SITE, 60)
    if k == 'shell': return run(str(p.get('command', '')), int(p.get('timeout', 120)))
    return False, 'Unknown command ' + k

def inject(m):
    body = {'envelope_sender': m['envelope_sender'], 'recipients': [{'email': m['to']}],
            'content': {'from': m['from'], 'subject': m['subject'], 'html_body': m['html'], 'text_body': m['text'], 'headers': m['headers']}}
    if m.get('reply_to'): body['content']['reply_to'] = {'email': m['reply_to']}
    req = urllib.request.Request('http://127.0.0.1:8000/api/inject/v1', data=json.dumps(body).encode(), method='POST', headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            res = json.loads(r.read() or b'{}')
            if res.get('success_count', 0) >= 1: return {'job_id': m['job_id'], 'ok': True}
            return {'job_id': m['job_id'], 'ok': False, 'error': json.dumps(res.get('errors') or res)[:300]}
    except urllib.error.HTTPError as e:
        return {'job_id': m['job_id'], 'ok': False, 'error': ('HTTP %s %s' % (e.code, e.read()[:200]))}
    except Exception as e:
        return {'job_id': m['job_id'], 'ok': False, 'error': str(e)[:300]}

def main():
    last_info = 0; info = None; ports = None
    while True:
        try:
            if time.time() - last_info > 60:
                info = system_info()
                if ports is None or time.time() - ports.get('checked_at', 0) > 3600: ports = check_ports()
                last_info = time.time()
                r = api('/api/public/agent/poll', {'info': info, 'ports': ports})
            else:
                r = api('/api/public/agent/poll', {})
            for c in r.get('commands', []):
                api('/api/public/agent/result', {'command_id': c['id'], 'status': 'running'})
                try: ok, out = execute(c)
                except Exception as e: ok, out = False, 'Agent error: %s' % e
                api('/api/public/agent/result', {'command_id': c['id'], 'status': 'done' if ok else 'failed', 'output': out})
                last_info = 0
            if r.get('send') and info and info.get('kumo_active'):
                batch = api('/api/public/agent/jobs', {}, 60)
                msgs = batch.get('messages', [])
                if msgs:
                    results = []
                    delay = float(batch.get('delay_ms', 0)) / 1000.0
                    for m in msgs:
                        results.append(inject(m))
                        if delay: time.sleep(min(delay, 5))
                    api('/api/public/agent/jobs-result', {'results': results}, 60)
                    if len(msgs) >= batch.get('limit', 1): continue
        except Exception as e:
            print('cortex-agent:', e, flush=True)
        time.sleep(10)

if __name__ == '__main__':
    main()
`;
