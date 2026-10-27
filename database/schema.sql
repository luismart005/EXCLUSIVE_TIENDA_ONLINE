SET client_encoding = 'UTF8';
SET client_min_messages = warning;
SET standard_conforming_strings = on;

BEGIN;

DROP VIEW IF EXISTS "v_stock";
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "roles" CASCADE;
DROP TABLE IF EXISTS "permissions" CASCADE;
DROP TABLE IF EXISTS "role_permissions" CASCADE;
DROP TABLE IF EXISTS "user_roles" CASCADE;
DROP TABLE IF EXISTS "addresses" CASCADE;
DROP TABLE IF EXISTS "password_resets" CASCADE;
DROP TABLE IF EXISTS "oidc_payloads" CASCADE;
DROP TABLE IF EXISTS "mailbox_messages" CASCADE;
DROP TABLE IF EXISTS "notifications" CASCADE;
DROP TABLE IF EXISTS "security_events" CASCADE;
DROP TABLE IF EXISTS "categories" CASCADE;
DROP TABLE IF EXISTS "colors" CASCADE;
DROP TABLE IF EXISTS "sizes" CASCADE;
DROP TABLE IF EXISTS "size_guides" CASCADE;
DROP TABLE IF EXISTS "products" CASCADE;
DROP TABLE IF EXISTS "product_images" CASCADE;
DROP TABLE IF EXISTS "product_variants" CASCADE;
DROP TABLE IF EXISTS "store_settings" CASCADE;
DROP TABLE IF EXISTS "policies" CASCADE;
DROP TABLE IF EXISTS "inventory_stock" CASCADE;
DROP TABLE IF EXISTS "inventory_movements" CASCADE;
DROP TABLE IF EXISTS "reservations" CASCADE;
DROP TABLE IF EXISTS "suppliers" CASCADE;
DROP TABLE IF EXISTS "purchases" CASCADE;
DROP TABLE IF EXISTS "purchase_items" CASCADE;
DROP TABLE IF EXISTS "carts" CASCADE;
DROP TABLE IF EXISTS "cart_items" CASCADE;
DROP TABLE IF EXISTS "promotions" CASCADE;
DROP TABLE IF EXISTS "coupons" CASCADE;
DROP TABLE IF EXISTS "coupon_redemptions" CASCADE;
DROP TABLE IF EXISTS "shipping_zones" CASCADE;
DROP TABLE IF EXISTS "carriers" CASCADE;
DROP TABLE IF EXISTS "orders" CASCADE;
DROP TABLE IF EXISTS "order_items" CASCADE;
DROP TABLE IF EXISTS "order_status_history" CASCADE;
DROP TABLE IF EXISTS "payments" CASCADE;
DROP TABLE IF EXISTS "refunds" CASCADE;
DROP TABLE IF EXISTS "sale_documents" CASCADE;
DROP TABLE IF EXISTS "shipments" CASCADE;
DROP TABLE IF EXISTS "shipment_events" CASCADE;
DROP TABLE IF EXISTS "post_sale_requests" CASCADE;
DROP TABLE IF EXISTS "post_sale_items" CASCADE;
DROP TABLE IF EXISTS "post_sale_history" CASCADE;
DROP TABLE IF EXISTS "sales_weekly_history" CASCADE;
DROP TABLE IF EXISTS "ml_models" CASCADE;
DROP TABLE IF EXISTS "ml_forecasts" CASCADE;
DROP TABLE IF EXISTS "audit_logs" CASCADE;
DROP TABLE IF EXISTS "error_logs" CASCADE;
DROP TABLE IF EXISTS "_prisma_migrations" CASCADE;
DROP TYPE IF EXISTS "UserStatus" CASCADE;
DROP TYPE IF EXISTS "ProductStatus" CASCADE;
DROP TYPE IF EXISTS "Gender" CASCADE;
DROP TYPE IF EXISTS "MovementType" CASCADE;
DROP TYPE IF EXISTS "MovementDirection" CASCADE;
DROP TYPE IF EXISTS "ReservationStatus" CASCADE;
DROP TYPE IF EXISTS "PurchaseStatus" CASCADE;
DROP TYPE IF EXISTS "PromotionType" CASCADE;
DROP TYPE IF EXISTS "PromotionScope" CASCADE;
DROP TYPE IF EXISTS "OrderStatus" CASCADE;
DROP TYPE IF EXISTS "PaymentStatus" CASCADE;
DROP TYPE IF EXISTS "ShippingStatus" CASCADE;
DROP TYPE IF EXISTS "PaymentMethod" CASCADE;
DROP TYPE IF EXISTS "PaymentAttemptStatus" CASCADE;
DROP TYPE IF EXISTS "StatusKind" CASCADE;
DROP TYPE IF EXISTS "PostSaleType" CASCADE;
DROP TYPE IF EXISTS "PostSaleStatus" CASCADE;
DROP TYPE IF EXISTS "ItemCondition" CASCADE;
DROP TYPE IF EXISTS "ModelStatus" CASCADE;
DROP SEQUENCE IF EXISTS order_code_seq, document_number_seq, postsale_code_seq, purchase_code_seq, payment_ref_seq;
DROP FUNCTION IF EXISTS exclusive_immutable_row() CASCADE;

CREATE TYPE "UserStatus" AS ENUM ('ACTIVO', 'INACTIVO', 'BLOQUEADO');

CREATE TYPE "ProductStatus" AS ENUM ('BORRADOR', 'ACTIVO', 'INACTIVO');

CREATE TYPE "Gender" AS ENUM ('MUJER', 'HOMBRE', 'UNISEX');

CREATE TYPE "MovementType" AS ENUM ('INVENTARIO_INICIAL', 'ENTRADA_COMPRA', 'ENTRADA_DEVOLUCION', 'ENTRADA_AJUSTE', 'SALIDA_VENTA', 'SALIDA_CAMBIO', 'SALIDA_DEVOLUCION_PROVEEDOR', 'SALIDA_DANIO', 'SALIDA_PERDIDA', 'SALIDA_AJUSTE');

CREATE TYPE "MovementDirection" AS ENUM ('ENTRADA', 'SALIDA');

CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVA', 'CONFIRMADA', 'LIBERADA', 'CONSUMIDA');

