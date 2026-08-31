-- =================================================================
-- AgroSys PostgreSQL Schema & Initial Seeds
-- Compatible with PostgreSQL 14, 15, 16, 17+
-- =================================================================

-- 1. Tablas Principales
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) PRIMARY KEY,
  email VARCHAR(100) NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  password_hash VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id VARCHAR(128) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  type VARCHAR(50),
  phone VARCHAR(30),
  email VARCHAR(100),
  cuit VARCHAR(20),
  status VARCHAR(30),
  notes TEXT,
  location JSONB,
  next_contact_date TIMESTAMP,
  last_contact_date TIMESTAMP,
  metadata JSONB,
  owner_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_interactions (
  id VARCHAR(128) PRIMARY KEY,
  client_id VARCHAR(128) REFERENCES clients(id) ON DELETE CASCADE,
  client_name VARCHAR(150) NOT NULL,
  type VARCHAR(50) NOT NULL,
  note TEXT NOT NULL,
  date VARCHAR(20) NOT NULL,
  owner_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planted_areas (
  id VARCHAR(128) PRIMARY KEY,
  client_id VARCHAR(128) REFERENCES clients(id) ON DELETE CASCADE,
  crop_type VARCHAR(50) NOT NULL,
  campaign VARCHAR(50) NOT NULL,
  area_ha NUMERIC NOT NULL,
  owner_id VARCHAR(128) NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunities (
  id VARCHAR(128) PRIMARY KEY,
  type VARCHAR(10) NOT NULL,
  client_id VARCHAR(128) REFERENCES clients(id) ON DELETE CASCADE,
  crop_type VARCHAR(50) NOT NULL,
  quantity_tn NUMERIC NOT NULL,
  price_usd NUMERIC NOT NULL,
  location VARCHAR(200),
  status VARCHAR(40) NOT NULL,
  delivery_date DATE,
  expires_at TIMESTAMP,
  payment_terms VARCHAR(100),
  grain_quality VARCHAR(100),
  price_mode VARCHAR(20) NOT NULL DEFAULT 'fijo',
  next_action VARCHAR(250),
  lost_reason VARCHAR(150),
  source_alert_id VARCHAR(128),
  owner_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_alerts (
  id VARCHAR(128) PRIMARY KEY,
  raw_message TEXT NOT NULL,
  source_group VARCHAR(100) NOT NULL,
  sender_phone VARCHAR(30) NOT NULL,
  suggested_type VARCHAR(20),
  suggested_crop_type VARCHAR(50),
  suggested_quantity NUMERIC,
  suggested_price NUMERIC,
  suggested_quantity_unit VARCHAR(20),
  suggested_price_unit VARCHAR(20),
  original_quantity NUMERIC,
  original_price NUMERIC,
  location VARCHAR(200),
  payment_terms VARCHAR(100),
  grain_quality VARCHAR(100),
  status VARCHAR(20) NOT NULL,
  client_id VARCHAR(128) REFERENCES clients(id) ON DELETE SET NULL,
  es_prospecto BOOLEAN DEFAULT TRUE,
  owner_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_negotiations (
  id VARCHAR(128) PRIMARY KEY,
  offer_id VARCHAR(128) NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  demand_id VARCHAR(128) NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  quantity_tn NUMERIC NOT NULL,
  seller_price NUMERIC NOT NULL,
  buyer_price NUMERIC NOT NULL,
  commission_pct NUMERIC NOT NULL DEFAULT 2,
  seller_response VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  buyer_response VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  status VARCHAR(40) NOT NULL DEFAULT 'esperando_confirmacion',
  owner_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (offer_id, demand_id)
);

CREATE TABLE IF NOT EXISTS deals (
  id VARCHAR(128) PRIMARY KEY,
  crop_type VARCHAR(50) NOT NULL,
  seller_id VARCHAR(128),
  buyer_id VARCHAR(128),
  seller_name VARCHAR(150) NOT NULL,
  buyer_name VARCHAR(150) NOT NULL,
  quantity_tn NUMERIC NOT NULL,
  price_seller NUMERIC NOT NULL,
  price_buyer NUMERIC NOT NULL,
  total_commission NUMERIC NOT NULL,
  location VARCHAR(200),
  payment_terms VARCHAR(100),
  grain_quality VARCHAR(100),
  estimated_freight NUMERIC DEFAULT 0,
  logistics_status VARCHAR(50) DEFAULT 'pendiente',
  logistics_cupo VARCHAR(50),
  logistics_cpe VARCHAR(50),
  logistics_driver VARCHAR(150),
  logistics_plate VARCHAR(50),
  delivery_status VARCHAR(50) DEFAULT 'pendiente',
  delivery_moisture NUMERIC,
  delivery_weight_net NUMERIC,
  delivery_ticket VARCHAR(50),
  delivery_certificate VARCHAR(50),
  liq_status VARCHAR(50) DEFAULT 'pendiente',
  liq_lpg_number VARCHAR(50),
  liq_drying_cost NUMERIC DEFAULT 0,
  liq_cleaning_cost NUMERIC DEFAULT 0,
  liq_freight_cost NUMERIC DEFAULT 0,
  liq_tax_withheld NUMERIC DEFAULT 0,
  liq_net_payout NUMERIC DEFAULT 0,
  liq_invoice_number VARCHAR(50),
  operation_status VARCHAR(50) DEFAULT 'abierta',
  owner_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(128) PRIMARY KEY,
  task_title VARCHAR(250) NOT NULL,
  client_id VARCHAR(128) REFERENCES clients(id) ON DELETE CASCADE,
  client_name VARCHAR(150) NOT NULL,
  due_date VARCHAR(20) NOT NULL,
  crop_type VARCHAR(50) NOT NULL,
  category VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  owner_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  action VARCHAR(250) NOT NULL,
  details TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id VARCHAR(128) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  content TEXT NOT NULL,
  owner_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pizarra_prices (
  id VARCHAR(128) PRIMARY KEY,
  soja NUMERIC NOT NULL,
  maiz NUMERIC NOT NULL,
  trigo NUMERIC NOT NULL,
  sorgo NUMERIC NOT NULL,
  girasol NUMERIC NOT NULL,
  source VARCHAR(250) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =================================================================
-- 2. Datos Iniciales (Seeds)
-- =================================================================

-- Usuario inicial (broker@agrosys.com / 123456)
INSERT INTO users (id, email, name, role, password_hash)
VALUES ('dev_user_broker', 'broker@agrosys.com', 'Corredor AgroSys', 'broker', 'v2:1234567890abcdef:398bf35a4aa508be65cfbcbbcf2d813ecbf610e20601934988e0b6ec86f5fa5cefc6ca1bf482e16d418721bfbe55e1db1a9f5d37803a67733f37b988f5be57d5')
ON CONFLICT (id) DO NOTHING;

-- Plantillas de WhatsApp
INSERT INTO whatsapp_templates (id, name, content, owner_id)
VALUES 
  ('default_boleto', 'Confirmación de Boleto', 'Hola {{nombre}}, confirmamos la operación de {{toneladas}} TN de {{grano}} a un precio de {{precio}} USD/tn. Saludos, AgroSys.', 'GLOBAL'),
  ('default_alerta', 'Alerta de Precio', 'Estimado/a {{nombre}}, le informamos que el valor del grano {{grano}} alcanzó los {{precio}} USD/tn en Rosario. ¿Desea fijar venta?', 'GLOBAL'),
  ('default_saludo', 'Saludo Comercial', 'Hola {{nombre}}, ¿cómo está? Nos comunicamos de la mesa de AgroSys para consultarle si tiene ofertas de venta o demandas para la campaña.', 'GLOBAL')
ON CONFLICT (id) DO NOTHING;

-- Pizarra de Precios
INSERT INTO pizarra_prices (id, soja, maiz, trigo, sorgo, girasol, source, created_at)
VALUES 
  ('pizarra_actual', 285, 162, 198, 145, 312, 'Cámara Arbitral de Rosario / MATba - USD de referencia oficial', NOW())
ON CONFLICT (id) DO NOTHING;
