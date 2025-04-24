import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../src/models/user';
import authRoutes from '../../src/routes/auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.useRealTimers();

describe('Auth Routes', () => {
  let app: express.Application;
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    
    // Configurar servidor MongoDB en memoria para pruebas
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Configurar la aplicación express
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRoutes);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Limpiar todas las colecciones antes de cada prueba
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  // Test de registro y login
  it('should register a user and then login successfully', async () => {
    // Crear un usuario de prueba
    const testUser = {
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: 'Password123!'
    };

    // Registrar el usuario
    await User.create(testUser);

    // Intentar hacer login
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('userId');
    expect(response.headers['set-cookie']).toBeDefined();

    // Verificar que la cookie de autenticación se estableció
    const cookies = response.headers['set-cookie'][0];
    expect(cookies).toContain('auth_token');
  });

  it('should fail login with wrong credentials', async () => {
    // Crear un usuario de prueba
    const testUser = {
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: 'Password123!'
    };

    // Registrar el usuario
    await User.create(testUser);

    // Intentar hacer login con contraseña incorrecta
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: 'WrongPassword123!'
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'Invalid Credentials');
  });

  it('should validate token correctly', async () => {
    // Crear un usuario de prueba
    const testUser = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: 'Password123!'
    });

    // Crear un token JWT para el usuario
    const token = jwt.sign(
      { userId: testUser._id },
      process.env.JWT_SECRET_KEY || 'test_jwt_secret_key',
      { expiresIn: '1h' }
    );

    // Llamar al endpoint de validación de token
    const response = await request(app)
      .get('/api/auth/validate-token')
      .set('Cookie', [`auth_token=${token}`]);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('userId', testUser._id.toString());
  });

  it('should logout correctly', async () => {
    const response = await request(app).post('/api/auth/logout');

    expect(response.status).toBe(200);
    
    // Verificar que la cookie de autenticación se eliminó
    const cookies = response.headers['set-cookie'][0];
    expect(cookies).toContain('auth_token=');
    expect(cookies).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });
});