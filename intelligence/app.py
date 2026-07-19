from fastapi import FastAPI

app = FastAPI(title="Vibe Bus Arrival Intelligence")

@app.get('/health')
def health():
    return {'status': 'ok'}

@app.get('/insights')
def insights():
    return {
        'message': 'Bus arrival intelligence service is ready.',
        'summary': 'This endpoint can later generate route and commute insights.'
    }
