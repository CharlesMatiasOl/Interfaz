// Importación de módulos necesarios
import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Configuración de variables de entorno
dotenv.config();

// Configuración de la conexión a la base de datos
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ============================Funciones de Reclamo============================//


//Genera un código de confirmación aleatorio para el reclamo.
 
function generarCodigo() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

//Guarda el reclamo en la base de datos.

export async function guardarReclamo(datos) {
  try {
    // Obtiene una conexión del pool
    const connection = await pool.getConnection();

    // Verifica si el cliente ya existe en la base de datos
    const [rows] = await connection.execute(
      'SELECT id FROM clientes WHERE dni = ?',
      [datos.documento]
    );

    let clienteId;
    if (rows.length > 0) {
      // Si el cliente existe, obtiene su ID
      clienteId = rows[0].id;
    } else {
      // Si no existe, lo inserta en la tabla 'clientes'
      const [result] = await connection.execute(
        'INSERT INTO clientes (nombre, apellido, dni, telefono, email) VALUES (?, ?, ?, ?, ?)',
        [datos.nombre, datos.apellido, datos.documento, datos.telefono, datos.email]
      );
      clienteId = result.insertId; // Obtiene el ID del nuevo cliente
    }

    // Genera un código de confirmación único para el reclamo
    const codigoConfirmacion = generarCodigo();

    // Inserta el reclamo en la tabla 'reclamos'
    await connection.execute(
      `INSERT INTO reclamos (
          cliente_id,
          fecha_incidente,
          hora_incidente,
          direccion,
          provincia,
          ciudad,
          patente_vehiculo,
          compania_seguro,
          otro_nombre,
          otro_apellido,
          otro_dni,
          otro_patente,
          otro_compania_seguro,
          partes_afectadas,
          descripcion_accidente,
          codigo_confirmacion,
          estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clienteId,
        datos.fechaChoque,
        datos.horaChoque,
        datos.lugarChoque,
        datos.provincia,
        datos.localidad,
        datos.patente,
        datos.aseguradora,
        datos.nombreInvolucrado,
        datos.apellidoInvolucrado,
        datos.documentoInvolucrado,
        datos.patenteInvolucrado,
        datos.aseguradoraInvolucrado,
        datos.partes.join(', '), // Convierte el array de partes en una cadena
        datos.descripcionAccidente,
        codigoConfirmacion,
        'Ingresado' // Estado inicial del reclamo
      ]
    );

    // Libera la conexión
    connection.release();

    // Devuelve el código de confirmación generado
    return codigoConfirmacion;
  } catch (error) {
    console.error('Error al guardar el reclamo:', error);
    throw error;
  }
}

//Envía un correo electrónico de confirmación al usuario con el código de reclamo.

export async function enviarConfirmacion(email, codigoConfirmacion) {
  try {
    // Configuración del transportador de correo electrónico
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER, // Correo electrónico del remitente (desde variables de entorno)
        pass: process.env.EMAIL_PASS, // Contraseña o token de aplicación (desde variables de entorno)
      },
      tls: {
        rejectUnauthorized: false, // Permite certificados TLS no verificados
      },
    });

    // Configuración del correo electrónico a enviar
    const mailOptions = {
      from: `"AutoReclamo" <${process.env.EMAIL_USER}>`, // Remitente
      to: email, // Destinatario
      subject: 'Confirmación de Reclamo - AutoReclamo', // Asunto
      html: `
        <p>Gracias por presentar su reclamo en AutoReclamo.</p>
        <p>Su código de reclamo es: <strong>${codigoConfirmacion}</strong></p>
        <p>Utilice este código para consultar el estado de su reclamo en nuestro sitio web.</p>
      `,
    };

    // Envía el correo electrónico
    await transporter.sendMail(mailOptions);
    console.log('Correo de confirmación enviado a:', email);
  } catch (error) {
    console.error('Error al enviar el correo de confirmación:', error);
    throw error;
  }
}

// ============================Funciones del Estado del Reclamo============================//

//Verifica el estado actual de un reclamo basado en el código de confirmación.

export async function verificarReclamo(codigo) {
  try {
    // Obtiene una conexión del pool
    const connection = await pool.getConnection();

    // Consulta el estado del reclamo en la base de datos
    const [rows] = await connection.execute(
      'SELECT estado FROM reclamos WHERE codigo_confirmacion = ?',
      [codigo]
    );

    // Libera la conexión
    connection.release();

    if (rows.length > 0) {
      // Si se encuentra el reclamo, devuelve su estado
      return rows[0].estado;
    } else {
      // Si no se encuentra, devuelve null
      return null;
    }
  } catch (error) {
    console.error('Error al verificar el reclamo:', error);
    throw error;
  }
}

// ============================Funciones de Contacto============================//

//Guarda el mensaje de contacto en la base de datos.

export async function guardarMensajeContacto(datos) {
  try {
    // Obtiene una conexión del pool
    const connection = await pool.getConnection();

    // Inserta el mensaje de contacto en la tabla 'mensajes_contacto'
    await connection.execute(
      `INSERT INTO mensajes_contacto (
          motivo_consulta,
          nombre,
          apellidos,
          correo,
          comentario
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        datos.motivoConsulta,
        datos.nombre,
        datos.apellidos,
        datos.correo,
        datos.comentario
      ]
    );

    // Libera la conexión
    connection.release();
    console.log('Mensaje de contacto guardado en la base de datos.');
  } catch (error) {
    console.error('Error al guardar el mensaje de contacto:', error);
    throw error;
  }
}

