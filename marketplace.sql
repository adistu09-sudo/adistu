BEGIN TRANSACTION;
CREATE TABLE comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                body TEXT NOT NULL CHECK(length(body) <= 240),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
INSERT INTO "comments" VALUES(1,0,'stoneware-vase','That glaze is beautiful.','2026-10-05 09:42:38');
INSERT INTO "comments" VALUES(2,0,'market-tote','Adding this to my weekend list.','2026-10-05 09:42:38');
INSERT INTO "comments" VALUES(3,0,'gold-earrings','Are these available in silver too?','2026-10-05 09:42:38');
INSERT INTO "comments" VALUES(4,0,'coffee-beans','Their espresso is so good.','2026-10-05 09:42:38');
INSERT INTO "comments" VALUES(5,0,'linen-shirt','Love the natural color.','2026-10-05 09:42:38');
INSERT INTO "comments" VALUES(6,0,'planter','Perfect for my windowsill.','2026-10-05 09:42:38');
CREATE TABLE likes (
                user_id INTEGER NOT NULL,
                product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, product_id)
            );
CREATE TABLE products (
                id TEXT PRIMARY KEY,
                shop_id INTEGER NOT NULL REFERENCES shops(id),
                name TEXT NOT NULL,
                price TEXT NOT NULL,
                image_alt TEXT NOT NULL,
                image_url TEXT NOT NULL,
                base_likes INTEGER NOT NULL
            , description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', stock INTEGER NOT NULL DEFAULT 0);
INSERT INTO "products" VALUES('stoneware-vase',1,'Sunday stoneware vase','42','Sculptural ceramic vase in a softly lit interior','https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&w=900&q=85',28,'','',0);
INSERT INTO "products" VALUES('market-tote',2,'The everyday market tote','36','A thoughtfully designed everyday bag','https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85',46,'','',0);
INSERT INTO "products" VALUES('gold-earrings',3,'Daybreak gold hoops','54','A collection of delicate gold jewelry','https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=85',73,'','',0);
INSERT INTO "products" VALUES('coffee-beans',4,'Sunday morning house blend','19','Freshly brewed coffee on a cafe table','https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=900&q=85',35,'','',0);
INSERT INTO "products" VALUES('linen-shirt',5,'Relaxed linen weekend shirt','68','A neatly styled neutral linen outfit','https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=900&q=85',51,'','',0);
INSERT INTO "products" VALUES('planter',6,'Little fern ceramic planter','32','A lush green houseplant in a ceramic pot','https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=900&q=85',62,'','',0);
CREATE TABLE saves (
                user_id INTEGER NOT NULL,
                product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, product_id)
            );
CREATE TABLE shops (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                category TEXT NOT NULL
            , owner_id INTEGER);
INSERT INTO "shops" VALUES(1,'Moss & Kiln',12.975,77.6,'Home goods',NULL);
INSERT INTO "shops" VALUES(2,'Common Thread Studio',12.96,77.6,'Made to carry',NULL);
INSERT INTO "shops" VALUES(3,'Little Orbit Jewelry',12.99,77.57,'Small-batch jewelry',NULL);
INSERT INTO "shops" VALUES(4,'Good Measure Coffee',12.94,77.62,'Freshly roasted',NULL);
INSERT INTO "shops" VALUES(5,'Soft Form',12.83,77.68,'Slow fashion',NULL);
INSERT INTO "shops" VALUES(6,'Moss & Kiln',13.18,77.65,'Grown with care',NULL);
CREATE TABLE workers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                seller_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                nickname TEXT NOT NULL,
                phone TEXT NOT NULL,
                salary REAL NOT NULL CHECK(salary >= 0),
                email TEXT NOT NULL,
                shift TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('employee', 'delivery', 'both')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
CREATE INDEX comments_by_product ON comments(product_id, id);
CREATE INDEX workers_by_seller ON workers(seller_id, id);
CREATE UNIQUE INDEX shops_by_owner ON shops(owner_id);
DELETE FROM "sqlite_sequence";
INSERT INTO "sqlite_sequence" VALUES('comments',6);
INSERT INTO "sqlite_sequence" VALUES('workers',3);
COMMIT;
