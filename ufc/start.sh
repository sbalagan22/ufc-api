#!/usr/bin/env bash
playwright install
uvicorn ufc.ufc_api:app --host 0.0.0.0 --port 10000
