import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../src/models/user';
import userRoutes from '../../src/routes/user';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';

describe('User Routes', () => {
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
    app.use('/api/users', userRoutes);
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

  // Test de registro de usuario
  it('should register a new user successfully', async () => {
    const newUser = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      password: 'Password123!'
    };

    const response = await request(app)
      .post('/api/users/register')
      .send(newUser);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', 'User registered successfully');
    
    // Verificar que el usuario se guardó en la base de datos
    const savedUser = await User.findOne({ email: newUser.email });
    expect(savedUser).not.toBeNull();
    expect(savedUser?.firstName).toBe(newUser.firstName);
    expect(savedUser?.lastName).toBe(newUser.lastName);
  });

  it('should not register user with invalid data', async () => {
    // Falta el firstName
    const invalidUser = {
      lastName: 'Doe',
      email: 'john.doe@example.com',
      password: 'Password123!'
    };

    const response = await request(app)
      .post('/api/users/register')
      .send(invalidUser);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('errors');
  });

  it('should not register user with weak password', async () => {
    const userWithWeakPassword = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      password: 'password' // Sin mayúscula, número ni carácter especial
    };

    const response = await request(app)
      .post('/api/users/register')
      .send(userWithWeakPassword);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('errors');
    
    // Verificar que el mensaje de error menciona los requisitos de contraseña
    const errors = response.body.errors[0].msg;
    expect(errors).toContain('Password should contain at least one uppercase letter');
    expect(errors).toContain('Password should contain at least one numerical digit');
    expect(errors).toContain('Password should contain at least one special character');
  });

  it('should not register user with duplicate email', async () => {
    const user = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      password: 'Password123!'
    };

    // Crear el primer usuario
    await User.create(user);

    // Intentar crear un segundo usuario con el mismo email
    const response = await request(app)
      .post('/api/users/register')
      .send(user);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message', 'The user already exists');
  });

  it('should get user profile with valid token', async () => {
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

    // Obtener el perfil del usuario
    const response = await request(app)
      .get('/api/users/me')
      .set('Cookie', [`auth_token=${token}`]);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('_id', testUser._id.toString());
    expect(response.body).toHaveProperty('email', testUser.email);
    expect(response.body).toHaveProperty('firstName', testUser.firstName);
    expect(response.body).toHaveProperty('lastName', testUser.lastName);
    expect(response.body).not.toHaveProperty('password'); // No debe incluir la contraseña
  });

  it('should not get user profile without token', async () => {
    const response = await request(app).get('/api/users/me');

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('message', 'unauthorized');
  });
});