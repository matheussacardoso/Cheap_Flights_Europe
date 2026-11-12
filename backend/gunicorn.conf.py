"""Production server config (Linux / Docker only - gunicorn does not run on Windows).

Run from backend/:  gunicorn app.main:app -c gunicorn.conf.py
"""

import multiprocessing
import os

bind = os.getenv("BIND", "0.0.0.0:8000")
# (CPU cores * 2) + 1, overridable with WEB_CONCURRENCY.
workers = int(os.getenv("WEB_CONCURRENCY", multiprocessing.cpu_count() * 2 + 1))
# Uvicorn worker from the `uvicorn-worker` package; uses uvloop + httptools when installed.
worker_class = "uvicorn_worker.UvicornWorker"
timeout = int(os.getenv("TIMEOUT", "60"))
graceful_timeout = 30
keepalive = 5
accesslog = None  # access logs come from the app's structured logging middleware
errorlog = "-"
