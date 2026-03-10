# Use an official Node.js LTS image
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy the rest of the application code
COPY . .

# Run the application
CMD ["npm", "start"]
