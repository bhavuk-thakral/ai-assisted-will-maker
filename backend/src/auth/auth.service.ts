import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string) {
    // Check if user already exists
    const existingUsers = await this.db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUsers.length > 0) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Create user and a default will record inside a transaction
    await this.db.transaction(async (client) => {
      // Insert user
      const userResult = await client.query(
        'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id',
        [email, hashedPassword]
      );
      const userId = userResult.rows[0].id;

      // Insert blank will
      await client.query(
        'INSERT INTO wills (user_id, status) VALUES ($1, $2)',
        [userId, 'IN_PROGRESS']
      );
    });

    return { success: true, message: 'User registered successfully' };
  }

  async login(email: string, password: string) {
    // Retrieve user
    const users = await this.db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (users.length === 0) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = users[0];
    
    // Check password
    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate JWT
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
      }
    };
  }
}
