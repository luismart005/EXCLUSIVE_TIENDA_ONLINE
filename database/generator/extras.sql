CREATE SEQUENCE IF NOT EXISTS order_code_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS document_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS postsale_code_seq START 100;
CREATE SEQUENCE IF NOT EXISTS purchase_code_seq START 100;
CREATE SEQUENCE IF NOT EXISTS payment_ref_seq START 10000;

ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_physical_chk" CHECK ("physical" >= 0);
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_reserved_chk" CHECK ("reserved" >= 0 AND "reserved" <= "physical");
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_min_chk" CHECK ("min_stock" >= 0);
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_qty_chk" CHECK ("quantity" > 0);
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_qty_chk" CHECK ("quantity" > 0);
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_qty_chk" CHECK ("quantity" > 0 AND "unit_cost" >= 0);
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_qty_chk" CHECK ("quantity" > 0 AND "quantity" <= 20);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_qty_chk" CHECK ("quantity" > 0 AND "line_total" >= 0 AND "discount_amount" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_chk" CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "shipping_cost" >= 0 AND "total" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_refund_chk" CHECK ("amount_refunded" >= 0 AND "amount_refunded" <= "amount_paid");
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_chk" CHECK ("amount" >= 0);
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_value_chk" CHECK ("value" >= 0 AND "ends_at" > "starts_at");
ALTER TABLE "products" ADD CONSTRAINT "products_price_chk" CHECK ("base_price" >= 0);
ALTER TABLE "post_sale_items" ADD CONSTRAINT "post_sale_items_qty_chk" CHECK ("quantity" > 0 AND "received_qty" >= 0 AND "received_qty" <= "quantity");

CREATE OR REPLACE FUNCTION exclusive_immutable_row() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción: los registros no pueden modificarse ni eliminarse', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION exclusive_immutable_row();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION exclusive_immutable_row();

CREATE TRIGGER inventory_movements_no_update BEFORE UPDATE OR DELETE ON "inventory_movements"
  FOR EACH ROW EXECUTE FUNCTION exclusive_immutable_row();
CREATE TRIGGER inventory_movements_no_truncate BEFORE TRUNCATE ON "inventory_movements"
  FOR EACH STATEMENT EXECUTE FUNCTION exclusive_immutable_row();

CREATE OR REPLACE VIEW "v_stock" AS
SELECT
  v."id"          AS variant_id,
  v."sku",
  p."id"          AS product_id,
  p."name"        AS product_name,
  c."name"        AS category_name,
  s."code"        AS size_code,
  co."name"       AS color_name,
  st."physical",
  st."reserved",
  (st."physical" - st."reserved") AS available,
  st."min_stock",
  ((st."physical" - st."reserved") <= st."min_stock") AS low_stock
FROM "product_variants" v
JOIN "products" p        ON p."id" = v."product_id"
JOIN "categories" c      ON c."id" = p."category_id"
JOIN "sizes" s           ON s."id" = v."size_id"
JOIN "colors" co         ON co."id" = v."color_id"
JOIN "inventory_stock" st ON st."variant_id" = v."id";
