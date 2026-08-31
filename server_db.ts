import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `v2:${salt}:${hash}`;
}

const connectionString = process.env.DATABASE_URL;
let pool: pg.Pool | null = null;
let isSimulated = false;

// Simulated in-memory database fallback if PostgreSQL is not configured
export const simulatedDb: {
  users: any[];
  clients: any[];
  planted_areas: any[];
  opportunities: any[];
  whatsapp_alerts: any[];
  deals: any[];
  tasks: any[];
  client_interactions: any[];
  audit_logs: any[];
  whatsapp_templates: any[];
  pizarra_prices: any[];
} = {
  users: [],
  clients: [],
  planted_areas: [],
  opportunities: [],
  whatsapp_alerts: [],
  deals: [],
  tasks: [],
  client_interactions: [],
  audit_logs: [],
  whatsapp_templates: [],
  pizarra_prices: []
};

if (connectionString) {
  console.log('[DB] Connecting to PostgreSQL at:', connectionString.split('@')[1] || 'local');
  const isLocalDb = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  pool = new pg.Pool({
    connectionString,
    ssl: isLocalDb ? false : { rejectUnauthorized: false }
  });
} else {
  console.error('[DB] DATABASE_URL is required. In-memory demo data is disabled.');
}

export function isDbSimulated() {
  return isSimulated;
}