//Envía el mensaje de contacto por correo electrónico al equipo de soporte.

export async function enviarCorreoContacto(datos) {
  try {
    // Configuración del transportador de correo electrónico
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER, // Correo electrónico del remitente 
        pass: process.env.EMAIL_PASS, // Contraseña o token de aplicación 
      },
      tls: {
        rejectUnauthorized: false, // Permite certificados TLS no verificados
      },
    });

    // Configuración del correo electrónico a enviar
    const mailOptions = {
      from: `"AutoReclamo" <${process.env.EMAIL_USER}>`, // Remitente
      to: process.env.EMAIL_USER, // Destinatario (puede ser el mismo correo del remitente o uno específico para soporte)
      subject: `Nuevo mensaje de contacto - ${datos.motivoConsulta}`, // Asunto
      html: `
        <p>Has recibido un nuevo mensaje de contacto:</p>
        <p><strong>Nombre:</strong> ${datos.nombre} ${datos.apellidos}</p>
        <p><strong>Correo:</strong> ${datos.correo}</p>
        <p><strong>Motivo de consulta:</strong> ${datos.motivoConsulta}</p>
        <p><strong>Comentario:</strong></p>
        <p>${datos.comentario}</p>
      `,
    };

    // Envía el correo electrónico
    await transporter.sendMail(mailOptions);
    console.log('Correo de contacto enviado.');
  } catch (error) {
    console.error('Error al enviar el correo de contacto:', error);
    throw error;
  }
}



// ================== NUEVO EN funciones.mjs ==================
export async function obtenerEstadisticasReclamos() {
  const conn = await pool.getConnection();
  try {
    // total
    const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM reclamos');

    // por estado
    const [rows] = await conn.query(`
      SELECT estado, COUNT(*) AS cantidad
      FROM reclamos
      GROUP BY estado
    `);

    // Normalizo a 0 si falta alguno
    const estados = {
      'Ingresado': 0,
      'En revisión': 0,
      'Aprobación': 0,
      'Reclamación': 0,
      'Gestión de pago': 0,
      'Reclamo finalizado': 0,
    };
    for (const r of rows) {
      if (estados.hasOwnProperty(r.estado)) estados[r.estado] = Number(r.cantidad) || 0;
    }

    return {
      total: Number(total) || 0,
      porEstado: {
        ingresado: estados['Ingresado'],
        enRevision: estados['En revisión'],
        aprobacion: estados['Aprobación'],
        reclamacion: estados['Reclamación'],
        gestionPago: estados['Gestión de pago'],
        finalizado: estados['Reclamo finalizado'],
      }
    };
  } finally {
    conn.release();
  }
}
