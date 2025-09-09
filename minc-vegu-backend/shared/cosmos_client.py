# shared/cosmos_client.py
import os
from functools import lru_cache
from azure.cosmos import CosmosClient

# Canonical env var names
COSMOS_URI_ENV = "COSMOS_URI"
COSMOS_KEY_ENV = "COSMOS_KEY"
COSMOS_DB_ENV = "COSMOS_DB"
COSMOS_USERS_CONTAINER_ENV = "COSMOS_USERS_CONTAINER"

DEFAULT_DB = "minc"
DEFAULT_USERS_CONTAINER = "minc_users"

class MissingCosmosConfig(Exception):
    pass

@lru_cache(maxsize=1)
def get_client() -> CosmosClient:
    uri = os.getenv(COSMOS_URI_ENV)
    key = os.getenv(COSMOS_KEY_ENV)
    if not uri or not key:
        raise MissingCosmosConfig(
            f"Set {COSMOS_URI_ENV} and {COSMOS_KEY_ENV} in local.settings.json / Azure App Settings."
        )
    return CosmosClient(uri, credential=key)

def get_container(db_name: str, container_name: str):
    client = get_client()
    db = client.get_database_client(db_name)
    return db.get_container_client(container_name)

def users_container():
    db_name = os.getenv(COSMOS_DB_ENV, DEFAULT_DB)
    container = os.getenv(COSMOS_USERS_CONTAINER_ENV, DEFAULT_USERS_CONTAINER)
    return get_container(db_name, container)