// SQL query helper
export async function dbQuery(text: string, params?: any[]): Promise<any> {
  if (isSimulated || !pool) {
    throw new Error('PostgreSQL no está configurado. Defina DATABASE_URL.');
  }
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

export async function dbTransaction<T>(
  callback: (query: (text: string, params?: any[]) => Promise<any>) => Promise<T>
): Promise<T> {
  if (isSimulated || !pool) {
    throw new Error('PostgreSQL no está configurado. Defina DATABASE_URL.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback((text, params) => client.query(text, params));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Initialize tables on startup
export async function initializeDatabase() {
  if (!pool) {
    throw new Error('No se puede iniciar AgroSys sin una conexión PostgreSQL real (DATABASE_URL).');
  }
  if (isSimulated) {
    console.log('[DB] Database tables initialization skipped (Simulated Mode).');
    if (simulatedDb.whatsapp_templates.length === 0) {
      simulatedDb.whatsapp_templates.push(
        { id: 'default_boleto', name: 'Confirmación de Boleto', content: 'Hola {{nombre}}, confirmamos la operación de {{toneladas}} TN de {{grano}} a un precio de {{precio}} USD/tn. Saludos, AgroSys.', ownerId: 'GLOBAL', createdAt: new Date() },
        { id: 'default_alerta', name: 'Alerta de Precio', content: 'Estimado/a {{nombre}}, le informamos que el valor del grano {{grano}} alcanzó los {{precio}} USD/tn en Rosario. ¿Desea fijar venta?', ownerId: 'GLOBAL', createdAt: new Date() },
        { id: 'default_saludo', name: 'Saludo Comercial', content: 'Hola {{nombre}}, ¿cómo está? Nos comunicamos de la mesa de AgroSys para consultarle si tiene ofertas de venta o demandas para la campaña.', ownerId: 'GLOBAL', createdAt: new Date() }
      );
    }

    if (simulatedDb.users.length === 0) {
      simulatedDb.users.push({
        id: 'dev_user_broker',
        email: 'broker@agrosys.com',
        name: 'Corredor AgroSys',
        role: 'broker',
        passwordHash: hashPassword('123456'),
        createdAt: new Date()
      });
      console.log('[DB] Seeded default user: broker@agrosys.com / 123456');
    }
    if (simulatedDb.pizarra_prices.length === 0) {
      const today = new Date();
      for (let i = 9; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const rand = Math.sin(i) * 5;
        simulatedDb.pizarra_prices.push({
          id: `pizarra_mock_${i}`,
          soja: Math.round(280 + rand),
          maiz: Math.round(160 - rand * 0.6),
          trigo: Math.round(195 + rand * 0.8),
          sorgo: Math.round(145 + rand * 0.4),
          girasol: Math.round(310 + rand * 1.2),
          source: 'Cámara Arbitral de Rosario / MATba - USD de referencia oficial',
          createdAt: date
        });
      }
    }

    // Seed premium Argentine AgTech client directory
    if (simulatedDb.clients.length === 0) {
      simulatedDb.clients.push(
        {
          id: 'client_la_estela',
          name: 'Estancia La Estela S.A.',
          type: 'productor',
          phone: '+5493516543210',
          email: 'contacto@laestela.com.ar',
          cuit: '20-12345678-9',
          status: 'activo',
          notes: 'Productor líder de la zona de Río Cuarto. Excelente cumplimiento de contratos y rotación de cultivos.',
          location: { latitude: -33.12, longitude: -64.35, address: "Río Cuarto, Córdoba" },
          nextContactDate: new Date(Date.now() + 86400000 * 3),
          lastContactDate: new Date(Date.now() - 86400000 * 5),
          ownerId: 'GLOBAL',
          createdAt: new Date(),
          precio_objetivo_soja: 310,
          precio_objetivo_maiz: 160,
          hasSoja: 250,
          hasMaiz: 180
        },
        {
          id: 'client_el_ceibo',
          name: 'Agropecuaria El Ceibo SRL',
          type: 'productor',
          phone: '+5493415876543',
          email: 'administracion@elceibo.com',
          cuit: '20-22345678-9',
          status: 'activo',
          notes: 'Establecimiento mixto de alta productividad en Venado Tuerto. Interesado en fijar precios forwards de soja.',
          location: { latitude: -33.74, longitude: -61.97, address: "Venado Tuerto, Santa Fe" },
          nextContactDate: new Date(Date.now() + 86400000 * 2),
          lastContactDate: new Date(Date.now() - 86400000 * 10),
          ownerId: 'GLOBAL',
          createdAt: new Date(),
          precio_objetivo_soja: 320,
          precio_objetivo_trigo: 215,
          hasSoja: 400,
          hasTrigo: 150
        },
        {
          id: 'client_pergamino',
          name: 'Cooperativa Agrícola de Pergamino',
          type: 'acopio',
          phone: '+5492477123456',
          email: 'cereales@coop-pergamino.com.ar',
          cuit: '30-55443322-1',
          status: 'activo',
          notes: 'Acopio cooperativo de Pergamino. Busca cerrar cupos de maíz urgentes en puertos del Up-River.',
          location: { latitude: -33.89, longitude: -60.57, address: "Pergamino, Buenos Aires" },
          nextContactDate: new Date(Date.now() + 86400000 * 1),
          lastContactDate: new Date(Date.now() - 86400000 * 2),
          ownerId: 'GLOBAL',
          createdAt: new Date(),
          precio_objetivo_maiz: 165,
          precio_objetivo_trigo: 210,
          hasMaiz: 300,
          hasTrigo: 200
        },
        {
          id: 'client_spinetta',
          name: 'Luis Spinetta e Hijos',
          type: 'productor',
          phone: '+5493419998888',
          email: 'luis.spinetta@gmail.com',
          cuit: '20-11223344-5',
          status: 'activo',
          notes: 'Productor tradicional de la zona de Casilda. Prefiere operar soja disponible con entrega en San Lorenzo.',
          location: { latitude: -33.04, longitude: -61.16, address: "Casilda, Santa Fe" },
          nextContactDate: new Date(Date.now() + 86400000 * 5),
          lastContactDate: new Date(Date.now() - 86400000 * 3),
          ownerId: 'GLOBAL',
          createdAt: new Date(),
          precio_objetivo_soja: 315,
          hasSoja: 120,
          hasMaiz: 90
        },
        {
          id: 'client_bunge',
          name: 'Bunge Argentina S.A.',
          type: 'exportador',
          phone: '+5493476443322',
          email: 'mesadegranos@bunge.com.ar',
          cuit: '30-99887766-5',
          status: 'activo',
          notes: 'Terminal portuaria y fábrica de molienda en PGSM. Comprador de soja y maíz a gran escala para exportación.',
          location: { latitude: -32.72, longitude: -60.73, address: "San Lorenzo, Santa Fe" },
          nextContactDate: null,
          lastContactDate: new Date(Date.now() - 86400000 * 1),
          ownerId: 'GLOBAL',
          createdAt: new Date()
        }
      );
    }

    // Seed planted crop hectares
    if (simulatedDb.planted_areas.length === 0) {
      simulatedDb.planted_areas.push(
        { id: 'area_la_estela_soja', clientId: 'client_la_estela', cropType: 'soja', campaign: '24/25', area_ha: 250, ownerId: 'GLOBAL' },
        { id: 'area_la_estela_maiz', clientId: 'client_la_estela', cropType: 'maiz', campaign: '24/25', area_ha: 180, ownerId: 'GLOBAL' },
        { id: 'area_el_ceibo_soja', clientId: 'client_el_ceibo', cropType: 'soja', campaign: '24/25', area_ha: 400, ownerId: 'GLOBAL' },
        { id: 'area_el_ceibo_trigo', clientId: 'client_el_ceibo', cropType: 'trigo', campaign: '24/25', area_ha: 150, ownerId: 'GLOBAL' },
        { id: 'area_spinetta_soja', clientId: 'client_spinetta', cropType: 'soja', campaign: '24/25', area_ha: 120, ownerId: 'GLOBAL' },
        { id: 'area_spinetta_maiz', clientId: 'client_spinetta', cropType: 'maiz', campaign: '24/25', area_ha: 90, ownerId: 'GLOBAL' }
      );
    }

    // Seed active pipeline opportunities
    if (simulatedDb.opportunities.length === 0) {
      simulatedDb.opportunities.push(
        {
          id: 'opp_la_estela',
          type: 'oferta',
          clientId: 'client_la_estela',
          cropType: 'soja',
          quantity_tn: 100,
          price_usd: 312,
          location: 'Río Cuarto, Córdoba',
          status: 'abierta',
          ownerId: 'GLOBAL',
          createdAt: new Date()
        },
        {
          id: 'opp_el_ceibo',
          type: 'oferta',
          clientId: 'client_el_ceibo',
          cropType: 'maiz',
          quantity_tn: 250,
          price_usd: 162,
          location: 'Venado Tuerto, Santa Fe',
          status: 'negociacion',
          ownerId: 'GLOBAL',
          createdAt: new Date()
        },
        {
          id: 'opp_pergamino',
          type: 'demanda',
          clientId: 'client_pergamino',
          cropType: 'soja',
          quantity_tn: 300,
          price_usd: 315,
          location: 'Rosario, Santa Fe',
          status: 'abierta',
          ownerId: 'GLOBAL',
          createdAt: new Date()
        },
        {
          id: 'opp_bunge',
          type: 'demanda',
          clientId: 'client_bunge',
          cropType: 'maiz',
          quantity_tn: 500,
          price_usd: 164,
          location: 'San Lorenzo, Santa Fe',
          status: 'negociacion',
          ownerId: 'GLOBAL',
          createdAt: new Date()
        }
      );
    }

    // Seed closed brokered deals
    if (simulatedDb.deals.length === 0) {
      simulatedDb.deals.push(
        {
          id: 'deal_1',
          cropType: 'soja',
          sellerId: 'client_la_estela',
          buyerId: 'client_bunge',
          sellerName: 'Estancia La Estela S.A.',
          buyerName: 'Bunge Argentina S.A.',
          quantity_tn: 150,
          price_seller: 310,
          price_buyer: 312,
          totalCommission: 933,
          location: 'San Lorenzo, Santa Fe',
          ownerId: 'GLOBAL',
          createdAt: new Date(Date.now() - 86400000 * 2),
          payment_terms: '72 hs',
          grain_quality: 'Cámara',
          estimated_freight: 12,
          logistics_status: 'cupo_asignado',
          logistics_cupo: 'CUP-7729',
          logistics_cpe: 'CPE-84729104',
          logistics_driver: 'Juan Pérez',
          logistics_plate: 'AA-123-BB',
          delivery_status: 'pendiente',
          liq_status: 'pendiente',
          operation_status: 'abierta'
        },
        {
          id: 'deal_2',
          cropType: 'maiz',
          sellerId: 'client_el_ceibo',
          buyerId: 'client_pergamino',
          sellerName: 'Agropecuaria El Ceibo SRL',
          buyerName: 'Cooperativa Agrícola de Pergamino',
          quantity_tn: 200,
          price_seller: 161,
          price_buyer: 163,
          totalCommission: 648,
          location: 'Rosario, Santa Fe',
          ownerId: 'GLOBAL',
          createdAt: new Date(Date.now() - 86400000 * 4),
          payment_terms: 'Contado',
          grain_quality: 'Grado 2',
          estimated_freight: 15,
          logistics_status: 'arribado',
          logistics_cupo: 'CUP-4410',
          logistics_cpe: 'CPE-10029481',
          logistics_driver: 'Carlos Gómez',
          logistics_plate: 'AB-987-CD',
          delivery_status: 'entregado',
          delivery_moisture: 14.5,
          delivery_weight_net: 198.5,
          delivery_ticket: 'BAL-99214',
          delivery_certificate: 'DEP-84124',
          liq_status: 'pendiente',
          operation_status: 'abierta'
        }
      );
    }

    // Seed logistical calendar tasks
    if (simulatedDb.tasks.length === 0) {
      simulatedDb.tasks.push(
        {
          id: 'task_1',
          taskTitle: 'Coordinar fletes soja disponible',
          clientId: 'client_la_estela',
          clientName: 'Estancia La Estela S.A.',
          dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          cropType: 'soja',
          category: 'cosecha',
          status: 'pendiente',
          ownerId: 'GLOBAL',
          createdAt: new Date()
        },
        {
          id: 'task_2',
          taskTitle: 'Cobro de saldo boleto maiz #2',
          clientId: 'client_el_ceibo',
          clientName: 'Agropecuaria El Ceibo SRL',
          dueDate: new Date(Date.now() - 86400000).toISOString().split('T')[0],
          cropType: 'maiz',
          category: 'cobro',
          status: 'pendiente',
          ownerId: 'GLOBAL',
          createdAt: new Date()
        },
        {
          id: 'task_3',
          taskTitle: 'Revisar documentación CUIT',
          clientId: 'client_pergamino',
          clientName: 'Cooperativa Agrícola de Pergamino',
          dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
          cropType: 'trigo',
          category: 'documentacion',
          status: 'pendiente',
          ownerId: 'GLOBAL',
          createdAt: new Date()
        }
      );
    }

    // Seed WhatsApp group alerts (with client mappings and prospects)
    if (simulatedDb.whatsapp_alerts.length === 0) {
      simulatedDb.whatsapp_alerts.push(
        {
          id: 'alert_1',
          rawMessage: 'Venta 150 tn soja disponible procedencia Laboulaye condiciones cámara',
          sourceGroup: 'Ventas Granos Cba',
          senderPhone: '+5493516543210',
          suggestedType: 'oferta',
          suggestedCropType: 'soja',
          suggestedQuantity: 150,
          suggestedPrice: 310,
          suggestedQuantityUnit: 'tn',
          suggestedPriceUnit: 'USD',
          originalQuantity: 150,
          originalPrice: 310,
          location: 'Laboulaye',
          paymentTerms: 'disponible',
          grainQuality: 'cámara',
          status: 'nueva',
          ownerId: 'GLOBAL',
          createdAt: new Date(Date.now() - 3600000 * 2),
          clientId: 'client_la_estela',
          esProspecto: false
        },
        {
          id: 'alert_2',
          rawMessage: 'Compro trigo 300 tn diciembre Necochea grado 2 contractual',
          sourceGroup: 'Demandas Exportadores',
          senderPhone: '+5491133334444',
          suggestedType: 'demanda',
          suggestedCropType: 'trigo',
          suggestedQuantity: 300,
          suggestedPrice: 215,
          suggestedQuantityUnit: 'tn',
          suggestedPriceUnit: 'USD',
          originalQuantity: 300,
          originalPrice: 215,
          location: 'Necochea',
          paymentTerms: 'contractual',
          grainQuality: 'grado 2',
          status: 'nueva',
          ownerId: 'GLOBAL',
          createdAt: new Date(Date.now() - 3600000 * 1),
          clientId: null,
          esProspecto: true
        }
      );
    }
    return;
  }

  try {
    console.log('[DB] Initializing PostgreSQL tables...');

    // Users
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(128) PRIMARY KEY,
        email VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL,
        name VARCHAR(100),
        password_hash VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Ensure password_hash column exists
    await dbQuery(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
    `);

    // Clients
    await dbQuery(`
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
    `);

    // Ensure metadata column exists
    await dbQuery(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS metadata JSONB;
    `);

    // Client Interactions
    await dbQuery(`
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
    `);

    // Planted Areas
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS planted_areas (
        id VARCHAR(128) PRIMARY KEY,
        client_id VARCHAR(128) REFERENCES clients(id) ON DELETE CASCADE,
        crop_type VARCHAR(50) NOT NULL,
        campaign VARCHAR(50) NOT NULL,
        area_ha NUMERIC NOT NULL,
        owner_id VARCHAR(128) NOT NULL
      );
    `);

    // Opportunities
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS opportunities (
        id VARCHAR(128) PRIMARY KEY,
        type VARCHAR(10) NOT NULL,
        client_id VARCHAR(128) REFERENCES clients(id) ON DELETE CASCADE,
        crop_type VARCHAR(50) NOT NULL,
        quantity_tn NUMERIC NOT NULL,
        price_usd NUMERIC NOT NULL,
        location VARCHAR(200),
        status VARCHAR(20) NOT NULL,
        owner_id VARCHAR(128) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await dbQuery(`
      ALTER TABLE opportunities ALTER COLUMN status TYPE VARCHAR(40);
      ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS delivery_date DATE;
      ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
      ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100);
      ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS grain_quality VARCHAR(100);
      ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS price_mode VARCHAR(20) NOT NULL DEFAULT 'fijo';
      ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS next_action VARCHAR(250);
      ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lost_reason VARCHAR(150);
      ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_alert_id VARCHAR(128);
      ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
      UPDATE opportunities SET status = 'ganada' WHERE status = 'cerrada';
    `);

    // WhatsApp Alerts
    await dbQuery(`
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
        owner_id VARCHAR(128) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Ensure client_id and es_prospecto columns exist
    await dbQuery(`
      ALTER TABLE whatsapp_alerts ADD COLUMN IF NOT EXISTS client_id VARCHAR(128) REFERENCES clients(id) ON DELETE SET NULL;
    `);
    await dbQuery(`
      ALTER TABLE whatsapp_alerts ADD COLUMN IF NOT EXISTS es_prospecto BOOLEAN DEFAULT TRUE;
    `);
    await dbQuery(`
      ALTER TABLE whatsapp_alerts ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100);
    `);
    await dbQuery(`
      ALTER TABLE whatsapp_alerts ADD COLUMN IF NOT EXISTS grain_quality VARCHAR(100);
    `);

    await dbQuery(`
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
    `);


    // Deals
    await dbQuery(`
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
        owner_id VARCHAR(128) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Ensure operational and financial columns exist in deals table
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100);`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS grain_quality VARCHAR(100);`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS estimated_freight NUMERIC DEFAULT 0;`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS logistics_status VARCHAR(50) DEFAULT 'pendiente';`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS logistics_cupo VARCHAR(50);`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS logistics_cpe VARCHAR(50);`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS logistics_driver VARCHAR(150);`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS logistics_plate VARCHAR(50);`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(50) DEFAULT 'pendiente';`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS delivery_moisture NUMERIC;`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS delivery_weight_net NUMERIC;`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS delivery_ticket VARCHAR(50);`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS delivery_certificate VARCHAR(50);`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS liq_status VARCHAR(50) DEFAULT 'pendiente';`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS liq_lpg_number VARCHAR(50);`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS liq_drying_cost NUMERIC DEFAULT 0;`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS liq_cleaning_cost NUMERIC DEFAULT 0;`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS liq_freight_cost NUMERIC DEFAULT 0;`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS liq_tax_withheld NUMERIC DEFAULT 0;`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS liq_net_payout NUMERIC DEFAULT 0;`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS liq_invoice_number VARCHAR(50);`);
    await dbQuery(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS operation_status VARCHAR(50) DEFAULT 'abierta';`);


    // Tasks
    await dbQuery(`
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
    `);

    // Audit Logs
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(128) PRIMARY KEY,
        user_id VARCHAR(128) NOT NULL,
        action VARCHAR(250) NOT NULL,
        details TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // WhatsApp Templates
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS whatsapp_templates (
        id VARCHAR(128) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        content TEXT NOT NULL,
        owner_id VARCHAR(128) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Pizarra Prices
    await dbQuery(`
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
    `);

    // Populate default templates if empty
    if (isSimulated) {
      if (simulatedDb.whatsapp_templates.length === 0) {
        simulatedDb.whatsapp_templates.push(
          { id: 'default_boleto', name: 'Confirmación de Boleto', content: 'Hola {{nombre}}, confirmamos la operación de {{toneladas}} TN de {{grano}} a un precio de {{precio}} USD/tn. Saludos, AgroSys.', ownerId: 'GLOBAL', createdAt: new Date() },
          { id: 'default_alerta', name: 'Alerta de Precio', content: 'Estimado/a {{nombre}}, le informamos que el valor del grano {{grano}} alcanzó los {{precio}} USD/tn en Rosario. ¿Desea fijar venta?', ownerId: 'GLOBAL', createdAt: new Date() },
          { id: 'default_saludo', name: 'Saludo Comercial', content: 'Hola {{nombre}}, ¿cómo está? Nos comunicamos de la mesa de AgroSys para consultarle si tiene ofertas de venta o demandas para la campaña.', ownerId: 'GLOBAL', createdAt: new Date() }
        );
      }
    } else {
      const templateCheck = await dbQuery('SELECT id FROM whatsapp_templates LIMIT 1');
      if (templateCheck.rows.length === 0) {
        await dbQuery(`
          INSERT INTO whatsapp_templates (id, name, content, owner_id) VALUES
          ('default_boleto', 'Confirmación de Boleto', 'Hola {{nombre}}, confirmamos la operación de {{toneladas}} TN de {{grano}} a un precio de {{precio}} USD/tn. Saludos, AgroSys.', 'GLOBAL'),
          ('default_alerta', 'Alerta de Precio', 'Estimado/a {{nombre}}, le informamos que el valor del grano {{grano}} alcanzó los {{precio}} USD/tn en Rosario. ¿Desea fijar venta?', 'GLOBAL'),
          ('default_saludo', 'Saludo Comercial', 'Hola {{nombre}}, ¿cómo está? Nos comunicamos de la mesa de AgroSys para consultarle si tiene ofertas de venta o demandas para la campaña.', 'GLOBAL')
        `);
      }

      // Ensure default admin / broker user exists in Postgres
      const userCheck = await dbQuery('SELECT id FROM users WHERE LOWER(email) = $1', ['broker@agrosys.com']);
      if (userCheck.rows.length === 0) {
        const defaultHash = hashPassword('123456');
        await dbQuery(
          'INSERT INTO users (id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5)',
          ['dev_user_broker', 'broker@agrosys.com', 'Corredor AgroSys', 'broker', defaultHash]
        );
        console.log('[DB] Seeded default Postgres user: broker@agrosys.com / 123456');
      } else {
        const defaultHash = hashPassword('123456');
        await dbQuery('UPDATE users SET password_hash = $1 WHERE LOWER(email) = $2 AND (password_hash IS NULL OR password_hash = \'\')', [defaultHash, 'broker@agrosys.com']);
      }

      // Seed Pizarra prices if empty
      const pizarraCheck = await dbQuery('SELECT id FROM pizarra_prices LIMIT 1');
      if (pizarraCheck.rows.length === 0) {
        const today = new Date();
        for (let i = 9; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(today.getDate() - i);
          const rand = Math.sin(i) * 5;
          await dbQuery(
            'INSERT INTO pizarra_prices (id, soja, maiz, trigo, sorgo, girasol, source, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [
              `pizarra_seed_${i}`,
              Math.round(280 + rand),
              Math.round(160 - rand * 0.6),
              Math.round(195 + rand * 0.8),
              Math.round(145 + rand * 0.4),
              Math.round(310 + rand * 1.2),
              'Cámara Arbitral de Rosario / MATba - USD de referencia oficial',
              date
            ]
          );
        }
      }

      // Seed demo clients and operational data if empty
      const clientsCheck = await dbQuery('SELECT id FROM clients LIMIT 1');
      if (clientsCheck.rows.length === 0) {
        await dbQuery(`
          INSERT INTO clients (id, name, type, phone, email, cuit, status, notes, location, next_contact_date, last_contact_date, metadata, owner_id) VALUES
          ('client_la_estela', 'Estancia La Estela S.A.', 'productor', '+5493516543210', 'contacto@laestela.com.ar', '20-12345678-9', 'activo', 'Productor líder de la zona de Río Cuarto. Excelente cumplimiento de contratos y rotación de cultivos.', '{"latitude": -33.12, "longitude": -64.35, "address": "Río Cuarto, Córdoba"}', NOW() + INTERVAL '3 days', NOW() - INTERVAL '5 days', '{"precio_objetivo_soja": 310, "precio_objetivo_maiz": 160, "hasSoja": 250, "hasMaiz": 180}', 'GLOBAL'),
          ('client_el_ceibo', 'Agropecuaria El Ceibo SRL', 'productor', '+5493415876543', 'administracion@elceibo.com', '20-22345678-9', 'activo', 'Establecimiento mixto de alta productividad en Venado Tuerto. Interesado en fijar precios forwards de soja.', '{"latitude": -33.74, "longitude": -61.97, "address": "Venado Tuerto, Santa Fe"}', NOW() + INTERVAL '2 days', NOW() - INTERVAL '10 days', '{"precio_objetivo_soja": 320, "precio_objetivo_trigo": 215, "hasSoja": 400, "hasTrigo": 150}', 'GLOBAL'),
          ('client_pergamino', 'Cooperativa Agrícola de Pergamino', 'acopio', '+5492477123456', 'cereales@coop-pergamino.com.ar', '30-55443322-1', 'activo', 'Acopio cooperativo de Pergamino. Busca cerrar cupos de maíz urgentes en puertos del Up-River.', '{"latitude": -33.89, "longitude": -60.57, "address": "Pergamino, Buenos Aires"}', NOW() + INTERVAL '1 day', NOW() - INTERVAL '2 days', '{"precio_objetivo_maiz": 165, "precio_objetivo_trigo": 210, "hasMaiz": 300, "hasTrigo": 200}', 'GLOBAL'),
          ('client_spinetta', 'Luis Spinetta e Hijos', 'productor', '+5493419998888', 'luis.spinetta@gmail.com', '20-11223344-5', 'activo', 'Productor tradicional de la zona de Casilda. Prefiere operar soja disponible con entrega en San Lorenzo.', '{"latitude": -33.04, "longitude": -61.16, "address": "Casilda, Santa Fe"}', NOW() + INTERVAL '5 days', NOW() - INTERVAL '3 days', '{"precio_objetivo_soja": 315, "hasSoja": 120, "hasMaiz": 90}', 'GLOBAL'),
          ('client_bunge', 'Bunge Argentina S.A.', 'exportador', '+5493476443322', 'mesadegranos@bunge.com.ar', '30-99887766-5', 'activo', 'Terminal portuaria y fábrica de molienda en PGSM. Comprador de soja y maíz a gran escala para exportación.', '{"latitude": -32.72, "longitude": -60.73, "address": "San Lorenzo, Santa Fe"}', NULL, NOW() - INTERVAL '1 day', '{}', 'GLOBAL')
          ON CONFLICT (id) DO NOTHING;
        `);

        await dbQuery(`
          INSERT INTO planted_areas (id, client_id, crop_type, campaign, area_ha, owner_id) VALUES
          ('area_la_estela_soja', 'client_la_estela', 'soja', '24/25', 250, 'GLOBAL'),
          ('area_la_estela_maiz', 'client_la_estela', 'maiz', '24/25', 180, 'GLOBAL'),
          ('area_el_ceibo_soja', 'client_el_ceibo', 'soja', '24/25', 400, 'GLOBAL'),
          ('area_el_ceibo_trigo', 'client_el_ceibo', 'trigo', '24/25', 150, 'GLOBAL'),
          ('area_spinetta_soja', 'client_spinetta', 'soja', '24/25', 120, 'GLOBAL'),
          ('area_spinetta_maiz', 'client_spinetta', 'maiz', '24/25', 90, 'GLOBAL')
          ON CONFLICT (id) DO NOTHING;
        `);

        await dbQuery(`
          INSERT INTO opportunities (id, type, client_id, crop_type, quantity_tn, price_usd, location, status, owner_id) VALUES
          ('opp_la_estela', 'oferta', 'client_la_estela', 'soja', 150, 310, 'Río Cuarto, Córdoba', 'abierta', 'GLOBAL'),
          ('opp_el_ceibo', 'oferta', 'client_el_ceibo', 'soja', 200, 315, 'Venado Tuerto, Santa Fe', 'abierta', 'GLOBAL'),
          ('opp_spinetta', 'oferta', 'client_spinetta', 'soja', 120, 312, 'Casilda, Santa Fe', 'ganada', 'GLOBAL'),
          ('opp_pergamino', 'demanda', 'client_pergamino', 'trigo', 300, 215, 'Rosario, Santa Fe', 'abierta', 'GLOBAL'),
          ('opp_bunge', 'demanda', 'client_bunge', 'maiz', 500, 164, 'San Lorenzo, Santa Fe', 'negociacion', 'GLOBAL')
          ON CONFLICT (id) DO NOTHING;
        `);

        await dbQuery(`
          INSERT INTO deals (id, crop_type, seller_id, buyer_id, seller_name, buyer_name, quantity_tn, price_seller, price_buyer, total_commission, location, payment_terms, grain_quality, estimated_freight, logistics_status, logistics_cupo, logistics_cpe, logistics_driver, logistics_plate, delivery_status, liq_status, operation_status, owner_id) VALUES
          ('deal_1', 'soja', 'client_la_estela', 'client_bunge', 'Estancia La Estela S.A.', 'Bunge Argentina S.A.', 150, 310, 312, 933, 'San Lorenzo, Santa Fe', '72 hs', 'Cámara', 12, 'cupo_asignado', 'CUP-7729', 'CPE-84729104', 'Juan Pérez', 'AA-123-BB', 'pendiente', 'pendiente', 'abierta', 'GLOBAL'),
          ('deal_2', 'maiz', 'client_el_ceibo', 'client_pergamino', 'Agropecuaria El Ceibo SRL', 'Cooperativa Agrícola de Pergamino', 200, 161, 163, 648, 'Rosario, Santa Fe', 'Contado', 'Grado 2', 15, 'arribado', 'CUP-4410', 'CPE-10029481', 'Carlos Gómez', 'AC-987-XY', 'entregado', 'pendiente', 'abierta', 'GLOBAL')
          ON CONFLICT (id) DO NOTHING;
        `);

        await dbQuery(`
          INSERT INTO tasks (id, task_title, client_id, client_name, due_date, crop_type, category, status, owner_id) VALUES
          ('task_1', 'Fijar precio soja lote La Estela', 'client_la_estela', 'Estancia La Estela S.A.', TO_CHAR(NOW() + INTERVAL '1 day', 'YYYY-MM-DD'), 'soja', 'cosecha', 'pendiente', 'GLOBAL'),
          ('task_2', 'Cobro de saldo boleto maiz #2', 'client_el_ceibo', 'Agropecuaria El Ceibo SRL', TO_CHAR(NOW() - INTERVAL '1 day', 'YYYY-MM-DD'), 'maiz', 'cobro', 'pendiente', 'GLOBAL'),
          ('task_3', 'Revisar documentación CUIT', 'client_pergamino', 'Cooperativa Agrícola de Pergamino', TO_CHAR(NOW() + INTERVAL '3 days', 'YYYY-MM-DD'), 'trigo', 'documentacion', 'pendiente', 'GLOBAL')
          ON CONFLICT (id) DO NOTHING;
        `);

        await dbQuery(`
          INSERT INTO whatsapp_alerts (id, raw_message, source_group, sender_phone, suggested_type, suggested_crop_type, suggested_quantity, suggested_price, suggested_quantity_unit, suggested_price_unit, original_quantity, original_price, location, payment_terms, grain_quality, status, client_id, es_prospecto, owner_id) VALUES
          ('alert_1', 'Venta 150 tn soja disponible procedencia Laboulaye condiciones cámara', 'Ventas Granos Cba', '+5493516543210', 'oferta', 'soja', 150, 310, 'tn', 'USD', 150, 310, 'Laboulaye', 'disponible', 'cámara', 'nueva', 'client_la_estela', FALSE, 'GLOBAL'),
          ('alert_2', 'Compro trigo 300 tn diciembre Necochea grado 2 contractual', 'Demandas Exportadores', '+5491133334444', 'demanda', 'trigo', 300, 215, 'tn', 'USD', 300, 215, 'Necochea', 'contractual', 'grado 2', 'nueva', NULL, TRUE, 'GLOBAL')
          ON CONFLICT (id) DO NOTHING;
        `);
      }

      // Create high-performance database indexes
      await dbQuery(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_clients_owner ON clients(owner_id);
        CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
        CREATE INDEX IF NOT EXISTS idx_opportunities_owner ON opportunities(owner_id);
        CREATE INDEX IF NOT EXISTS idx_opportunities_crop_status ON opportunities(crop_type, status);
        CREATE INDEX IF NOT EXISTS idx_opportunities_client ON opportunities(client_id);
        CREATE INDEX IF NOT EXISTS idx_whatsapp_alerts_status ON whatsapp_alerts(status);
        CREATE INDEX IF NOT EXISTS idx_whatsapp_alerts_client ON whatsapp_alerts(client_id);
        CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner_id);
        CREATE INDEX IF NOT EXISTS idx_deals_crop ON deals(crop_type);
        CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
        CREATE INDEX IF NOT EXISTS idx_pizarra_created ON pizarra_prices(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
      `);

    }

    console.log('[DB] PostgreSQL tables and indexes checked/initialized successfully.');
  } catch (err) {
    console.error('[DB] Failed to initialize PostgreSQL tables:', err);
    throw err;
  }
}
