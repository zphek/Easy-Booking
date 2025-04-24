import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Hotel from '../../src/models/hotel';
import User from '../../src/models/user';
import myBookingsRoutes from '../../src/routes/my-bookings';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';

describe('My Bookings Routes', () => {
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
    
    app.use('/api/my-bookings', myBookingsRoutes);

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

    // Crear un hotel con una reserva para el usuario
    const testHotel = await Hotel.create({
      userId: new mongoose.Types.ObjectId().toString(), // Hotel no pertenece al usuario de prueba
      name: 'Booked Hotel',
      city: 'Test City',
      country: 'Test Country',
      description: 'This is a hotel with bookings',
      type: 'Hotel',
      adultCount: 2,
      childCount: 1,
      facilities: ['WiFi', 'Parking', 'Pool'],
      pricePerNight: 100,
      starRating: 4,
      imageUrls: ['image1.jpg', 'image2.jpg'],
      lastUpdated: new Date(),
      bookings: [
        {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          adultCount: 2,
          childCount: 1,
          checkIn: new Date(),
          checkOut: new Date(Date.now() + 86400000), // mañana
          userId: testUserId, // Reserva pertenece al usuario de prueba
          totalCost: 200
        }
      ]
    });
    testHotelId = testHotel._id.toString();

    // Crear otro hotel con otra reserva para el mismo usuario
    await Hotel.create({
      userId: new mongoose.Types.ObjectId().toString(),
      name: 'Another Booked Hotel',
      city: 'Another City',
      country: 'Another Country',
      description: 'This is another hotel with bookings',
      type: 'Resort',
      adultCount: 2,
      childCount: 1,
      facilities: ['WiFi', 'Spa'],
      pricePerNight: 150,
      starRating: 5,
      imageUrls: ['image3.jpg'],
      lastUpdated: new Date(),
      bookings: [
        {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          adultCount: 1,
          childCount: 0,
          checkIn: new Date(Date.now() + 7 * 86400000), // en una semana
          checkOut: new Date(Date.now() + 10 * 86400000), // en 10 días
          userId: testUserId,
          totalCost: 450
        }
      ]
    });
  });

  // Test para obtener todas las reservas del usuario
  it('should get all bookings for the logged-in user', async () => {
    const response = await request(app)
      .get('/api/my-bookings')
      .set('Cookie', [`auth_token=${authToken}`]);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(2); // Dos hoteles con reservas

    // Verificar que solo se devuelven las reservas del usuario
    response.body.forEach((hotel:any) => {
      expect(hotel.bookings).toHaveLength(1);
      expect(hotel.bookings[0].userId).toBe(testUserId);
    });

    // Verificar los datos de los hoteles
    const hotelNames = response.body.map((hotel:any) => hotel.name);
    expect(hotelNames).toContain('Booked Hotel');
    expect(hotelNames).toContain('Another Booked Hotel');
  });

  // Test de autenticación para obtener reservas
  it('should not allow access to bookings without authentication', async () => {
    const response = await request(app).get('/api/my-bookings');

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('message', 'unauthorized');
  });

  // Test para verificar que solo se devuelven las reservas del usuario
  it('should only return bookings belonging to the logged-in user', async () => {
    // Crear otro usuario con sus propias reservas
    const otherUser = await User.create({
      firstName: 'Other',
      lastName: 'User',
      email: 'other@example.com',
      password: 'Password123!'
    });

    // Añadir reserva de otro usuario al hotel
    await Hotel.findByIdAndUpdate(
      testHotelId,
      {
        $push: {
          bookings: {
            firstName: 'Other',
            lastName: 'User',
            email: 'other@example.com',
            adultCount: 1,
            childCount: 0,
            checkIn: new Date(),
            checkOut: new Date(Date.now() + 86400000),
            userId: otherUser._id.toString(),
            totalCost: 100
          }
        }
      }
    );

    // Obtener reservas del usuario de prueba
    const response = await request(app)
      .get('/api/my-bookings')
      .set('Cookie', [`auth_token=${authToken}`]);

    expect(response.status).toBe(200);
    
    // Verificar que el hotel contiene solo la reserva del usuario autenticado
    const testHotelBookings = response.body.find((hotel:any) => hotel._id === testHotelId).bookings;
    expect(testHotelBookings).toHaveLength(1);
    expect(testHotelBookings[0].userId).toBe(testUserId);

    // Verificar que no se incluyen reservas de otros usuarios
    response.body.forEach((hotel:any) => {
      hotel.bookings.forEach((booking:any) => {
        expect(booking.userId).toBe(testUserId);
      });
    });
  });

  // Test para manejar el caso de no tener reservas
  it('should return empty array when user has no bookings', async () => {
    // Limpiar todas las reservas existentes
    await Hotel.updateMany({}, { $set: { bookings: [] } });

    const response = await request(app)
      .get('/api/my-bookings')
      .set('Cookie', [`auth_token=${authToken}`]);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(0);
  });

  // Test para verificar detalles completos de las reservas
  it('should include all booking details in the response', async () => {
    const response = await request(app)
      .get('/api/my-bookings')
      .set('Cookie', [`auth_token=${authToken}`]);

    expect(response.status).toBe(200);
    
    // Verificar que cada reserva tiene todos los campos esperados
    response.body.forEach((hotel:any) => {
      hotel.bookings.forEach((booking:any) => {
        expect(booking).toHaveProperty('firstName');
        expect(booking).toHaveProperty('lastName');
        expect(booking).toHaveProperty('email');
        expect(booking).toHaveProperty('adultCount');
        expect(booking).toHaveProperty('childCount');
        expect(booking).toHaveProperty('checkIn');
        expect(booking).toHaveProperty('checkOut');
        expect(booking).toHaveProperty('userId');
        expect(booking).toHaveProperty('totalCost');
      });

      // Verificar que el hotel tiene información completa
      expect(hotel).toHaveProperty('name');
      expect(hotel).toHaveProperty('city');
      expect(hotel).toHaveProperty('country');
      expect(hotel).toHaveProperty('imageUrls');
    });
  });
});