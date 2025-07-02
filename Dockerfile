FROM mcr.microsoft.com/playwright/python:v1.53.0-jammy

WORKDIR /app
COPY requirements.txt /app/
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

COPY . /app

EXPOSE 10000

CMD ["uvicorn", "ufc.ufc_api:app", "--host", "0.0.0.0", "--port", "10000"] 