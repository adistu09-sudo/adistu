import logging
import math
import os
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse

import firebase_admin
from firebase_admin import auth, firestore
from firebase_admin.exceptions import FirebaseError
from flask import Flask, jsonify, request
from google.api_core.exceptions import AlreadyExists, GoogleAPICallError


LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE_PATTERN = re.compile(r"^\+[1-9][0-9]{6,14}$")
BASE_HEADERS = {"Cache-Control": "no-store"}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024
_firestore_client = None
_firebase_app = None


class ApiError(Exception):
    def __init__(self, status_code, message):
        self.status_code = status_code
        self.message = message


def _firebase():
    global _firebase_app
    if _firebase_app is None:
        options = {}
        project_id = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("FIREBASE_PROJECT_ID")
        if project_id:
            options["projectId"] = project_id
        _firebase_app = firebase_admin.initialize_app(options=options)
    return _firebase_app


def _db():
    global _firestore_client
    if _firestore_client is None:
        _firestore_client = firestore.client(app=_firebase())
    return _firestore_client


def _response(body, status_code=200):
    response = jsonify(body)
    response.status_code = status_code
    for name, value in BASE_HEADERS.items():
        response.headers[name] = value
    return response


def _body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object.")
    return data


def _required_text(data, name, minimum, maximum):
    value = data.get(name)
    if not isinstance(value, str):
        raise ApiError(400, f"{name.replace('_', ' ').capitalize()} is required.")
    value = value.strip()
    if not minimum <= len(value) <= maximum:
        raise ApiError(400, f"{name.replace('_', ' ').capitalize()} must be {minimum} to {maximum} characters.")
    return value


def _number(data, name, minimum, maximum):
    value = data.get(name)
    if isinstance(value, bool):
        raise ApiError(400, f"{name.replace('_', ' ').capitalize()} must be a number.")
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ApiError(400, f"{name.replace('_', ' ').capitalize()} must be a number.") from None
    if not number.is_finite() or number < minimum or number > maximum:
        raise ApiError(400, f"{name.replace('_', ' ').capitalize()} is outside the allowed range.")
    return number


def _claims():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise ApiError(401, "Sign in to continue.")
    try:
        claims = auth.verify_id_token(token, check_revoked=True, app=_firebase())
    except (
        auth.InvalidIdTokenError,
        auth.ExpiredIdTokenError,
        auth.RevokedIdTokenError,
        auth.UserDisabledError,
        auth.UserNotFoundError,
    ):
        raise ApiError(401, "Your session expired. Please sign in again.") from None
    except FirebaseError:
        LOGGER.exception("Firebase Authentication could not verify the ID token.")
        raise ApiError(502, "The account service could not complete this request.") from None
    if not claims.get("uid"):
        raise ApiError(401, "Sign in to continue.")
    return claims


def _user(claims):
    uid = claims["uid"]
    profile_ref = _db().collection("users").document(uid)
    profile = profile_ref.get()
    if not profile.exists and claims.get("firebase", {}).get("sign_in_provider") == "google.com":
        google_profile = {
            "name": claims.get("name") or claims.get("email", "Shopper"),
            "account_type": "buyer",
            "identity": claims.get("email", ""),
            "created_at": datetime.now(timezone.utc),
        }
        try:
            profile_ref.create(google_profile)
            profile_data = google_profile
        except AlreadyExists:
            profile_data = profile_ref.get().to_dict()
    elif profile.exists:
        profile_data = profile.to_dict()
    else:
        raise ApiError(403, "No Adistu profile is linked to this account. Create an account first.")

    provider = claims.get("firebase", {}).get("sign_in_provider")
    if provider == "password" and not claims.get("email_verified"):
        raise ApiError(403, "Verify your email address before signing in.")
    if provider == "phone" and not claims.get("phone_number"):
        raise ApiError(403, "Verify your phone number before signing in.")
    return {
        "id": uid,
        "name": profile_data.get("name") or "Shopper",
        "identity": claims.get("email") or claims.get("phone_number") or "",
        "account_type": profile_data.get("account_type", "buyer"),
    }


def _seller(claims):
    user = _user(claims)
    if user["account_type"] != "seller":
        raise ApiError(403, "A seller account is required.")
    return claims["uid"]


