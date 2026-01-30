# Use Node 18 Alpine as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (only production)
RUN npm install --production

# Copy source code
COPY . .

# Expose port (Matches the port in server.js)
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
