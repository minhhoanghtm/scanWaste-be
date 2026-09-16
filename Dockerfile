FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose HTTP port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Start application
CMD ["npm", "start"]
