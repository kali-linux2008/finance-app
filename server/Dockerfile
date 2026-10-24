FROM python:3.13-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 MERIDIAN_DATA=/app/data

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY meridian ./meridian

# Niet als root draaien; de data-map (database + hoofdsleutel) komt van buiten via een volume.
RUN useradd --create-home --uid 1000 meridian && mkdir -p /app/data && chown meridian /app/data
USER meridian

EXPOSE 8000
HEALTHCHECK --interval=60s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["uvicorn", "meridian.api:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
