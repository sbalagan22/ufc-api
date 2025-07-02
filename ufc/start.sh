#!/usr/bin/env bash
playwright install --with-deps
uvicorn ufc.ufc_api:app --host 0.0.0.0 --port 10000