CREATE TYPE "PurchaseStatus" AS ENUM ('REGISTRADA', 'ANULADA');

CREATE TYPE "PromotionType" AS ENUM ('PORCENTAJE', 'MONTO_FIJO', 'ENVIO_GRATIS');

CREATE TYPE "PromotionScope" AS ENUM ('TODO', 'CATEGORIA', 'PRODUCTO');

CREATE TYPE "OrderStatus" AS ENUM ('PENDIENTE_PAGO', 'CONFIRMADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO', 'CANCELADO');

CREATE TYPE "PaymentStatus" AS ENUM ('PENDIENTE', 'EN_REVISION', 'APROBADO', 'RECHAZADO', 'REEMBOLSO_PARCIAL', 'REEMBOLSADO');

CREATE TYPE "ShippingStatus" AS ENUM ('PENDIENTE', 'PREPARANDO', 'DESPACHADO', 'EN_TRANSITO', 'ENTREGADO', 'INCIDENCIA', 'DEVUELTO');

CREATE TYPE "PaymentMethod" AS ENUM ('TARJETA', 'TRANSFERENCIA', 'CONTRA_ENTREGA');

CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDIENTE', 'EN_REVISION', 'APROBADO', 'RECHAZADO');

CREATE TYPE "StatusKind" AS ENUM ('PEDIDO', 'PAGO', 'ENVIO');

CREATE TYPE "PostSaleType" AS ENUM ('CAMBIO', 'DEVOLUCION', 'RECLAMO');

CREATE TYPE "PostSaleStatus" AS ENUM ('SOLICITADA', 'EN_REVISION', 'APROBADA', 'RECHAZADA', 'PRENDA_RECIBIDA', 'RESUELTA', 'CERRADA');

CREATE TYPE "ItemCondition" AS ENUM ('BUENA', 'DANADA');

CREATE TYPE "ModelStatus" AS ENUM ('ENTRENANDO', 'LISTO', 'FALLIDO');

CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "password_hash" VARCHAR(100) NOT NULL,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(20),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVO',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "session_version" INTEGER NOT NULL DEFAULT 1,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(255),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_staff" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "module" VARCHAR(40) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE "user_roles" (
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

CREATE TABLE "addresses" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "recipient_name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "department" VARCHAR(40) NOT NULL,
    "municipality" VARCHAR(80) NOT NULL,
    "line1" VARCHAR(200) NOT NULL,
    "reference" VARCHAR(200),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_resets" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "request_ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "oidc_payloads" (
    "id" VARCHAR(255) NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL,
    "grant_id" VARCHAR(255),
    "user_code" VARCHAR(255),
    "uid" VARCHAR(255),
    "account_id" VARCHAR(64),
    "expires_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),

    CONSTRAINT "oidc_payloads_pkey" PRIMARY KEY ("id","type")
);

CREATE TABLE "mailbox_messages" (
    "id" SERIAL NOT NULL,
    "to_email" VARCHAR(160) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT,
    "category" VARCHAR(40) NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mailbox_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "link" VARCHAR(200),
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "security_events" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "email" VARCHAR(160),
    "user_id" INTEGER,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(255),
    "details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(90) NOT NULL,
    "description" VARCHAR(400),
    "image_url" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "colors" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "hex" VARCHAR(7) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "colors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sizes" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sizes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "size_guides" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "unit" VARCHAR(10) NOT NULL DEFAULT 'cm',
    "columns" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "notes" VARCHAR(400),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "size_guides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "description" TEXT NOT NULL,
    "category_id" INTEGER NOT NULL,
    "size_guide_id" INTEGER,
    "base_price" DECIMAL(12,2) NOT NULL,
    "compare_at_price" DECIMAL(12,2),
    "material" VARCHAR(200),
    "care" VARCHAR(400),
    "gender" "Gender" NOT NULL DEFAULT 'UNISEX',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVO',
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_images" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "color_id" INTEGER,
    "url" VARCHAR(255) NOT NULL,
    "thumb_url" VARCHAR(255) NOT NULL,
    "alt" VARCHAR(160),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_variants" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "size_id" INTEGER NOT NULL,
    "color_id" INTEGER NOT NULL,
    "sku" VARCHAR(40) NOT NULL,
    "price" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_settings" (
    "key" VARCHAR(60) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "policies" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_stock" (
    "variant_id" INTEGER NOT NULL,
    "physical" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 3,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_stock_pkey" PRIMARY KEY ("variant_id")
);

