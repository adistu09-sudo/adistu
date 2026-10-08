import os
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import firestore
from google.api_core.exceptions import AlreadyExists


SHOPS = [
    ("sample-shop-1", "Moss & Kiln", "Home goods", 12.975, 77.6),
    ("sample-shop-2", "Common Thread Studio", "Made to carry", 12.96, 77.6),
    ("sample-shop-3", "Little Orbit Jewelry", "Small-batch jewelry", 12.99, 77.57),
    ("sample-shop-4", "Good Measure Coffee", "Freshly roasted", 12.94, 77.62),
    ("sample-shop-5", "Soft Form", "Slow fashion", 12.83, 77.68),
    ("sample-shop-6", "Moss & Kiln", "Grown with care", 13.18, 77.65),
]

PRODUCTS = [
    ("stoneware-vase", 1, "Sunday stoneware vase", "42", "Sculptural ceramic vase in a softly lit interior", "https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&w=900&q=85", 28, "That glaze is beautiful."),
    ("market-tote", 2, "The everyday market tote", "36", "A thoughtfully designed everyday bag", "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85", 46, "Adding this to my weekend list."),
    ("gold-earrings", 3, "Daybreak gold hoops", "54", "A collection of delicate gold jewelry", "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=85", 73, "Are these available in silver too?"),
    ("coffee-beans", 4, "Sunday morning house blend", "19", "Freshly brewed coffee on a cafe table", "https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=900&q=85", 35, "Their espresso is so good."),
    ("linen-shirt", 5, "Relaxed linen weekend shirt", "68", "A neatly styled neutral linen outfit", "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=900&q=85", 51, "Love the natural color."),
    ("planter", 6, "Little fern ceramic planter", "32", "A lush green houseplant in a ceramic pot", "https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=900&q=85", 62, "Perfect for my windowsill."),
]


def seed_document(reference, item):
    try:
        reference.create(item)
        return True
    except AlreadyExists:
        return False


def main():
    options = {}
    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("FIREBASE_PROJECT_ID")
    if project_id:
        options["projectId"] = project_id
    app = firebase_admin.initialize_app(options=options)
    db = firestore.client(app=app)
    added_shops = 0
    for shop_id, name, category, latitude, longitude in SHOPS:
        added_shops += seed_document(
            db.collection("shops").document(shop_id),
            {
                "owner_id": shop_id,
                "name": name,
                "category": category,
                "latitude": latitude,
                "longitude": longitude,
                "delivery_fee": 0,
            },
        )
    added_products = 0
    added_comments = 0
    for product_id, shop_number, name, price, alt, image_url, likes, comment in PRODUCTS:
        product_ref = db.collection("products").document(product_id)
        added_products += seed_document(
            product_ref,
            {
                "id": product_id,
                "shop_id": f"sample-shop-{shop_number}",
                "name": name,
                "price": float(price),
                "category": "",
                "description": "",
                "stock": 0,
                "image_alt": alt,
                "image_url": image_url,
                "base_likes": likes,
                "like_count": 0,
                "created_at": datetime(2026, 1, 1, 0, 0, shop_number, tzinfo=timezone.utc).isoformat(),
            },
        )
        added_comments += seed_document(
            product_ref.collection("activities").document(
                f"COMMENT#2026-01-01T00:00:{shop_number:02d}+00:00#{shop_number:02d}"
            ),
            {
                "kind": "comment",
                "user_id": "sample",
                "body": comment,
            },
        )
    print(f"Added {added_shops} sample shops, {added_products} products, and {added_comments} comments.")


if __name__ == "__main__":
    main()
