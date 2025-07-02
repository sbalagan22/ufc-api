from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
import os
from ufc.scrape_ufc_playwright import get_ufc_events

app = FastAPI()

API_KEY = os.environ.get("API_KEY", "your-secret-key")  # Set this in Render dashboard

@app.get("/events")
async def get_events(x_api_key: str = Header(...)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    events = await get_ufc_events()
    return JSONResponse(content=events) 