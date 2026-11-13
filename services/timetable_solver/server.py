"""Loopback-only companion: one cancellable job, bounded input and memory lifetime."""
import argparse
import json
import multiprocessing as mp
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from .pipeline import run_pipeline, validate_request


def compute(payload, output):
    try:
        result = run_pipeline(payload, lambda progress: output.put({"state": "running", "progress": progress}))
        output.put({"state": "done", "result": result})
    except Exception as error:
        output.put({"state": "error", "message": str(error)[:500]})


class Jobs:
    def __init__(self):
        self.items = {}
        self.lock = threading.Lock()

    def drain(self, job):
        import queue
        while True:
            try:
                job["value"] = job["queue"].get_nowait()
            except queue.Empty:
                break
        if job["value"]["state"] == "running" and not job["process"].is_alive():
            job["value"] = {"state": "error", "message": "계산 프로세스가 종료되었습니다. 다시 실행해 주세요."}

    def prune(self):
        for key, job in list(self.items.items()):
            self.drain(job)
            if time.monotonic() - job["access"] > 120:
                self.remove(key)

    def remove(self, key):
        job = self.items.pop(key, None)
        if job:
            if job["process"].is_alive():
                job["process"].terminate()
            job["process"].join(timeout=2)
            job["queue"].close()


jobs = Jobs()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Job identifiers and submitted student data are not access logs.

    def allowed(self):
        host = urlparse('http://' + self.headers.get('Host', '')).hostname
        origin = self.headers.get('Origin')
        forwarded = self.headers.get('X-Forwarded-For', '')
        local_forward = not forwarded or all(ip.strip() in ('127.0.0.1', '::1', '::ffff:127.0.0.1') for ip in forwarded.split(','))
        return local_forward and host in ('localhost', '127.0.0.1', '::1') and (not origin or urlparse(origin).hostname in ('localhost', '127.0.0.1', '::1'))

    def reply(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self.allowed():
            return self.reply(403, {"message": "로컬 요청만 허용합니다."})
        if self.path == '/health':
            return self.reply(200, {"ready": True, "engine": "ortools-cp-sat", "protocol": 1})
        key = self.path.removeprefix('/jobs/')
        with jobs.lock:
            jobs.prune()
            job = jobs.items.get(key)
            if not job:
                return self.reply(404, {"message": "작업이 만료되었거나 취소되었습니다."})
            job['access'] = time.monotonic()
            jobs.drain(job)
            return self.reply(200, job['value'])

    def do_POST(self):
        if not self.allowed():
            return self.reply(403, {"message": "로컬 요청만 허용합니다."})
        if self.path != '/jobs':
            return self.reply(404, {"message": "알 수 없는 경로입니다."})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 10 * 1024 * 1024 or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                return self.reply(400, {"message": "JSON 입력 크기 또는 형식이 잘못되었습니다."})
            payload = json.loads(self.rfile.read(size))
            validate_request(payload)
        except (ValueError, KeyError, TypeError):
            return self.reply(400, {"message": "입력 수업·명단·교사·배치 정보를 확인해 주세요."})
        with jobs.lock:
            jobs.prune()
            if any(job['process'].is_alive() for job in jobs.items.values()):
                return self.reply(409, {"message": "다른 시간표를 계산 중입니다. 완료 후 다시 실행해 주세요."})
            for previous in list(jobs.items):
                jobs.remove(previous)
            key = secrets.token_urlsafe(24)
            output = mp.Queue()
            process = mp.Process(target=compute, args=(payload, output), daemon=True)
            process.start()
            jobs.items[key] = {"process": process, "queue": output, "access": time.monotonic(),
                               "value": {"state": "running", "progress": {"message": "공동 탐색 준비 중"}}}
        return self.reply(202, {"id": key})

    def do_DELETE(self):
        if not self.allowed():
            return self.reply(403, {"message": "로컬 요청만 허용합니다."})
        with jobs.lock:
            jobs.remove(self.path.removeprefix('/jobs/'))
        return self.reply(200, {"cancelled": True})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    def reap():
        while True:
            time.sleep(30)
            with jobs.lock:
                jobs.prune()
    threading.Thread(target=reap, daemon=True).start()
    print(f'Timetable solver ready on 127.0.0.1:{args.port}', flush=True)
    try:
        server.serve_forever()
    finally:
        with jobs.lock:
            for key in list(jobs.items):
                jobs.remove(key)


if __name__ == '__main__':
    mp.freeze_support()
    main()
