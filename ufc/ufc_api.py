from fastapi import FastAPI
from fastapi.responses import JSONResponse
from ufc.scrape_ufc_playwright import get_ufc_events

app = FastAPI()

@app.get("/events")
async def get_events():
    events = await get_ufc_events()
    return JSONResponse(content=events) 