# minc-vegu-backend/function_app.py
import azure.functions as func

# One global app
app = func.FunctionApp()

# Import function modules so their decorators run and register with `app`
import minc_health  # noqa: F401
