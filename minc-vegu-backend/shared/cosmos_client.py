# shared/cosmos_client.py  (add if missing)
import os
from functools import lru_cache
from azure.cosmos import CosmosClient

COSMOS_URI_ENV = "COSMOS_URI"
COSMOS_KEY_ENV = "COSMOS_KEY"
COSMOS_DB_ENV = "COSMOS_DB"
COSMOS_USERS_CONTAINER_ENV = "COSMOS_USERS_CONTAINER"
COSMOS_OTP_CONTAINER_ENV = "COSMOS_OTP_CONTAINER"

DEFAULT_DB = "minc"
DEFAULT_USERS_CONTAINER = "minc_users"
DEFAULT_OTP_CONTAINER = "minc_otp_log"

@lru_cache(maxsize=1)
def get_client() -> CosmosClient:
    uri = os.getenv(COSMOS_URI_ENV)
    key = os.getenv(COSMOS_KEY_ENV)
    return CosmosClient(uri, credential=key)

def get_container(db_name: str, container_name: str):
    db = get_client().get_database_client(os.getenv(COSMOS_DB_ENV, db_name))
    return db.get_container_client(container_name)

def users_container():
    return get_container(os.getenv(COSMOS_DB_ENV, DEFAULT_DB),
                         os.getenv(COSMOS_USERS_CONTAINER_ENV, DEFAULT_USERS_CONTAINER))

def otp_container():
    return get_container(os.getenv(COSMOS_DB_ENV, DEFAULT_DB),
                         os.getenv(COSMOS_OTP_CONTAINER_ENV, DEFAULT_OTP_CONTAINER))
