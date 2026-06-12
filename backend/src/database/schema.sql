-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create wills table
CREATE TABLE IF NOT EXISTS wills (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    age INTEGER,
    address TEXT,
    executor_name VARCHAR(255),
    guardian_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'IN_PROGRESS'
);

-- Create assets table
CREATE TABLE IF NOT EXISTS assets (
    id SERIAL PRIMARY KEY,
    will_id INTEGER REFERENCES wills(id) ON DELETE CASCADE,
    asset_name VARCHAR(255) NOT NULL
);

-- Create beneficiaries table
CREATE TABLE IF NOT EXISTS beneficiaries (
    id SERIAL PRIMARY KEY,
    will_id INTEGER REFERENCES wills(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    relationship VARCHAR(255) NOT NULL,
    share_percentage NUMERIC NOT NULL
);

-- Create witnesses table
CREATE TABLE IF NOT EXISTS witnesses (
    id SERIAL PRIMARY KEY,
    will_id INTEGER REFERENCES wills(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    will_id INTEGER REFERENCES wills(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    message TEXT NOT NULL
);

-- Seed data for demo user
-- password: 123456 (hashed with bcryptjs: $2b$10$cRFImhQHS84eA/X1eUuADuuXzpP/8It5nGBtJQ.RddasDIZ.zQ9Bq)
INSERT INTO users (email, password)
VALUES ('demo@test.com', '$2b$10$cRFImhQHS84eA/X1eUuADuuXzpP/8It5nGBtJQ.RddasDIZ.zQ9Bq')
ON CONFLICT (email) DO NOTHING;

-- Seed default will for the demo user if they don't already have one
INSERT INTO wills (user_id, status)
SELECT id, 'IN_PROGRESS' 
FROM users 
WHERE email = 'demo@test.com'
AND NOT EXISTS (
    SELECT 1 FROM wills w JOIN users u ON w.user_id = u.id WHERE u.email = 'demo@test.com'
)
ON CONFLICT DO NOTHING;
