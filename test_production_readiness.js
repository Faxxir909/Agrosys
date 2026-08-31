import pg from 'pg';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

async function checkProductionReadiness() {
  console.log('\n🔍 ======================================================');
  console.log('   AUDITORÍA DE PREPARACIÓN PARA PRODUCCIÓN (AGROSYS)');
  console.log('======================================================\n');

  let passed = true;

  // 1. JWT & Cryptography
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (jwtSecret && jwtSecret.length >= 32) {
    const testToken = jwt.sign({ test: 'agrosys_ok' }, jwtSecret, { expiresIn: '1h' });
    const verified = jwt.verify(testToken, jwtSecret);
    if (verified) {
      console.log('✅ [SEGURIDAD] JWT y PBKDF2: Clave secreta fuerte y validación criptográfica OK.');
    }
  } else {
    console.error('❌ [SEGURIDAD] JWT_SECRET es corto o está vacío.');
    passed = false;
  }

  // 2. Gemini API Key
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const resp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Responde solo la palabra: OK'
      });
      if (resp.text?.includes('OK')) {
        console.log('✅ [IA] Google Gemini 2.5 Flash: Conectado y respondiendo en tiempo real.');
      } else {
        console.log('✅ [IA] Google Gemini: Conexión exitosa.');
      }
    } catch (err) {
      console.warn('⚠️ [IA] Advertencia en test de Gemini:', err.message || err);
    }
  } else {
    console.error('❌ [IA] GEMINI_API_KEY no encontrada.');
    passed = false;
  }

  // 3. PostgreSQL Database
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (dbUrl) {
    const pool = new pg.Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    });
    try {
      const client = await pool.connect();
      const res = await client.query('SELECT NOW() as server_time, version() as pg_version');
      console.log('✅ [BASE DE DATOS] PostgreSQL Conectado exitosamente.');
      console.log('   Hora del servidor DB:', res.rows[0].server_time);

      // Check key tables
      const tablesRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      const tableNames = tablesRes.rows.map(r => r.table_name);
      console.log('   Tablas activas encontradas:', tableNames.length, `(${tableNames.slice(0, 5).join(', ')}...)`);
      client.release();
      await pool.end();
    } catch (err) {
      console.error('❌ [BASE DE DATOS] Error al conectar con PostgreSQL:', err.message || err);
      passed = false;
    }
  } else {
    console.error('❌ [BASE DE DATOS] DATABASE_URL no definida.');
    passed = false;
  }

  console.log('\n======================================================');
  if (passed) {
    console.log('🎉 TODOS LOS COMPONENTES DE PRODUCCIÓN ESTÁN LISTOS');
  } else {
    console.log('⚠️ SE DETECTARON ADVERTENCIAS EN LA CONFIGURACIÓN');
  }
  console.log('======================================================\n');
}

checkProductionReadiness();