def _profile():
    claims = _claims()
    data = _body()
    name = _required_text(data, "name", 1, 150)
    account_type = data.get("account_type", "buyer")
    if account_type not in ("buyer", "seller"):
        raise ApiError(400, "Choose a valid account type.")
    provider = claims.get("firebase", {}).get("sign_in_provider")
    if provider == "password" and not claims.get("email"):
        raise ApiError(400, "Use an email address for email/password accounts.")
    if provider == "phone" and not PHONE_PATTERN.fullmatch(claims.get("phone_number", "")):
        raise ApiError(400, "Verify a valid phone number before creating your account.")
    if provider not in {"password", "phone"}:
        raise ApiError(400, "This sign-in provider cannot create a marketplace profile.")
    identity = claims.get("email") or claims.get("phone_number", "")
    profile = {
        "name": name,
        "account_type": account_type,
        "identity": identity,
        "created_at": datetime.now(timezone.utc),
    }
    try:
        _db().collection("users").document(claims["uid"]).create(profile)
    except AlreadyExists:
        raise ApiError(409, "An Adistu profile already exists for this account.") from None
    return {"user": {"id": claims["uid"], **{key: profile[key] for key in ("name", "identity", "account_type")}}}


def _distance_km(latitude_a, longitude_a, latitude_b, longitude_b):
    earth_radius_km = 6371.0088
    lat_a = math.radians(latitude_a)
    lat_b = math.radians(latitude_b)
    delta_lat = lat_b - lat_a
    delta_lon = math.radians(longitude_b - longitude_a)
    haversine = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lon / 2) ** 2
    )
    return earth_radius_km * 2 * math.asin(math.sqrt(haversine))


def _product_ref(product_id):
    return _db().collection("products").document(product_id)


def _get_product(product_id):
    product = _product_ref(product_id).get()
    if not product.exists:
        raise ApiError(404, "Product not found.")
    return product.to_dict()


def _activity_ref(product_id):
    return _product_ref(product_id).collection("activities")


def _feed(data, claims):
    latitude = float(_number(data, "latitude", Decimal(-90), Decimal(90)))
    longitude = float(_number(data, "longitude", Decimal(-180), Decimal(180)))
    radius = float(_number(data, "radius_km", Decimal(2), Decimal(50)))
    user_id = claims["uid"]
    shops = {}
    feed = []
    for product_doc in _db().collection("products").stream():
        product = product_doc.to_dict()
        product_id = product_doc.id
        shop_id = product["shop_id"]
        if shop_id not in shops:
            shop_doc = _db().collection("shops").document(shop_id).get()
            shops[shop_id] = shop_doc.to_dict() if shop_doc.exists else None
        shop = shops[shop_id]
        if shop is None:
            continue
        distance = _distance_km(latitude, longitude, float(shop["latitude"]), float(shop["longitude"]))
        if distance > radius:
            continue
        likes = []
        saves = []
        comments = []
        for activity in _activity_ref(product_id).stream():
            item = activity.to_dict()
            item["action_key"] = activity.id
            if item.get("kind") == "like":
                likes.append(item)
            elif item.get("kind") == "save":
                saves.append(item)
            elif item.get("kind") == "comment":
                comments.append(item)
        comments.sort(key=lambda item: item["action_key"])
        feed.append(
            {
                "id": product_id,
                "shop": shop["name"],
                "category": product.get("category") or shop["category"],
                "name": product["name"],
                "price": product["price"],
                "description": product.get("description", ""),
                "delivery_fee": shop.get("delivery_fee", 0),
                "distance_km": round(distance, 1),
                "image_url": product["image_url"],
                "image_alt": product.get("image_alt", product["name"]),
                "like_count": int(product.get("base_likes", 0)) + int(product.get("like_count", 0)),
                "liked": any(item.get("user_id") == user_id for item in likes),
                "saved": any(item.get("user_id") == user_id for item in saves),
                "comments": [
                    {
                        "body": item["body"],
                        "author": "You" if item.get("user_id") == user_id else "A neighbor",
                    }
                    for item in comments
                ],
            }
        )
    feed.sort(key=lambda item: (item["distance_km"], item["id"]))
    return {"products": feed, "radius_km": radius, "count": len(feed)}


def _seller_shop(claims, method, data=None):
    owner_id = _seller(claims)
    shop_ref = _db().collection("shops").document(owner_id)
    if method == "GET":
        shop_doc = shop_ref.get()
        shop = shop_doc.to_dict() if shop_doc.exists else None
        if shop:
            shop.pop("owner_id", None)
        return 200, {"shop": shop}
    name = _required_text(data, "name", 2, 100)
    category = _required_text(data, "category", 2, 60)
    latitude = float(_number(data, "latitude", Decimal(-90), Decimal(90)))
    longitude = float(_number(data, "longitude", Decimal(-180), Decimal(180)))
    delivery_fee = float(_number(data, "delivery_fee", Decimal(0), Decimal(100000)).quantize(Decimal("0.01")))
    shop = {
        "owner_id": owner_id,
        "name": name,
        "category": category,
        "latitude": latitude,
        "longitude": longitude,
        "delivery_fee": delivery_fee,
    }
    shop_ref.set(shop)
    response = dict(shop)
    response.pop("owner_id")
    return 200, {"shop": response}


