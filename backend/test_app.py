import unittest
from unittest.mock import patch

from backend import app as service
from backend.main import api as cloud_function_api


class Snapshot:
    def __init__(self, document_id, data):
        self.id = document_id
        self.exists = data is not None
        self._data = data

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class FakeDocument:
    def __init__(self, parent, document_id):
        self.parent = parent
        self.id = document_id

    def get(self, **_kwargs):
        return Snapshot(self.id, self.parent.items.get(self.id))

    def create(self, data):
        if self.id in self.parent.items:
            from google.api_core.exceptions import AlreadyExists

            raise AlreadyExists("document exists")
        self.parent.items[self.id] = dict(data)

    def set(self, data):
        self.parent.items[self.id] = dict(data)

    def delete(self):
        self.parent.items.pop(self.id, None)

    def collection(self, name):
        return self.parent.database.collection(f"{self.parent.name}/{self.id}/{name}")


class FakeCollection:
    def __init__(self, database, name):
        self.database = database
        self.name = name
        self.items = database.data.setdefault(name, {})
        self.filters = []

    def document(self, document_id):
        return FakeDocument(self, document_id)

    def stream(self):
        return (
            Snapshot(document_id, data)
            for document_id, data in self.items.items()
            if all(data.get(field) == value for field, value in self.filters)
        )

    def where(self, field, _operator, value):
        filtered = FakeCollection(self.database, self.name)
        filtered.filters = [*self.filters, (field, value)]
        return filtered


class FakeDatabase:
    def __init__(self):
        self.data = {}

    def collection(self, name):
        return FakeCollection(self, name)


class CloudFunctionsMarketplaceTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeDatabase()
        self.client = service.app.test_client()

    def test_seller_can_save_delivery_fee_and_feed_returns_it(self):
        claims = {"uid": "seller-1", "firebase": {"sign_in_provider": "password"}, "email_verified": True}
        with patch.object(service, "_db", return_value=self.db), patch.object(service, "_seller", return_value="seller-1"):
            status, result = service._seller_shop(
                claims,
                "PUT",
                {
                    "name": "Local Goods",
                    "category": "Home",
                    "latitude": "12.97",
                    "longitude": "77.59",
                    "delivery_fee": "35.50",
                },
            )
        self.assertEqual(status, 200)
        self.assertEqual(result["shop"]["delivery_fee"], 35.5)

        self.db.collection("products").document("product-1").set(
            {
                "id": "product-1",
                "shop_id": "seller-1",
                "name": "Handmade bowl",
                "price": 500,
                "category": "Ceramics",
                "description": "",
                "image_url": "https://example.com/bowl.jpg",
                "base_likes": 0,
            }
        )
        with patch.object(service, "_db", return_value=self.db):
            feed = service._feed(
                {"latitude": 12.97, "longitude": 77.59, "radius_km": 15},
                {"uid": "buyer-1"},
            )

        self.assertEqual(feed["count"], 1)
        self.assertEqual(feed["products"][0]["delivery_fee"], 35.5)

    def test_zero_delivery_fee_is_saved_and_negative_fee_is_rejected(self):
        claims = {"uid": "seller-1"}
        with patch.object(service, "_db", return_value=self.db), patch.object(service, "_seller", return_value="seller-1"):
            status, result = service._seller_shop(
                claims,
                "PUT",
                {
                    "name": "Local Goods",
                    "category": "Home",
                    "latitude": 12.97,
                    "longitude": 77.59,
                    "delivery_fee": 0,
                },
            )
            self.assertEqual(status, 200)
            self.assertEqual(result["shop"]["delivery_fee"], 0)
            with self.assertRaises(service.ApiError) as error:
                service._seller_shop(
                    claims,
                    "PUT",
                    {
                        "name": "Local Goods",
                        "category": "Home",
                        "latitude": 12.97,
                        "longitude": 77.59,
                        "delivery_fee": -1,
                    },
                )
        self.assertEqual(error.exception.status_code, 400)

    def test_worker_responses_keep_the_frontend_id_field(self):
        claims = {"uid": "seller-1"}
        with patch.object(service, "_db", return_value=self.db), patch.object(service, "_seller", return_value="seller-1"):
            status, created = service._seller_workers(
                claims,
                "POST",
                {
                    "name": "Delivery person",
                    "nickname": "Dee",
                    "phone": "+919876543210",
                    "salary": 18000,
                    "email": "dee@example.com",
                    "shift": "Morning",
                    "role": "delivery",
                },
            )
            self.assertEqual(status, 201)
            self.assertIn("id", created["worker"])
            self.assertNotIn("worker_id", created["worker"])
            status, result = service._seller_workers(claims, "GET")

        self.assertEqual(status, 200)
        self.assertEqual(result["workers"][0]["id"], created["worker"]["id"])

    def test_config_endpoint_returns_public_firebase_web_settings(self):
        settings = {
            "FIREBASE_API_KEY": "public-web-key",
            "FIREBASE_AUTH_DOMAIN": "adistu.firebaseapp.com",
            "FIREBASE_PROJECT_ID": "adistu",
            "FIREBASE_APP_ID": "web-app-id",
            "FIREBASE_MESSAGING_SENDER_ID": "sender-id",
        }
        with patch.dict("os.environ", settings, clear=False):
            response = self.client.get("/api/config")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["projectId"], "adistu")
        self.assertEqual(response.get_json()["apiKey"], "public-web-key")

    def test_cloud_function_entry_point_dispatches_api_requests(self):
        settings = {
            "FIREBASE_PROJECT_ID": "adistu",
            "FIREBASE_API_KEY": "public-web-key",
            "FIREBASE_APP_ID": "web-app-id",
        }
        with (
            patch.dict("os.environ", settings, clear=False),
            service.app.test_request_context("/api/config") as context,
        ):
            response = cloud_function_api(context.request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["projectId"], "adistu")
        self.assertEqual(response.get_json()["apiKey"], "public-web-key")

    def test_phone_profile_creation_requires_a_verified_firebase_identity(self):
        claims = {
            "uid": "phone-user",
            "phone_number": "+14155550123",
            "firebase": {"sign_in_provider": "phone"},
        }
        with (
            patch.object(service, "_firebase", return_value=object()),
            patch.object(service.auth, "verify_id_token", return_value=claims),
            patch.object(service, "_db", return_value=self.db),
        ):
            response = self.client.post(
                "/api/auth/profile",
                headers={"Authorization": "Bearer test-token"},
                json={"name": "Phone User", "account_type": "buyer"},
            )
            duplicate = self.client.post(
                "/api/auth/profile",
                headers={"Authorization": "Bearer test-token"},
                json={"name": "Changed Name", "account_type": "seller"},
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["user"]["identity"], "+14155550123")
        self.assertEqual(duplicate.status_code, 409)
        stored = self.db.collection("users").document("phone-user").get().to_dict()
        self.assertEqual(stored["account_type"], "buyer")

    def test_seller_can_delete_own_product(self):
        claims = {"uid": "seller-1"}
        self.db.collection("shops").document("seller-1").set(
            {
                "owner_id": "seller-1",
                "name": "Local Goods",
                "category": "Home",
                "latitude": 12.97,
                "longitude": 77.59,
                "delivery_fee": 15,
            }
        )
        self.db.collection("products").document("product-1").set(
            {
                "id": "product-1",
                "shop_id": "seller-1",
                "name": "Handmade bowl",
                "price": 500,
                "category": "Ceramics",
                "description": "",
                "image_url": "https://example.com/bowl.jpg",
                "base_likes": 0,
                "like_count": 0,
            }
        )
        with (
            patch.object(service, "_db", return_value=self.db),
            patch.object(service, "_seller", return_value="seller-1"),
            patch.object(service, "_claims", return_value=claims),
        ):
            with service.app.test_request_context("/api/seller/products/product-1", method="DELETE"):
                response = service._handle_api()

        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.db.collection("products").document("product-1").get().exists)

    def test_session_requires_bearer_authentication(self):
        response = self.client.get("/api/auth/session")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
