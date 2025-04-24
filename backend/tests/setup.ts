import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, jest } from '@jest/globals';

// Configurar variables de entorno para pruebas
dotenv.config({ path: '.env.test' });

jest.useRealTimers();

// Incrementar el tiempo de espera para pruebas asíncronas
jest.setTimeout(30000);

// Suprimir logs de consola durante las pruebas
global.console.log = jest.fn();
global.console.error = jest.fn();
global.console.warn = jest.fn();

// Conectar a una base de datos de prueba antes de ejecutar cualquier prueba
beforeAll(async () => {
  if (!process.env.MONGODB_TEST_URI) {
    console.log('MONGODB_TEST_URI no está definido en .env.test');
  }
  
  await mongoose.connect("mongodb+srv://maverickUser:c9f5TdlLZCxDisgO@cluster0.xi11h.mongodb.net/reservation-testing-bd?retryWrites=true&w=majority&appName=Cluster0");
});

// Cerrar la conexión a la base de datos después de todas las pruebas
afterAll(async () => {
  await mongoose.connection.close();
});

// Limpiar todas las colecciones después de cada prueba
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});