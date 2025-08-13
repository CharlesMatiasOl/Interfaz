#!/usr/bin/env node
import 'dotenv/config';
import express from 'express';
import path from 'path';

const app = express();
app.use(express.static(path.join(process.cwd(), 'public')));

const PORT = parseInt(process.env.ADMIN_PORT, 10) || 8082;

app.listen(PORT, () => {
  console.log(`Admin Dashboard corriendo en http://localhost:${PORT}`);
});
