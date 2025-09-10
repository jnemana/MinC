import azure.functions as func
from function_app import app   # <-- import the single app

@app.function_name(name="minc_health")
@app.route(route="health", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def health(req: func.HttpRequest) -> func.HttpResponse:
    return func.HttpResponse(
        status_code=200,
        mimetype="application/json",
        body='{"status":"ok","service":"minc-vegu-backend"}'
    )
