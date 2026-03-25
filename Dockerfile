# Use the official lightweight Node.js 20 Alpine image
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the application (if applicable)
# RUN npm run build # Uncomment if you have a build step

# Command to run the application
CMD ["npm", "start"]
