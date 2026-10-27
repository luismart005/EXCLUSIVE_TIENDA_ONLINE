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
