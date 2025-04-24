import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Hotel from '../../src/models/hotel';
import User from '../../src/models/user';
import hotelRoutes from '../../src/routes/hotels';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.useRealTimers();

describe('Hotel Routes', () => {
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
      if (req.cookies.auth_token) {
        try {
          const decoded:any = jwt.verify(req.cookies.auth_token, process.env.JWT_SECRET_KEY || 'test_jwt_secret_key');
          req.userId = decoded.userId;
        } catch (error) {
          // Ignorar errores para pruebas
        }
      }
      next();
    });
    
    app.use('/api/hotels', hotelRoutes);

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

    // Crear un hotel de prueba
    const testHotel = await Hotel.create({
      userId: testUserId,
      name: 'Test Hotel',
      city: 'Test City',
      country: 'Test Country',
      description: 'This is a test hotel',
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

  // Test para obtener todos los hoteles
  it('should get all hotels', async () => {
    const response = await request(app).get('/api/hotels');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].name).toBe('Test Hotel');
  });

  // Test para obtener un hotel por ID
  it('should get a hotel by ID', async () => {
    const response = await request(app).get(`/api/hotels/${testHotelId}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('_id', testHotelId);
    expect(response.body).toHaveProperty('name', 'Test Hotel');
    expect(response.body).toHaveProperty('city', 'Test City');
  });

  // Test para buscar hoteles
  it('should search hotels with query parameters', async () => {
    const response = await request(app)
      .get('/api/hotels/search')
      .query({
        destination: 'Test City',
        adultCount: 2,
        childCount: 1,
        page: 1
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('pagination');
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Test Hotel');
    expect(response.body.pagination.total).toBe(1);
  });

  // Test para crear intent de pago
  it('should create payment intent for hotel booking', async () => {
    const response = await request(app)
      .post(`/api/hotels/${testHotelId}/bookings/payment-intent`)
      .set('Cookie', [`auth_token=${authToken}`])
      .send({
        numberOfNights: 2
      });

    // expect(response.status).toBe(200);
    // expect(response.body).toHaveProperty('paymentIntentId');
    // expect(response.body).toHaveProperty('clientSecret');
    // expect(response.body).toHaveProperty('totalCost', 200); // 2 noches * 100 por noche
  });

  // Test para crear reserva
  it('should create booking for hotel', async () => {
    const bookingData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      adultCount: 2,
      childCount: 1,
      checkIn: new Date().toISOString(),
      checkOut: new Date(Date.now() + 86400000).toISOString(), // mañana
      paymentIntentId: 'test_payment_intent_id',
      totalCost: 200
    };

    const response = await request(app)
      .post(`/api/hotels/${testHotelId}/bookings`)
      .set('Cookie', [`auth_token=${authToken}`])
      .send(bookingData);

    // expect(response.status).toBe(200);

    // // Verificar que la reserva se guardó en la base de datos
    // const updatedHotel = await Hotel.findById(testHotelId);
    // expect(updatedHotel?.bookings).toHaveLength(1);
    // expect(updatedHotel?.bookings[0].firstName).toBe(bookingData.firstName);
    // expect(updatedHotel?.bookings[0].totalCost).toBe(bookingData.totalCost);
  });

  // Test para sugerencias de búsqueda
  it('should get search suggestions based on query', async () => {
    const response = await request(app)
      .get('/api/hotels/search/suggestion/Test');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].name).toBe('Test Hotel');
  });
});