CREATE TABLE "inventory_movements" (
    "id" SERIAL NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "type" "MovementType" NOT NULL,
    "direction" "MovementDirection" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "physical_before" INTEGER NOT NULL,
    "physical_after" INTEGER NOT NULL,
    "reserved_before" INTEGER NOT NULL,
    "reserved_after" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2),
    "reason" VARCHAR(255) NOT NULL,
    "reference_type" VARCHAR(30),
    "reference_id" INTEGER,
    "reference_code" VARCHAR(40),
    "document_ref" VARCHAR(80),
    "supplier_id" INTEGER,
    "corrects_id" INTEGER,
    "idempotency_key" VARCHAR(120),
    "user_id" INTEGER,
    "user_email" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reservations" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVA',
    "expires_at" TIMESTAMPTZ(3),
    "release_reason" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "nit" VARCHAR(20),
    "contact" VARCHAR(120),
    "phone" VARCHAR(20),
    "email" VARCHAR(160),
    "address" VARCHAR(200),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchases" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "document_number" VARCHAR(60) NOT NULL,
    "purchase_date" DATE NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'REGISTRADA',
    "total" DECIMAL(12,2) NOT NULL,
    "notes" VARCHAR(400),
    "idempotency_key" VARCHAR(120),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_items" (
    "id" SERIAL NOT NULL,
    "purchase_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "carts" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cart_items" (
    "id" SERIAL NOT NULL,
    "cart_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "promotions" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(400),
    "type" "PromotionType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "scope" "PromotionScope" NOT NULL DEFAULT 'TODO',
    "category_id" INTEGER,
    "product_id" INTEGER,
    "min_subtotal" DECIMAL(12,2),
    "max_discount" DECIMAL(12,2),
    "requires_coupon" BOOLEAN NOT NULL DEFAULT false,
    "combinable" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coupons" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "promotion_id" INTEGER NOT NULL,
    "usage_limit" INTEGER,
    "per_customer_limit" INTEGER NOT NULL DEFAULT 1,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coupon_redemptions" (
    "id" SERIAL NOT NULL,
    "coupon_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reversed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipping_zones" (
    "id" SERIAL NOT NULL,
    "department" VARCHAR(40) NOT NULL,
    "covered" BOOLEAN NOT NULL DEFAULT true,
    "rate" DECIMAL(12,2) NOT NULL,
    "estimated_days" VARCHAR(30) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_zones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "carriers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(20),
    "prefix" VARCHAR(6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(80) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDIENTE_PAGO',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDIENTE',
    "shipping_status" "ShippingStatus" NOT NULL DEFAULT 'PENDIENTE',
    "payment_method" "PaymentMethod" NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shipping_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shipping_discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount_refunded" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'GTQ',
    "coupon_code" VARCHAR(40),
    "shipping_zone_id" INTEGER,
    "address_snapshot" JSONB NOT NULL,
    "pricing_snapshot" JSONB,
    "terms_version" INTEGER NOT NULL,
    "customer_note" VARCHAR(400),
    "reservation_expires_at" TIMESTAMPTZ(3),
    "cancel_reason" VARCHAR(255),
    "cancelled_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "is_simulation" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "sku" VARCHAR(40) NOT NULL,
    "product_name" VARCHAR(120) NOT NULL,
    "size_name" VARCHAR(20) NOT NULL,
    "color_name" VARCHAR(40) NOT NULL,
    "image_url" VARCHAR(255),
    "unit_price" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "promotion_name" VARCHAR(120),

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_status_history" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "kind" "StatusKind" NOT NULL,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30) NOT NULL,
    "note" VARCHAR(400),
    "user_id" INTEGER,
    "user_email" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "card_brand" VARCHAR(20),
    "card_last4" VARCHAR(4),
    "receipt_path" VARCHAR(255),
    "receipt_mime" VARCHAR(60),
    "response_message" VARCHAR(255),
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" VARCHAR(400),
    "idempotency_key" VARCHAR(120),
    "is_simulation" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refunds" (
    "id" SERIAL NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "post_sale_request_id" INTEGER,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "idempotency_key" VARCHAR(120),
    "is_simulation" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_documents" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "type" VARCHAR(30) NOT NULL DEFAULT 'COMPROBANTE_SIMULADO',
    "total" DECIMAL(12,2) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipments" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "carrier_id" INTEGER,
    "tracking_number" VARCHAR(40),
    "status" "ShippingStatus" NOT NULL DEFAULT 'PENDIENTE',
    "dispatched_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "received_by" VARCHAR(120),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipment_events" (
    "id" SERIAL NOT NULL,
    "shipment_id" INTEGER NOT NULL,
    "status" "ShippingStatus" NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "location" VARCHAR(120),
    "is_incident" BOOLEAN NOT NULL DEFAULT false,
    "user_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "post_sale_requests" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "order_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "type" "PostSaleType" NOT NULL,
    "status" "PostSaleStatus" NOT NULL DEFAULT 'SOLICITADA',
    "reason" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "desired_variant_id" INTEGER,
    "resolution" VARCHAR(1000),
    "assigned_to" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "post_sale_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "post_sale_items" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "order_item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "received_qty" INTEGER NOT NULL DEFAULT 0,
    "condition" "ItemCondition",
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "inspected_at" TIMESTAMPTZ(3),
    "inspected_by" INTEGER,
    "notes" VARCHAR(400),

    CONSTRAINT "post_sale_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "post_sale_history" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30) NOT NULL,
    "note" VARCHAR(400),
    "user_id" INTEGER,
    "user_email" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_sale_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_weekly_history" (
    "category_id" INTEGER NOT NULL,
    "week_start" DATE NOT NULL,
    "units_sold" INTEGER NOT NULL DEFAULT 0,
    "units_cancelled" INTEGER NOT NULL DEFAULT 0,
    "units_returned" INTEGER NOT NULL DEFAULT 0,
    "net_units" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "stockout_variants" INTEGER NOT NULL DEFAULT 0,
    "refreshed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_weekly_history_pkey" PRIMARY KEY ("category_id","week_start")
);

CREATE TABLE "ml_models" (
    "id" SERIAL NOT NULL,
    "version" VARCHAR(30) NOT NULL,
    "algorithm" VARCHAR(120) NOT NULL,
    "status" "ModelStatus" NOT NULL DEFAULT 'ENTRENANDO',
    "features" JSONB NOT NULL,
    "train_from" DATE,
    "train_to" DATE,
    "test_from" DATE,
    "test_to" DATE,
    "metrics" JSONB,
    "params" JSONB,
    "artifacts" JSONB,
    "data_note" VARCHAR(400),
    "error" VARCHAR(400),
    "trained_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "ml_models_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ml_forecasts" (
    "id" SERIAL NOT NULL,
    "model_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "week_start" DATE NOT NULL,
    "predicted_units" DECIMAL(10,2) NOT NULL,
    "baseline_units" DECIMAL(10,2),
    "sufficient" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_forecasts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "service" VARCHAR(30) NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "entity" VARCHAR(40) NOT NULL,
    "entity_id" VARCHAR(60),
    "user_id" INTEGER,
    "user_email" VARCHAR(160),
    "before" JSONB,
    "after" JSONB,
    "ip" VARCHAR(64),
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "error_logs" (
    "id" SERIAL NOT NULL,
    "error_id" VARCHAR(20) NOT NULL,
    "service" VARCHAR(30) NOT NULL,
    "method" VARCHAR(10),
    "path" VARCHAR(255),
    "status" INTEGER NOT NULL DEFAULT 500,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "request_id" VARCHAR(64),
    "user_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE INDEX "users_status_idx" ON "users"("status");

CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

CREATE INDEX "addresses_user_id_idx" ON "addresses"("user_id");

CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

CREATE INDEX "oidc_payloads_grant_id_idx" ON "oidc_payloads"("grant_id");

CREATE INDEX "oidc_payloads_uid_idx" ON "oidc_payloads"("uid");

CREATE INDEX "oidc_payloads_account_id_idx" ON "oidc_payloads"("account_id");

CREATE INDEX "oidc_payloads_expires_at_idx" ON "oidc_payloads"("expires_at");

CREATE INDEX "mailbox_messages_to_email_idx" ON "mailbox_messages"("to_email");

CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

CREATE INDEX "security_events_type_created_at_idx" ON "security_events"("type", "created_at");

CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

CREATE UNIQUE INDEX "colors_name_key" ON "colors"("name");

CREATE UNIQUE INDEX "sizes_code_key" ON "sizes"("code");

CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

CREATE INDEX "products_category_id_idx" ON "products"("category_id");

CREATE INDEX "products_status_idx" ON "products"("status");

CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");

CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

CREATE UNIQUE INDEX "product_variants_product_id_size_id_color_id_key" ON "product_variants"("product_id", "size_id", "color_id");

CREATE UNIQUE INDEX "policies_slug_version_key" ON "policies"("slug", "version");

CREATE UNIQUE INDEX "inventory_movements_idempotency_key_key" ON "inventory_movements"("idempotency_key");

CREATE INDEX "inventory_movements_variant_id_created_at_idx" ON "inventory_movements"("variant_id", "created_at");

CREATE INDEX "inventory_movements_reference_type_reference_id_idx" ON "inventory_movements"("reference_type", "reference_id");

CREATE INDEX "inventory_movements_type_idx" ON "inventory_movements"("type");

CREATE INDEX "inventory_movements_created_at_idx" ON "inventory_movements"("created_at");

CREATE INDEX "reservations_status_expires_at_idx" ON "reservations"("status", "expires_at");

CREATE UNIQUE INDEX "reservations_order_id_variant_id_key" ON "reservations"("order_id", "variant_id");

CREATE UNIQUE INDEX "purchases_code_key" ON "purchases"("code");

CREATE UNIQUE INDEX "purchases_idempotency_key_key" ON "purchases"("idempotency_key");

CREATE INDEX "purchases_supplier_id_idx" ON "purchases"("supplier_id");

CREATE INDEX "purchases_purchase_date_idx" ON "purchases"("purchase_date");

CREATE INDEX "purchase_items_variant_id_idx" ON "purchase_items"("variant_id");

CREATE UNIQUE INDEX "carts_customer_id_key" ON "carts"("customer_id");

CREATE UNIQUE INDEX "cart_items_cart_id_variant_id_key" ON "cart_items"("cart_id", "variant_id");

CREATE INDEX "promotions_active_starts_at_ends_at_idx" ON "promotions"("active", "starts_at", "ends_at");

CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

CREATE UNIQUE INDEX "coupon_redemptions_order_id_key" ON "coupon_redemptions"("order_id");

CREATE INDEX "coupon_redemptions_coupon_id_customer_id_idx" ON "coupon_redemptions"("coupon_id", "customer_id");

CREATE UNIQUE INDEX "shipping_zones_department_key" ON "shipping_zones"("department");

CREATE UNIQUE INDEX "carriers_name_key" ON "carriers"("name");

CREATE UNIQUE INDEX "orders_code_key" ON "orders"("code");

CREATE INDEX "orders_status_idx" ON "orders"("status");

CREATE INDEX "orders_payment_status_idx" ON "orders"("payment_status");

CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

CREATE UNIQUE INDEX "orders_customer_id_idempotency_key_key" ON "orders"("customer_id", "idempotency_key");

CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");

CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

CREATE INDEX "payments_status_idx" ON "payments"("status");

CREATE UNIQUE INDEX "refunds_reference_key" ON "refunds"("reference");

CREATE UNIQUE INDEX "refunds_idempotency_key_key" ON "refunds"("idempotency_key");

CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

CREATE UNIQUE INDEX "sale_documents_number_key" ON "sale_documents"("number");

CREATE INDEX "sale_documents_order_id_idx" ON "sale_documents"("order_id");

CREATE UNIQUE INDEX "shipments_order_id_key" ON "shipments"("order_id");

CREATE UNIQUE INDEX "shipments_tracking_number_key" ON "shipments"("tracking_number");

CREATE INDEX "shipment_events_shipment_id_created_at_idx" ON "shipment_events"("shipment_id", "created_at");

CREATE UNIQUE INDEX "post_sale_requests_code_key" ON "post_sale_requests"("code");

CREATE INDEX "post_sale_requests_order_id_idx" ON "post_sale_requests"("order_id");

CREATE INDEX "post_sale_requests_status_idx" ON "post_sale_requests"("status");

CREATE INDEX "post_sale_items_request_id_idx" ON "post_sale_items"("request_id");

CREATE INDEX "post_sale_history_request_id_idx" ON "post_sale_history"("request_id");

CREATE UNIQUE INDEX "ml_models_version_key" ON "ml_models"("version");

CREATE UNIQUE INDEX "ml_forecasts_model_id_category_id_week_start_key" ON "ml_forecasts"("model_id", "category_id", "week_start");

CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

CREATE UNIQUE INDEX "error_logs_error_id_key" ON "error_logs"("error_id");

CREATE INDEX "error_logs_created_at_idx" ON "error_logs"("created_at");

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products" ADD CONSTRAINT "products_size_guide_id_fkey" FOREIGN KEY ("size_guide_id") REFERENCES "size_guides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_images" ADD CONSTRAINT "product_images_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "colors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "colors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_corrects_id_fkey" FOREIGN KEY ("corrects_id") REFERENCES "inventory_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "promotions" ADD CONSTRAINT "promotions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "promotions" ADD CONSTRAINT "promotions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_zone_id_fkey" FOREIGN KEY ("shipping_zone_id") REFERENCES "shipping_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_post_sale_request_id_fkey" FOREIGN KEY ("post_sale_request_id") REFERENCES "post_sale_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_documents" ADD CONSTRAINT "sale_documents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "carriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_sale_requests" ADD CONSTRAINT "post_sale_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "post_sale_requests" ADD CONSTRAINT "post_sale_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "post_sale_items" ADD CONSTRAINT "post_sale_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "post_sale_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_sale_items" ADD CONSTRAINT "post_sale_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "post_sale_history" ADD CONSTRAINT "post_sale_history_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "post_sale_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_weekly_history" ADD CONSTRAINT "sales_weekly_history_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ml_forecasts" ADD CONSTRAINT "ml_forecasts_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ml_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ml_forecasts" ADD CONSTRAINT "ml_forecasts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

CREATE TABLE "_prisma_migrations" (
    "id"                    VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum"              VARCHAR(64) NOT NULL,
    "finished_at"           TIMESTAMPTZ,
    "migration_name"        VARCHAR(255) NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        TIMESTAMPTZ,
    "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
VALUES ('a5828c96-5e71-4251-8e9b-9793ff7ffef1', '27efa944e4ab5b0be0c0394361530f13c977a6f217ea4badc5408bbac37f2434', now(), '0_init', now(), 1);

INSERT INTO "roles" ("id", "code", "name", "description", "is_system", "is_staff", "created_at") VALUES
(1, 'ADMIN', 'Administrador', 'Acceso completo a la operación, configuración, permisos y auditoría.', true, true, '2025-10-01T15:00:00.000Z'),
(2, 'VENTAS', 'Encargado de ventas', 'Revisa pagos, prepara pedidos y registra despachos y entregas.', true, true, '2025-10-01T15:00:00.000Z'),
(3, 'INVENTARIO', 'Encargado de inventario', 'Mantiene el catálogo, registra entradas, salidas y ajustes, y consulta el kardex.', true, true, '2025-10-01T15:00:00.000Z'),
(4, 'ATENCION', 'Atención al cliente', 'Atiende cambios, devoluciones, reclamos y reembolsos.', true, true, '2025-10-01T15:00:00.000Z'),
(5, 'GERENCIA', 'Gerencia', 'Consulta reportes, estimaciones de IA y auditoría para tomar decisiones.', true, true, '2025-10-01T15:00:00.000Z'),
(6, 'CLIENTE', 'Cliente', 'Compra en la tienda y consulta únicamente su información.', true, false, '2025-10-01T15:00:00.000Z');

INSERT INTO "permissions" ("id", "code", "name", "module") VALUES
(1, 'dashboard.view', 'Ver el panel administrativo', 'Panel'),
(2, 'users.read', 'Consultar usuarios', 'Usuarios'),
(3, 'users.manage', 'Crear, editar y desactivar usuarios', 'Usuarios'),
(4, 'roles.manage', 'Asignar roles y permisos', 'Usuarios'),
(5, 'catalog.read', 'Consultar el catálogo administrativo', 'Catálogo'),
(6, 'catalog.manage', 'Gestionar productos, categorías, variantes e imágenes', 'Catálogo'),
(7, 'inventory.read', 'Consultar existencias y kardex', 'Inventario'),
(8, 'inventory.move', 'Registrar entradas, salidas y ajustes', 'Inventario'),
(9, 'suppliers.manage', 'Gestionar proveedores y compras', 'Inventario'),
(10, 'promotions.manage', 'Gestionar promociones y cupones', 'Descuentos'),
(11, 'orders.read', 'Consultar pedidos', 'Pedidos'),
(12, 'orders.manage', 'Cambiar estados y cancelar pedidos', 'Pedidos'),
(13, 'payments.review', 'Revisar pagos y comprobantes de transferencia', 'Pagos'),
(14, 'shipping.manage', 'Registrar despachos, entregas e incidencias', 'Entregas'),
(15, 'shipping.config', 'Configurar cobertura, tarifas y transportistas', 'Entregas'),
(16, 'postsale.read', 'Consultar cambios, devoluciones y reclamos', 'Posventa'),
(17, 'postsale.manage', 'Gestionar cambios, devoluciones y reclamos', 'Posventa'),
(18, 'refunds.create', 'Registrar reembolsos simulados', 'Posventa'),
(19, 'reports.read', 'Consultar reportes y gráficas', 'Reportes'),
(20, 'reports.export', 'Exportar reportes y movimientos a CSV', 'Reportes'),
(21, 'ai.read', 'Consultar estimaciones de demanda', 'Inteligencia artificial'),
(22, 'ai.train', 'Entrenar y evaluar el modelo de predicción', 'Inteligencia artificial'),
(23, 'audit.read', 'Consultar la bitácora de auditoría', 'Auditoría'),
(24, 'settings.manage', 'Configurar datos de la tienda y políticas', 'Configuración'),
(25, 'system.health', 'Ver el estado de los microservicios', 'Sistema'),
(26, 'mailbox.read', 'Consultar el buzón de pruebas', 'Sistema');

INSERT INTO "role_permissions" ("role_id", "permission_id") VALUES
(1, 1),
(1, 2),
(1, 3),
(1, 4),
(1, 5),
(1, 6),
(1, 7),
(1, 8),
(1, 9),
(1, 10),
(1, 11),
(1, 12),
(1, 13),
(1, 14),
(1, 15),
(1, 16),
(1, 17),
(1, 18),
(1, 19),
(1, 20),
(1, 21),
(1, 22),
(1, 23),
(1, 24),
(1, 25),
(1, 26),
(2, 1),
(2, 5),
(2, 7),
(2, 11),
(2, 12),
(2, 13),
(2, 14),
(2, 16),
(2, 19),
(3, 1),
(3, 5),
(3, 6),
(3, 7),
(3, 8),
(3, 9),
(3, 19),
(3, 20),
(3, 21),
(4, 1),
(4, 5),
(4, 11),
(4, 16),
(4, 17),
(4, 18),
(4, 26),
(5, 1),
(5, 5),
(5, 7),
(5, 11),
(5, 19),
(5, 20),
(5, 21),
(5, 22),
(5, 23),
(5, 16);

INSERT INTO "colors" ("id", "name", "hex", "sort_order", "active") VALUES
(1, 'Negro', '#1F2328', 1, true),
(2, 'Blanco', '#F5F5F2', 2, true),
(3, 'Gris jaspe', '#9AA0A6', 3, true),
(4, 'Azul marino', '#1F3A5F', 4, true),
(5, 'Celeste', '#8DB6D9', 5, true),
(6, 'Verde jade', '#0E6B58', 6, true),
(7, 'Oliva', '#6B7041', 7, true),
(8, 'Arena', '#D8C3A5', 8, true),
(9, 'Café', '#7A5236', 9, true),
(10, 'Rojo grana', '#9E1B32', 10, true),
(11, 'Rosa palo', '#E8B4B8', 11, true),
(12, 'Mostaza', '#C99A2E', 12, true),
(13, 'Lila', '#A08CC8', 13, true),
(14, 'Denim', '#3D5A80', 14, true),
(15, 'Crudo', '#F2E6D8', 15, true);

INSERT INTO "sizes" ("id", "code", "name", "sort_order", "active") VALUES
(1, 'XS', 'Extra pequeña', 1, true),
(2, 'S', 'Pequeña', 2, true),
(3, 'M', 'Mediana', 3, true),
(4, 'L', 'Grande', 4, true),
(5, 'XL', 'Extra grande', 5, true);

INSERT INTO "size_guides" ("id", "name", "unit", "columns", "rows", "notes", "created_at") VALUES
(1, 'Prendas superiores', 'cm', '["Talla","Pecho","Largo","Manga"]', '[["XS","84–88","66","58"],["S","89–94","69","60"],["M","95–100","72","62"],["L","101–107","74","64"],["XL","108–114","76","66"]]', 'Mide el contorno de pecho por la parte más amplia, con la cinta métrica horizontal.', '2025-10-01T15:00:00.000Z'),
(2, 'Prendas inferiores', 'cm', '["Talla","Cintura","Cadera","Largo"]', '[["XS","62–66","86–90","98"],["S","67–72","91–96","100"],["M","73–79","97–102","102"],["L","80–86","103–108","104"],["XL","87–94","109–115","106"]]', 'La cintura se mide a la altura del ombligo; la cadera, por la parte más amplia.', '2025-10-01T15:00:00.000Z'),
(3, 'Vestidos', 'cm', '["Talla","Pecho","Cintura","Cadera","Largo"]', '[["XS","80–84","62–66","86–90","104"],["S","85–89","67–71","91–95","106"],["M","90–95","72–77","96–101","108"],["L","96–102","78–84","102–108","110"],["XL","103–110","85–92","109–116","112"]]', 'El largo se mide desde el punto más alto del hombro hasta el ruedo.', '2025-10-01T15:00:00.000Z');

INSERT INTO "categories" ("id", "name", "slug", "description", "image_url", "sort_order", "active", "created_at", "updated_at") VALUES
(1, 'Camisetas', 'camisetas', 'Algodón suave para el día a día: básicas, oversize y manga larga.', '/uploads/products/cat-camisetas.webp', 1, true, '2025-10-01T15:00:00.000Z', '2025-10-01T15:00:00.000Z'),
(2, 'Camisas y blusas', 'camisas-y-blusas', 'Oxford, lino y satín para la oficina o una cena.', '/uploads/products/cat-camisas-y-blusas.webp', 2, true, '2025-10-01T15:00:00.000Z', '2025-10-01T15:00:00.000Z'),
(3, 'Pantalones', 'pantalones', 'Chinos, cargo, palazzo y jeans con cortes que se mantienen.', '/uploads/products/cat-pantalones.webp', 3, true, '2025-10-01T15:00:00.000Z', '2025-10-01T15:00:00.000Z'),
(4, 'Vestidos', 'vestidos', 'Midi, camiseros y cruzados para todo el año.', '/uploads/products/cat-vestidos.webp', 4, true, '2025-10-01T15:00:00.000Z', '2025-10-01T15:00:00.000Z'),
(5, 'Faldas', 'faldas', 'Plisadas, lápiz y de mezclilla.', '/uploads/products/cat-faldas.webp', 5, true, '2025-10-01T15:00:00.000Z', '2025-10-01T15:00:00.000Z'),
(6, 'Chaquetas', 'chaquetas', 'Capas ligeras para las mañanas frías y las tardes de lluvia.', '/uploads/products/cat-chaquetas.webp', 6, true, '2025-10-01T15:00:00.000Z', '2025-10-01T15:00:00.000Z'),
(7, 'Sudaderas', 'sudaderas', 'French terry y felpa con capucha, cremallera o cuello redondo.', '/uploads/products/cat-sudaderas.webp', 7, true, '2025-10-01T15:00:00.000Z', '2025-10-01T15:00:00.000Z'),
(8, 'Shorts', 'shorts', 'Chinos, deportivos y de mezclilla para el calor.', '/uploads/products/cat-shorts.webp', 8, true, '2025-10-01T15:00:00.000Z', '2025-10-01T15:00:00.000Z');

INSERT INTO "store_settings" ("key", "value", "updated_by", "updated_at") VALUES
('store_info', '{"name":"Exclusive","legalName":"Exclusive Moda (empresa ficticia para fines académicos)","nit":"CF — demostración","address":"6a. avenida 10-25, zona 1, Retalhuleu","phone":"+502 7700 0000","email":"hola@exclusive.gt","whatsapp":"+502 5500 0000","hours":"Lunes a sábado, 9:00 a 18:00","sellerInfo":"Vendedor: Exclusive Moda. Datos de demostración, sin operación comercial real."}', 1, '2025-10-01T15:00:00.000Z'),
('commerce', '{"currency":"GTQ","reservationMinutesCard":30,"reservationHoursTransfer":48,"maxQtyPerItem":10,"returnDays":30,"lowStockDefault":3,"rounding":"Mitad hacia arriba, al centavo, por línea"}', 1, '2025-10-01T15:00:00.000Z'),
('bank_transfer', '{"accounts":[{"bank":"Banco de Demostración, S.A.","type":"Monetaria","number":"000-000000-0","holder":"Exclusive Moda (cuenta simulada)"}],"instructions":"Realiza la transferencia por el total exacto y sube la captura del comprobante. El pago se confirma solo después de la revisión."}', 1, '2025-10-01T15:00:00.000Z'),
('security', '{"maxFailedLogins":5,"lockMinutes":15,"resetTokenMinutes":30}', 1, '2025-10-01T15:00:00.000Z'),
('simulation', '{"banner":"Entorno académico: pagos, facturación y envíos simulados. Ningún documento tiene validez fiscal.","testCards":[{"number":"4242 4242 4242 4242","result":"Aprobado"},{"number":"4000 0000 0000 0002","result":"Rechazado (fondos insuficientes)"},{"number":"4000 0000 0000 9995","result":"Pendiente de confirmación"}]}', 1, '2025-10-01T15:00:00.000Z');

INSERT INTO "policies" ("id", "slug", "title", "content", "version", "is_current", "published_at", "created_by") VALUES
(1, 'terminos', 'Términos y condiciones de compra', 'Versión anterior conservada para trazabilidad de pedidos antiguos.

Al confirmar un pedido aceptas que los precios se expresan en quetzales e incluyen IVA. Las existencias se reservan al confirmar el pedido.', 1, false, '2025-10-01T15:00:00.000Z', 1),
(2, 'terminos', 'Términos y condiciones de compra', '## 1. Alcance
Estos términos regulan las compras realizadas en Exclusive. Al confirmar un pedido aceptas la versión vigente, que queda registrada en tu pedido.

## 2. Precios y disponibilidad
Los precios se expresan en quetzales (GTQ) e incluyen IVA. El total, los descuentos y el envío se calculan en nuestro servidor al confirmar. Agregar un producto al carrito no lo reserva: las existencias se reservan al confirmar el pedido y la reserva vence si el pago no se completa en el plazo indicado.

## 3. Pagos
Aceptamos tarjeta, transferencia bancaria y pago contra entrega. Un comprobante de transferencia no confirma por sí solo el pago: se valida antes de preparar el pedido.

## 4. Entregas
El tiempo de entrega depende del departamento de destino. Te notificaremos el número de guía al despachar.

## 5. Cambios y devoluciones
Tienes 30 días a partir de la entrega para solicitar un cambio o devolución, según la política correspondiente.

## 6. Entorno académico
Este sitio es un proyecto académico. Los pagos, la facturación y los envíos son simulados y ningún documento tiene validez fiscal.', 2, true, '2026-03-01T15:00:00.000Z', 1),
(3, 'privacidad', 'Política de privacidad', '## Datos que recopilamos
Nombre, correo, teléfono y direcciones de entrega, necesarios para procesar tus pedidos.

## Uso
Usamos tus datos solo para gestionar compras, entregas y atención posventa. No vendemos ni compartimos tu información con terceros con fines publicitarios.

## Seguridad
Las contraseñas se almacenan cifradas con un algoritmo de hash y sal individual. El acceso a datos personales y comprobantes está restringido por roles.

## Tus derechos
Puedes actualizar tus datos desde "Mi cuenta" o solicitar su eliminación escribiendo a hola@exclusive.gt.', 1, true, '2026-03-01T15:00:00.000Z', 1),
(4, 'cambios-y-devoluciones', 'Cambios y devoluciones', '## Plazo
30 días desde la entrega.

## Condiciones
La prenda debe estar sin uso, con etiquetas y en su empaque. Revisamos cada prenda al recibirla antes de reintegrarla al inventario.

## Proceso
1. Solicita el cambio o la devolución desde el detalle de tu pedido.
2. Atención al cliente revisa la solicitud.
3. Entregas la prenda y la revisamos.
4. Realizamos el cambio o el reembolso.

## Reembolsos
El reembolso nunca supera lo pagado y se registra por separado de la recepción de la prenda.', 1, true, '2026-03-01T15:00:00.000Z', 1),
(5, 'envios', 'Política de envíos', 'Realizamos envíos a los departamentos con cobertura. La tarifa y el tiempo estimado dependen del destino y se muestran antes de confirmar la compra. Envío gratis en compras desde Q 600.00 en productos.', 1, true, '2026-03-01T15:00:00.000Z', 1),
(6, 'reclamos', 'Atención de reclamos', 'Puedes presentar un reclamo desde el detalle de tu pedido y daremos seguimiento a su estado.

Este formulario interno no sustituye a los medios oficiales: también puedes acudir a la Dirección de Atención y Asistencia al Consumidor (DIACO).', 1, true, '2026-03-01T15:00:00.000Z', 1);

INSERT INTO "shipping_zones" ("id", "department", "covered", "rate", "estimated_days", "updated_at") VALUES
(1, 'Guatemala', true, 25.00, '1 a 2 días hábiles', '2025-10-01T15:00:00.000Z'),
(2, 'Sacatepéquez', true, 30.00, '1 a 2 días hábiles', '2025-10-01T15:00:00.000Z'),
(3, 'Chimaltenango', true, 35.00, '2 a 3 días hábiles', '2025-10-01T15:00:00.000Z'),
(4, 'Escuintla', true, 35.00, '2 a 3 días hábiles', '2025-10-01T15:00:00.000Z'),
(5, 'Quetzaltenango', true, 40.00, '2 a 3 días hábiles', '2025-10-01T15:00:00.000Z'),
(6, 'Retalhuleu', true, 40.00, '2 a 3 días hábiles', '2025-10-01T15:00:00.000Z'),
(7, 'Suchitepéquez', true, 40.00, '2 a 3 días hábiles', '2025-10-01T15:00:00.000Z'),
(8, 'Santa Rosa', true, 40.00, '2 a 3 días hábiles', '2025-10-01T15:00:00.000Z'),
(9, 'Sololá', true, 40.00, '2 a 3 días hábiles', '2025-10-01T15:00:00.000Z'),
(10, 'Totonicapán', true, 40.00, '2 a 3 días hábiles', '2025-10-01T15:00:00.000Z'),
(11, 'El Progreso', true, 40.00, '2 a 3 días hábiles', '2025-10-01T15:00:00.000Z'),
(12, 'Jutiapa', true, 45.00, '2 a 4 días hábiles', '2025-10-01T15:00:00.000Z'),
(13, 'Jalapa', true, 45.00, '2 a 4 días hábiles', '2025-10-01T15:00:00.000Z'),
(14, 'Zacapa', true, 45.00, '2 a 4 días hábiles', '2025-10-01T15:00:00.000Z'),
(15, 'Chiquimula', true, 45.00, '2 a 4 días hábiles', '2025-10-01T15:00:00.000Z'),
(16, 'Baja Verapaz', true, 45.00, '2 a 4 días hábiles', '2025-10-01T15:00:00.000Z'),
(17, 'Huehuetenango', true, 50.00, '3 a 5 días hábiles', '2025-10-01T15:00:00.000Z'),
(18, 'San Marcos', true, 50.00, '3 a 5 días hábiles', '2025-10-01T15:00:00.000Z'),
(19, 'Quiché', true, 50.00, '3 a 5 días hábiles', '2025-10-01T15:00:00.000Z'),
(20, 'Alta Verapaz', true, 50.00, '3 a 5 días hábiles', '2025-10-01T15:00:00.000Z'),
(21, 'Izabal', true, 50.00, '3 a 5 días hábiles', '2025-10-01T15:00:00.000Z'),
(22, 'Petén', false, 60.00, 'Sin cobertura por ahora', '2025-10-01T15:00:00.000Z');

INSERT INTO "carriers" ("id", "name", "phone", "prefix", "active", "created_at") VALUES
(1, 'Mensajería Exclusive', '2200 0001', 'MEX', true, '2025-10-01T15:00:00.000Z'),
(2, 'Transportes Quetzal Express', '2200 0002', 'TQX', true, '2025-10-01T15:00:00.000Z'),
(3, 'Ruta Maya Envíos', '2200 0003', 'RME', true, '2025-10-01T15:00:00.000Z');

INSERT INTO "suppliers" ("id", "name", "nit", "contact", "phone", "email", "address", "active", "created_at") VALUES
(1, 'Textiles del Altiplano, S.A. (ficticio)', '1234567-8', 'Marta Tzoc', '7761 0000', 'ventas@textiles-altiplano.demo', 'Zona 3, Quetzaltenango', true, '2025-10-01T15:00:00.000Z'),
(2, 'Confecciones Pacífico (ficticio)', '2345678-9', 'Rubén Orellana', '7771 0000', 'pedidos@confecciones-pacifico.demo', 'Km 178, Retalhuleu', true, '2025-10-01T15:00:00.000Z'),
(3, 'Denim Centroamericano (ficticio)', '3456789-0', 'Ana Castillo', '2440 0000', 'contacto@denim-ca.demo', 'Zona 12, Guatemala', true, '2025-10-01T15:00:00.000Z'),
(4, 'Outerwear Mayan Mills (ficticio)', '4567890-1', 'Jorge Ajú', '7832 0000', 'info@mayanmills.demo', 'Chimaltenango', true, '2025-10-01T15:00:00.000Z');

SELECT setval(pg_get_serial_sequence('"users"', 'id'), COALESCE((SELECT MAX("id") FROM "users"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"roles"', 'id'), COALESCE((SELECT MAX("id") FROM "roles"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"permissions"', 'id'), COALESCE((SELECT MAX("id") FROM "permissions"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"addresses"', 'id'), COALESCE((SELECT MAX("id") FROM "addresses"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"password_resets"', 'id'), COALESCE((SELECT MAX("id") FROM "password_resets"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"mailbox_messages"', 'id'), COALESCE((SELECT MAX("id") FROM "mailbox_messages"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"notifications"', 'id'), COALESCE((SELECT MAX("id") FROM "notifications"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"security_events"', 'id'), COALESCE((SELECT MAX("id") FROM "security_events"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"categories"', 'id'), COALESCE((SELECT MAX("id") FROM "categories"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"colors"', 'id'), COALESCE((SELECT MAX("id") FROM "colors"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"sizes"', 'id'), COALESCE((SELECT MAX("id") FROM "sizes"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"size_guides"', 'id'), COALESCE((SELECT MAX("id") FROM "size_guides"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"products"', 'id'), COALESCE((SELECT MAX("id") FROM "products"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"product_images"', 'id'), COALESCE((SELECT MAX("id") FROM "product_images"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"product_variants"', 'id'), COALESCE((SELECT MAX("id") FROM "product_variants"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"policies"', 'id'), COALESCE((SELECT MAX("id") FROM "policies"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"inventory_movements"', 'id'), COALESCE((SELECT MAX("id") FROM "inventory_movements"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"reservations"', 'id'), COALESCE((SELECT MAX("id") FROM "reservations"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"suppliers"', 'id'), COALESCE((SELECT MAX("id") FROM "suppliers"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"purchases"', 'id'), COALESCE((SELECT MAX("id") FROM "purchases"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"purchase_items"', 'id'), COALESCE((SELECT MAX("id") FROM "purchase_items"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"carts"', 'id'), COALESCE((SELECT MAX("id") FROM "carts"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"cart_items"', 'id'), COALESCE((SELECT MAX("id") FROM "cart_items"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"promotions"', 'id'), COALESCE((SELECT MAX("id") FROM "promotions"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"coupons"', 'id'), COALESCE((SELECT MAX("id") FROM "coupons"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"coupon_redemptions"', 'id'), COALESCE((SELECT MAX("id") FROM "coupon_redemptions"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"shipping_zones"', 'id'), COALESCE((SELECT MAX("id") FROM "shipping_zones"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"carriers"', 'id'), COALESCE((SELECT MAX("id") FROM "carriers"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"orders"', 'id'), COALESCE((SELECT MAX("id") FROM "orders"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"order_items"', 'id'), COALESCE((SELECT MAX("id") FROM "order_items"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"order_status_history"', 'id'), COALESCE((SELECT MAX("id") FROM "order_status_history"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"payments"', 'id'), COALESCE((SELECT MAX("id") FROM "payments"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"refunds"', 'id'), COALESCE((SELECT MAX("id") FROM "refunds"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"sale_documents"', 'id'), COALESCE((SELECT MAX("id") FROM "sale_documents"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"shipments"', 'id'), COALESCE((SELECT MAX("id") FROM "shipments"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"shipment_events"', 'id'), COALESCE((SELECT MAX("id") FROM "shipment_events"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"post_sale_requests"', 'id'), COALESCE((SELECT MAX("id") FROM "post_sale_requests"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"post_sale_items"', 'id'), COALESCE((SELECT MAX("id") FROM "post_sale_items"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"post_sale_history"', 'id'), COALESCE((SELECT MAX("id") FROM "post_sale_history"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"ml_models"', 'id'), COALESCE((SELECT MAX("id") FROM "ml_models"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"ml_forecasts"', 'id'), COALESCE((SELECT MAX("id") FROM "ml_forecasts"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"audit_logs"', 'id'), COALESCE((SELECT MAX("id") FROM "audit_logs"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"error_logs"', 'id'), COALESCE((SELECT MAX("id") FROM "error_logs"), 0) + 1, false);
COMMIT;
