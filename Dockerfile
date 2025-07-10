# Use a Node.js base image
FROM node:lts-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
