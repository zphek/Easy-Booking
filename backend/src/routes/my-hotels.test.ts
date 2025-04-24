import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Hotel from '../models/hotel';
import User from '../models/user';
import myHotelRoutes from './my-hotels';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.useRealTimers();

describe('My Hotels Routes', () => {
  let app: express.Application;
  let mongoServer: MongoMemoryServer;
  let testUserId: string;
  let authToken: string;
  let testHotelId: string;

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
    
    // Middleware para simular la autenticación
    app.use((req, res, next) => {
      if (req.cookies && req.cookies.auth_token) {
        try {
          const decoded:any = jwt.verify(req.cookies.auth_token, process.env.JWT_SECRET_KEY || 'test_jwt_secret_key');
          req.userId = decoded.userId;
        } catch (error) {
          // Ignorar errores para pruebas
        }
      }
      next();
    });
    
    app.use('/api/my-hotels', myHotelRoutes);

    // Crear un usuario de prueba
    const testUser = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: 'Password123!'
    });
    testUserId = testUser._id.toString();

    // Crear token de autenticación
    authToken = jwt.sign(
      { userId: testUserId },
      process.env.JWT_SECRET_KEY || 'test_jwt_secret_key',
      { expiresIn: '1h' }
    );
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

    // Crear un hotel de prueba para el usuario
    const testHotel = await Hotel.create({
      userId: testUserId,
      name: 'My Test Hotel',
      city: 'Test City',
      country: 'Test Country',
      description: 'This is my test hotel',
      type: 'Hotel',
      adultCount: 2,
      childCount: 1,
      facilities: ['WiFi', 'Parking', 'Pool'],
      pricePerNight: 100,
      starRating: 4,
      imageUrls: ['image1.jpg', 'image2.jpg'],
      lastUpdated: new Date(),
      bookings: []
    });
    testHotelId = testHotel._id.toString();
  });

  // Test para obtener los hoteles del usuario
  it('should get all hotels for the logged-in user', async () => {
    const response = await request(app)
      .get('/api/my-hotels')
      .set('Cookie', [`auth_token=${authToken}`]);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].name).toBe('My Test Hotel');
    expect(response.body[0].userId).toBe(testUserId);
  });

  // Test para obtener un hotel específico del usuario
  it('should get a specific hotel for the logged-in user', async () => {
    const response = await request(app)
      .get(`/api/my-hotels/${testHotelId}`)
      .set('Cookie', [`auth_token=${authToken}`]);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('_id', testHotelId);
    expect(response.body).toHaveProperty('name', 'My Test Hotel');
    expect(response.body).toHaveProperty('userId', testUserId);
  });

  // Test para crear un nuevo hotel
  // it('should create a new hotel for the logged-in user', async () => {
  //   const newHotelData = {
  //     name: 'New Hotel',
  //     city: 'New City',
  //     country: 'New Country',
  //     description: 'This is a new hotel',
  //     type: 'Resort',
  //     adultCount: 3,
  //     childCount: 2,
  //     facilities: ['WiFi', 'Parking', 'Gym'],
  //     pricePerNight: 150,
  //     starRating: 5,
  //     imageFiles: [] // Será manejado por el mock de multer
  //   };

  //   const response = await request(app)
  //     .post('/api/my-hotels')
  //     .set('Cookie', [`auth_token=${authToken}`])
  //     .send(newHotelData);

  //   expect(response.status).toBe(201);
  //   expect(response.body).toHaveProperty('_id');
  //   expect(response.body).toHaveProperty('name', newHotelData.name);
  //   expect(response.body).toHaveProperty('userId', testUserId);
  //   expect(response.body).toHaveProperty('imageUrls');
  //   expect(response.body.imageUrls[0]).toBe('https://test-image-url.com/image.jpg');

  //   // Verificar que el hotel se guardó en la base de datos
  //   const hotelsCount = await Hotel.countDocuments({ userId: testUserId });
  //   expect(hotelsCount).toBe(2); // El hotel de prueba y el nuevo
  // });

  // Test para actualizar un hotel existente
  // it('should update an existing hotel for the logged-in user', async () => {
  //   const updatedData = {
  //     name: 'Updated Hotel Name',
  //     city: 'Updated City',
  //     country: 'Test Country',
  //     description: 'This is an updated description',
  //     type: 'Hotel',
  //     adultCount: 2,
  //     childCount: 1,
  //     facilities: ['WiFi', 'Parking', 'Pool', 'Gym'],
  //     pricePerNight: 120,
  //     starRating: 5,
  //     imageUrls: ['image1.jpg'] // Mantener una imagen existente y añadir una nueva
  //   };

  //   const response = await request(app)
  //     .put(`/api/my-hotels/${testHotelId}`)
  //     .set('Cookie', [`auth_token=${authToken}`])
  //     .send(updatedData);

  //   expect(response.status).toBe(201);
  //   expect(response.body).toHaveProperty('_id', testHotelId);
  //   expect(response.body).toHaveProperty('name', updatedData.name);
  //   expect(response.body).toHaveProperty('city', updatedData.city);
  //   expect(response.body).toHaveProperty('pricePerNight', updatedData.pricePerNight);
  //   expect(response.body).toHaveProperty('imageUrls');
  //   expect(response.body.imageUrls).toContain('https://test-image-url.com/image.jpg');
  //   expect(response.body.imageUrls).toContain('image1.jpg');

  //   // Verificar que el hotel se actualizó en la base de datos
  //   const updatedHotel = await Hotel.findById(testHotelId);
  //   expect(updatedHotel?.name).toBe(updatedData.name);
  //   expect(updatedHotel?.pricePerNight).toBe(updatedData.pricePerNight);
  // });

  // Test para intentar acceder a un hotel de otro usuario
  it('should not allow access to hotels of other users', async () => {
    // Crear otro usuario
    const otherUser = await User.create({
      firstName: 'Other',
      lastName: 'User',
      email: 'other@example.com',
      password: 'Password123!'
    });

    // Crear un hotel para el otro usuario
    const otherHotel = await Hotel.create({
      userId: otherUser._id.toString(),
      name: 'Other User Hotel',
      city: 'Other City',
      country: 'Other Country',
      description: 'This is another user hotel',
      type: 'Hotel',
      adultCount: 2,
      childCount: 1,
      facilities: ['WiFi'],
      pricePerNight: 100,
      starRating: 3,
      imageUrls: ['image1.jpg'],
      lastUpdated: new Date(),
      bookings: []
    });

    // Intentar acceder al hotel del otro usuario
    const response = await request(app)
      .get(`/api/my-hotels/${otherHotel._id}`)
      .set('Cookie', [`auth_token=${authToken}`]);

    // Debería devolver null ya que el hotel no pertenece al usuario autenticado
    expect(response.body).toBeNull();
  });

  // Test para validación de datos al crear un hotel
  it('should validate required fields when creating a hotel', async () => {
    // Datos de hotel incompletos (falta el nombre)
    const incompleteHotelData = {
      // name: 'Missing Name',
      city: 'Test City',
      country: 'Test Country',
      description: 'Incomplete hotel data',
      type: 'Hotel',
      adultCount: 2,
      childCount: 1,
      facilities: ['WiFi'],
      pricePerNight: 100,
      starRating: 4
    };

    const response = await request(app)
      .post('/api/my-hotels')
      .set('Cookie', [`auth_token=${authToken}`])
      .send(incompleteHotelData);

    expect(response.status).toBe(500); // O código de error de validación específico
  });
});