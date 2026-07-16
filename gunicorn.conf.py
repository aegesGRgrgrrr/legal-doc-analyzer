# Auto-loaded by `gunicorn app:app` (gunicorn looks for this file in the
# working directory by default — no --config flag needed).
#
# Gunicorn's default worker timeout is 30 seconds. The AI analysis step
# (/analyze) reads the full document text and asks Claude to reason through
# clauses, risks, obligations, and missing terms, which routinely takes
# 30-60+ seconds on longer contracts — the default timeout kills the worker
# mid-request, which looks like "something went wrong" to the user. Bumped
# further to cover reading/extracting text from large multi-file uploads
# (up to 800MB, see MAX_CONTENT_LENGTH in app.py).
timeout = 600
workers = 1
