# minc-vegu-backend/function_app.py
import azure.functions as func

# One global app
app = func.FunctionApp()

# Import function modules so their decorators run and register with `app`
import minc_health  # noqa: F401
import minc_login_init          # noqa: F401
import minc_login_password      # noqa: F401
import minc_send_email_otp      # noqa: F401
import minc_verify_email_otp    # noqa: F401
import vegu_institutions_search  # noqa: F401
import vegu_institutions_get     # noqa: F401
import vegu_institutions_update  # noqa: F401
import vegu_responders_search   # noqa: F401
import vegu_responders_get      # noqa: F401
import vegu_responders_update   # noqa: F401
import vegu_users_search   # noqa: F401
import vegu_users_get      # noqa: F401
import vegu_users_update   # noqa: F401
import vegu_complaints_search  # noqa: F401
import vegu_complaints_get     # noqa: F401
import vegu_messages_thread        # noqa: F401
import vegu_reveal_user  # noqa: F401
