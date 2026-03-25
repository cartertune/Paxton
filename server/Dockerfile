# Build stage
FROM node:20-slim AS builder

# Install Python and build tools for native dependencies (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy server source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim

# Install Python for better-sqlite3 runtime (needed for fallback to SQLite)
RUN apt-get update && apt-get install -y \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artifacts and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Set environment to production
ENV NODE_ENV=production

# Expose port (Railway will set PORT env var)
EXPOSE 3000

# Start the application
CMD ["node", "dist/index.js"]
