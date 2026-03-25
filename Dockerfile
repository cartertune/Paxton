# Build stage
FROM node:20-slim AS builder

# Install Python and build tools for native dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies
RUN cd server && npm ci
RUN cd client && npm ci

# Copy source code
COPY server ./server
COPY client ./client

# Build both server and client
RUN cd server && npm run build
RUN cd client && npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy built artifacts and dependencies
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/package*.json ./server/
COPY --from=builder /app/client/dist ./client/dist

# Set environment to production
ENV NODE_ENV=production

# Expose port (Railway will set PORT env var)
EXPOSE 3000

# Start the application
CMD ["node", "server/dist/index.js"]