def _seller_products(claims):
    owner_id = _seller(claims)
    items = []
    for product_doc in _db().collection("products").where("shop_id", "==", owner_id).stream():
        item = product_doc.to_dict()
        created_at = item.get("created_at", "")
        for field in ("shop_id", "created_at", "base_likes", "like_count", "image_alt"):
            item.pop(field, None)
        items.append((created_at, item))
    items.sort(key=lambda entry: entry[0], reverse=True)
    return {"products": [item for _, item in items]}


def _create_product(claims, data):
    owner_id = _seller(claims)
    if not _db().collection("shops").document(owner_id).get().exists:
        raise ApiError(400, "Save your shop details before adding products.")
    name = _required_text(data, "name", 2, 120)
    category = _required_text(data, "category", 2, 60)
    description = data.get("description", "")
    if not isinstance(description, str) or len(description) > 1000:
        raise ApiError(400, "Description must be 1000 characters or fewer.")
    price = _number(data, "price", Decimal("0.01"), Decimal(100000000))
    stock = _number(data, "stock", Decimal(0), Decimal(1000000))
    if stock % 1:
        raise ApiError(400, "Stock must be a whole number.")
    image_url = _required_text(data, "image_url", 1, 2000)
    parsed = urlparse(image_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ApiError(400, "Enter a valid http or https image URL.")
    product_id = f"seller-{uuid.uuid4().hex}"
    item = {
        "id": product_id,
        "shop_id": owner_id,
        "name": name,
        "price": float(price.quantize(Decimal("0.01"))),
        "category": category,
        "description": description.strip(),
        "stock": int(stock),
        "image_alt": name,
        "image_url": image_url,
        "base_likes": 0,
        "like_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _product_ref(product_id).create(item)
    response = {key: value for key, value in item.items() if key not in {"shop_id", "created_at", "base_likes", "like_count", "image_alt"}}
    return 201, {"product": response}


def _seller_workers(claims, method, data=None, worker_id=None):
    seller_id = _seller(claims)
    workers = _db().collection("shops").document(seller_id).collection("workers")
    if method == "GET":
        items = []
        for worker_doc in workers.stream():
            items.append(worker_doc.to_dict())
        items.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        return 200, {"workers": items}
    if method == "DELETE":
        if not worker_id:
            raise ApiError(400, "Worker not found.")
        worker_ref = workers.document(worker_id)
        if not worker_ref.get().exists:
            raise ApiError(404, "Worker not found in your team.")
        worker_ref.delete()
        return 200, {"ok": True}
    name = _required_text(data, "name", 1, 120)
    nickname = _required_text(data, "nickname", 1, 80)
    phone = _required_text(data, "phone", 7, 20)
    digits = re.sub(r"[\s().-]", "", phone)
    if not re.fullmatch(r"\+?[0-9]{7,15}", digits):
        raise ApiError(400, "Enter a valid phone number with 7 to 15 digits.")
    email = _required_text(data, "email", 5, 254).casefold()
    if not EMAIL_PATTERN.fullmatch(email):
        raise ApiError(400, "Enter a valid email address.")
    salary = float(_number(data, "salary", Decimal(0), Decimal(100000000)))
    shift = _required_text(data, "shift", 1, 80)
    role = data.get("role")
    if role not in ("employee", "delivery", "both"):
        raise ApiError(400, "Choose a valid team role.")
    worker_id = uuid.uuid4().hex
    worker = {
        "id": worker_id,
        "name": name,
        "nickname": nickname,
        "phone": digits,
        "salary": salary,
        "email": email,
        "shift": shift,
        "role": role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    workers.document(worker_id).create(worker)
    return 201, {"worker": worker}


def _toggle_activity(product_id, user_id, kind):
    activity_id = f"{kind.upper()}#{user_id}"
    activity_ref = _activity_ref(product_id).document(activity_id)
    product_ref = _product_ref(product_id)
    transaction = _db().transaction()

    @firestore.transactional
    def toggle(transaction):
        existing = activity_ref.get(transaction=transaction)
        if existing.exists:
            transaction.delete(activity_ref)
            if kind == "like":
                transaction.update(product_ref, {"like_count": firestore.Increment(-1)})
            return False
        transaction.create(activity_ref, {"kind": kind, "user_id": user_id})
        if kind == "like":
            transaction.update(product_ref, {"like_count": firestore.Increment(1)})
        return True

    return toggle(transaction)


def _handle_api():
    method = request.method
    path = request.path
    if path == "/api/config" and method == "GET":
        return _response(
            {
                "apiKey": os.environ.get("FIREBASE_API_KEY", ""),
                "authDomain": os.environ.get("FIREBASE_AUTH_DOMAIN", ""),
                "projectId": os.environ.get("FIREBASE_PROJECT_ID") or os.environ.get("GOOGLE_CLOUD_PROJECT", ""),
                "appId": os.environ.get("FIREBASE_APP_ID", ""),
                "messagingSenderId": os.environ.get("FIREBASE_MESSAGING_SENDER_ID", ""),
                "authEmulatorUrl": os.environ.get("FIREBASE_AUTH_EMULATOR_URL", ""),
            }
        )
    if path == "/api/auth/profile" and method == "POST":
        return _response(_profile(), 201)
    if path == "/api/auth/session" and method == "GET":
        return _response({"authenticated": True, "user": _user(_claims())})
    if path == "/api/auth/logout" and method == "POST":
        claims = _claims()
        auth.revoke_refresh_tokens(claims["uid"], app=_firebase())
        return _response({"ok": True})
    claims = _claims()
    if path == "/api/feed" and method == "POST":
        return _response(_feed(_body(), claims))
    if path == "/api/seller/shop" and method in {"GET", "PUT"}:
        status, result = _seller_shop(claims, method, _body() if method == "PUT" else None)
        return _response(result, status)
    if path == "/api/seller/products" and method == "GET":
        return _response(_seller_products(claims))
    if path == "/api/seller/products" and method == "POST":
        status, result = _create_product(claims, _body())
        return _response(result, status)
    if path.startswith("/api/seller/products/") and method == "DELETE":
        product_id = path.removeprefix("/api/seller/products/")
        product = _get_product(product_id)
        if product.get("shop_id") != _seller(claims):
            raise ApiError(404, "Product not found in your shop.")
        _product_ref(product_id).delete()
        return _response({"ok": True})
    if path == "/api/seller/workers" and method in {"GET", "POST"}:
        status, result = _seller_workers(claims, method, _body() if method == "POST" else None)
        return _response(result, status)
    if path.startswith("/api/seller/workers/") and method == "DELETE":
        worker_id = path.removeprefix("/api/seller/workers/")
        status, result = _seller_workers(claims, method, worker_id=worker_id)
        return _response(result, status)
    match = re.fullmatch(r"/api/products/([^/]+)/(like|save|comments)", path)
    if match and method == "POST":
        product_id, action = match.groups()
        product = _get_product(product_id)
        if action in {"like", "save"}:
            toggled = _toggle_activity(product_id, claims["uid"], action)
            if action == "like":
                latest = _get_product(product_id)
                like_count = int(latest.get("base_likes", 0)) + int(latest.get("like_count", 0))
                return _response({"liked": toggled, "like_count": like_count})
            return _response({"saved": toggled})
        body = _required_text(_body(), "body", 1, 240)
        timestamp = datetime.now(timezone.utc).isoformat()
        comment_id = f"COMMENT#{timestamp}#{uuid.uuid4().hex}"
        _activity_ref(product_id).document(comment_id).create(
            {"kind": "comment", "user_id": claims["uid"], "body": body}
        )
        return _response({"id": comment_id, "body": body, "author": "You"}, 201)
    raise ApiError(404, "Not found.")


@app.get("/api/<path:api_path>")
@app.post("/api/<path:api_path>")
@app.put("/api/<path:api_path>")
@app.delete("/api/<path:api_path>")
def api(api_path):
    try:
        return _handle_api()
    except ApiError as exc:
        return _response({"detail": exc.message}, exc.status_code)
    except GoogleAPICallError:
        LOGGER.exception("Google Cloud API request failed.")
        return _response({"detail": "The Google Cloud service could not complete this request."}, 502)


@app.get("/api")
def api_root():
    return _response({"detail": "Not found."}, 404)


@app.errorhandler(ApiError)
def handle_api_error(exc):
    return _response({"detail": exc.message}, exc.status_code)


@app.errorhandler(413)
def payload_too_large(_exc):
    return _response({"detail": "Request body is too large."}, 413)


@app.errorhandler(500)
def internal_error(exc):
    LOGGER.exception("Unhandled application error.", exc_info=exc)
    return _response({"detail": "The service could not complete this request."}, 500)
