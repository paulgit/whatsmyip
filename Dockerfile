# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS deps
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM gcr.io/distroless/nodejs24-debian12:nonroot AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy only runtime essentials
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./
COPY server.js ./server.js
COPY public ./public

# Expose port
EXPOSE 3000

# Distroless image entrypoint is Node, so pass script path
CMD ["server.js"]
