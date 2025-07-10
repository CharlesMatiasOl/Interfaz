// ====================== app.mjs ======================
// Archivo principal de la aplicación AutoReclamo

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import { body, param, validationResult } from 'express-validator';

import {
  guardarReclamo,
  enviarConfirmacion,
  verificarReclamo,
  guardarMensajeContacto,
  enviarCorreoContacto
} from './funciones.mjs';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Pool de conexiones MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// Middlewares globales
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: true }));

/**
 * Captura errores de express-validator y devuelve JSON si hay fallos.
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errores: errors.array() });
  }
  next();
}

// ——— API de AutoReclamo ———

/**
 * Endpoint POST /reclamo
 * Valida datos del reclamo, lo guarda y envía un correo de confirmación.
 */
app.post(
  '/reclamo',
  [
    body('nombre').trim().notEmpty(),
    body('apellido').trim().notEmpty(),
    body('documento').isNumeric().isLength({ min: 7, max: 8 }),
    body('telefono').isNumeric().isLength({ min: 8, max: 15 }),
    body('email').isEmail(),
    body('fechaChoque').isISO8601(),
    body('horaChoque').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body('lugarChoque').trim().notEmpty(),
    body('provincia').trim().notEmpty(),
    body('localidad').trim().notEmpty(),
    body('patente').matches(/^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/).withMessage('Patente inválida. Formato ABC123 o AB123CD.'),
    body('aseguradora').trim().notEmpty(),
    body('nombreInvolucrado').trim().notEmpty(),
    body('apellidoInvolucrado').trim().notEmpty(),
    body('documentoInvolucrado').isNumeric().isLength({ min: 7, max: 8 }),
    body('aseguradoraInvolucrado').trim().notEmpty(),
    body('patenteInvolucrado').matches(/^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/).withMessage('Patente inválida. Formato ABC123 o AB123CD.'),
    body('partes').isArray({ min: 1 }),
    body('descripcionAccidente').trim().notEmpty(),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const datos = req.body;
      const codigo = await guardarReclamo(datos);
      await enviarConfirmacion(datos.email, codigo);
      res.json({ mensaje: 'Reclamo registrado. Código enviado.' });
    } catch (error) {
      console.error('Error al registrar reclamo:', error);
      res.status(500).json({ mensaje: 'Error al registrar reclamo.' });
    }
  }
);

/**
 * Endpoint GET /seguimiento/:codigo
 * Valida el código y devuelve el estado actual del reclamo.
 */
app.get(
  '/seguimiento/:codigo',
  [
    param('codigo').isAlphanumeric().isLength({ min: 6, max: 6 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const estado = await verificarReclamo(req.params.codigo);
      if (!estado) {
        return res.status(404).json({ mensaje: 'Reclamo no encontrado.' });
      }
      res.json({ estado });
    } catch (error) {
      console.error('Error al consultar reclamo:', error);
      res.status(500).json({ mensaje: 'Error al consultar reclamo.' });
    }
  }
);

/**
 * Endpoint POST /contacto
 * Valida datos del formulario de contacto, lo guarda y envía notificación.
 */
app.post(
  '/contacto',
  [
    body('motivoConsulta').trim().notEmpty(),
    body('nombre').trim().isLength({ min: 2, max: 50 }),
    body('apellidos').trim().isLength({ min: 2, max: 50 }),
    body('correo').isEmail(),
    body('comentario').isLength({ min: 10, max: 500 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const datos = req.body;
      await guardarMensajeContacto(datos);
      await enviarCorreoContacto(datos);
      res.json({ mensaje: 'Mensaje recibido.' });
    } catch (error) {
      console.error('Error al procesar contacto:', error);
      res.status(500).json({ mensaje: 'Error al procesar contacto.' });
    }
  }
);

// ——— Rutas de Administración (API interna) ———

app.get('/api/clientes', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nombre, apellido, dni, email FROM clientes'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error listando clientes:', error);
    res.status(500).json({ error: 'Error al listar clientes' });
  }
});

app.get('/api/clientes/:id/reclamos', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM reclamos WHERE cliente_id = ?',
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error listando reclamos por cliente:', error);
    res.status(500).json({ error: 'Error al listar reclamos del cliente' });
  }
});

app.get('/api/reclamos', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM reclamos');
    res.json(rows);
  } catch (error) {
    console.error('Error listando reclamos:', error);
    res.status(500).json({ error: 'Error al listar reclamos' });
  }
});

app.get('/api/reclamos/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM reclamos WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Reclamo no encontrado' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error obteniendo reclamo:', error);
    res.status(500).json({ error: 'Error al obtener reclamo' });
  }
});

app.post('/api/reclamos', async (req, res) => {
  const d = req.body;
  try {
    const [result] = await pool.query(
      `INSERT INTO reclamos
         (cliente_id, fecha_incidente, hora_incidente, direccion, provincia, ciudad,
          patente_vehiculo, compania_seguro, partes_afectadas, descripcion_accidente,
          codigo_confirmacion, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.cliente_id, d.fecha_incidente, d.hora_incidente, d.direccion,
        d.provincia, d.ciudad, d.patente_vehiculo, d.compania_seguro,
        d.partes_afectadas, d.descripcion_accidente,
        d.codigo_confirmacion, d.estado
      ]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    console.error('Error creando reclamo:', error);
    res.status(500).json({ error: 'Error al crear reclamo' });
  }
});

app.put('/api/reclamos/:id', async (req, res) => {
  const d = req.body;
  try {
    await pool.query(
      `UPDATE reclamos SET
         fecha_incidente=?, hora_incidente=?, direccion=?, provincia=?, ciudad=?,
         patente_vehiculo=?, compania_seguro=?, partes_afectadas=?, descripcion_accidente=?, estado=?
       WHERE id = ?`,
      [
        d.fecha_incidente, d.hora_incidente, d.direccion,
        d.provincia, d.ciudad, d.patente_vehiculo, d.compania_seguro,
        d.partes_afectadas, d.descripcion_accidente, d.estado,
        req.params.id
      ]
    );
    res.sendStatus(204);
  } catch (error) {
    console.error('Error actualizando reclamo:', error);
    res.status(500).json({ error: 'Error al actualizar reclamo' });
  }
});

app.delete('/api/reclamos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM reclamos WHERE id = ?', [req.params.id]);
    res.sendStatus(204);
  } catch (error) {
    console.error('Error eliminando reclamo:', error);
    res.status(500).json({ error: 'Error al eliminar reclamo' });
  }
});

// Sirve el frontend (SPA estática) al final
app.use(express.static(path.join(__dirname, '../frontend')));

// Inicia el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
